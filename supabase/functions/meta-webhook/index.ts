// ============================================================================
// FUNÇÃO "meta-webhook" (quem recebe as mensagens do Instagram/Messenger)
// ============================================================================
// O que ela faz: é o endereço que você cadastra lá no Meta for Developers
// como "Webhook". Toda vez que alguém manda uma mensagem pro seu Instagram
// ou pra sua Página do Facebook, o Meta chama esta função. Ela olha suas
// automações (tabela automacoes_regras), decide se alguma se encaixa, e se
// sim, responde a pessoa automaticamente pela API do Meta. Tudo fica
// registrado na tabela automacoes_mensagens.
//
// Diferença importante pra "enviar-emails": aquela função é chamada por
// VOCÊ, logada no admin. Esta aqui é chamada pelo PRÓPRIO META, sem login
// nenhum — por isso ela precisa ser publicada com a verificação de login do
// Supabase desligada (--no-verify-jwt, ou "Verificar JWT: desligado" se
// publicar pelo site do Supabase). No lugar do login, quem garante que é
// mesmo o Meta chamando é a assinatura no cabeçalho X-Hub-Signature-256,
// conferida abaixo com o App Secret certo.
//
// O Meta separou o Instagram num app próprio ("API do Instagram"), com App
// Secret e token de acesso diferentes dos que você usa pro Messenger. Por
// isso esta função guarda dois pares (um do app principal, pro Messenger, e
// um do app do Instagram) e usa o par certo dependendo de quem está
// chamando — a assinatura é conferida contra os dois secrets até achar o
// que bate, e o envio da resposta usa o token e o endereço certos pra cada
// canal.
//
// Como ela fala com o banco sem você estar logada: usando a chave de
// serviço (SUPABASE_SERVICE_ROLE_KEY), que o Supabase já injeta sozinho em
// toda Edge Function — você não precisa configurar nada a mais. Essa chave
// tem acesso total, então NUNCA deve ser usada em nenhuma página que o
// navegador carrega, só aqui dentro de uma função de servidor.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSAO_GRAPH_API_MESSENGER = "v20.0";
const VERSAO_GRAPH_API_INSTAGRAM = "v21.0";

function respostaJSON(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Compara duas strings sem "vazar" quanto tempo levou (evita um jeito bem
// teórico de adivinhar a assinatura certa comparando letra por letra).
function assinaturasIguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

async function calcularAssinatura(appSecret: string, corpoCru: string) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoCru));
  return Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Vê, sem diferenciar maiúscula/minúscula, se alguma das palavras do
// "gatilho" (separadas por vírgula) aparece dentro do texto recebido.
function algumaPalavraBate(gatilho: string | null, textoRecebido: string) {
  if (!gatilho) return false;
  const texto = textoRecebido.toLowerCase();
  return gatilho
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
    .some((palavra) => texto.indexOf(palavra) !== -1);
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, chaveServico);

  // ---- GET: handshake de verificação do webhook (feito uma vez, quando você cadastra a URL no Meta) ----
  if (req.method === "GET") {
    const url = new URL(req.url);
    const modo = url.searchParams.get("hub.mode");
    const tokenRecebido = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge") || "";

    const { data: config } = await supabase.from("automacoes_config").select("verify_token").eq("id", 1).maybeSingle();

    if (modo === "subscribe" && config?.verify_token && tokenRecebido === config.verify_token) {
      return new Response(desafio, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return respostaJSON({ erro: "Verificação falhou." }, 403);
  }

  if (req.method !== "POST") {
    return respostaJSON({ erro: "Método não permitido." }, 405);
  }

  // ---- POST: mensagem nova chegando ----
  const corpoCru = await req.text();

  const { data: config } = await supabase
    .from("automacoes_config")
    .select("app_secret, token_acesso_pagina, instagram_app_secret, instagram_token_acesso")
    .eq("id", 1)
    .maybeSingle();

  if (!config?.app_secret && !config?.instagram_app_secret) {
    // Ainda não configurou nenhuma conexão na aba Automações — não dá pra
    // conferir a assinatura nem responder ninguém. Devolve 200 pro Meta não
    // ficar tentando de novo sem parar, mas não processa a mensagem.
    return respostaJSON({ ok: false, motivo: "Conexão com o Meta ainda não configurada." });
  }

  const assinaturaRecebida = req.headers.get("x-hub-signature-256") || "";
  const bateComAppPrincipal = config?.app_secret
    ? assinaturasIguais("sha256=" + (await calcularAssinatura(config.app_secret, corpoCru)), assinaturaRecebida)
    : false;
  const bateComAppInstagram = config?.instagram_app_secret
    ? assinaturasIguais("sha256=" + (await calcularAssinatura(config.instagram_app_secret, corpoCru)), assinaturaRecebida)
    : false;

  if (!bateComAppPrincipal && !bateComAppInstagram) {
    return respostaJSON({ erro: "Assinatura inválida." }, 401);
  }

  // A partir daqui, qualquer erro de processamento é só logado: sempre
  // respondemos 200 pro Meta, senão ele pode desativar o webhook sozinho.
  try {
    const corpo = JSON.parse(corpoCru);
    const canal: "instagram" | "messenger" = corpo?.object === "instagram" ? "instagram" : "messenger";

    const { data: regras } = await supabase
      .from("automacoes_regras")
      .select("*")
      .eq("canal", canal)
      .eq("ativo", true)
      .order("id", { ascending: true });

    const regrasPalavraChave = (regras || []).filter((r) => r.tipo === "palavra_chave");
    const regraBoasVindas = (regras || []).find((r) => r.tipo === "boas_vindas");
    const regraAusencia = (regras || []).find((r) => r.tipo === "ausencia");

    const entradas = Array.isArray(corpo?.entry) ? corpo.entry : [];

    for (const entrada of entradas) {
      const eventos = Array.isArray(entrada?.messaging) ? entrada.messaging : [];

      for (const evento of eventos) {
        // "is_echo" é o próprio Meta reenviando pra você a mensagem que a
        // SUA página mandou — se não pular isso, a automação entra num
        // looping respondendo a si mesma.
        if (evento?.message?.is_echo) continue;

        const remetenteId: string | undefined = evento?.sender?.id;
        const textoRecebido: string = evento?.message?.text || "";
        if (!remetenteId) continue;

        let regraEscolhida = regrasPalavraChave.find((r) => algumaPalavraBate(r.gatilho, textoRecebido));

        if (!regraEscolhida && regraBoasVindas) {
          const { data: mensagemAnterior } = await supabase
            .from("automacoes_mensagens")
            .select("id")
            .eq("remetente_id", remetenteId)
            .eq("canal", canal)
            .limit(1)
            .maybeSingle();
          if (!mensagemAnterior) regraEscolhida = regraBoasVindas;
        }

        if (!regraEscolhida && regraAusencia) regraEscolhida = regraAusencia;

        if (!regraEscolhida) {
          await supabase.from("automacoes_mensagens").insert({
            canal,
            remetente_id: remetenteId,
            texto_recebido: textoRecebido,
            regra_id: null,
            resposta_enviada: null,
            status: "sem_regra",
          });
          continue;
        }

        const tokenParaEnviar = canal === "instagram" ? config.instagram_token_acesso : config.token_acesso_pagina;
        if (!tokenParaEnviar) {
          await supabase.from("automacoes_mensagens").insert({
            canal,
            remetente_id: remetenteId,
            texto_recebido: textoRecebido,
            regra_id: regraEscolhida.id,
            resposta_enviada: null,
            status: "erro",
            erro: canal === "instagram" ? "Token de acesso do Instagram não configurado." : "Token de acesso da Página não configurado.",
          });
          continue;
        }

        const urlEnvio = canal === "instagram"
          ? `https://graph.instagram.com/${VERSAO_GRAPH_API_INSTAGRAM}/me/messages?access_token=${encodeURIComponent(tokenParaEnviar)}`
          : `https://graph.facebook.com/${VERSAO_GRAPH_API_MESSENGER}/me/messages?access_token=${encodeURIComponent(tokenParaEnviar)}`;

        try {
          const respostaGraph = await fetch(urlEnvio, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: { id: remetenteId }, message: { text: regraEscolhida.resposta } }),
          });
          const corpoGraph = await respostaGraph.json().catch(() => ({}));

          await supabase.from("automacoes_mensagens").insert({
            canal,
            remetente_id: remetenteId,
            texto_recebido: textoRecebido,
            regra_id: regraEscolhida.id,
            resposta_enviada: respostaGraph.ok ? regraEscolhida.resposta : null,
            status: respostaGraph.ok ? "ok" : "erro",
            erro: respostaGraph.ok ? null : (corpoGraph?.error?.message || "Erro desconhecido do Meta"),
          });
        } catch (erroEnvio) {
          await supabase.from("automacoes_mensagens").insert({
            canal,
            remetente_id: remetenteId,
            texto_recebido: textoRecebido,
            regra_id: regraEscolhida.id,
            resposta_enviada: null,
            status: "erro",
            erro: erroEnvio instanceof Error ? erroEnvio.message : "Erro desconhecido ao chamar o Meta",
          });
        }
      }
    }
  } catch (erro) {
    console.error("Erro processando webhook do Meta:", erro);
  }

  return respostaJSON({ ok: true });
});
