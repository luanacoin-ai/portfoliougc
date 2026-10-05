// ============================================================================
// FUNÇÃO "enviar-emails" (o carteiro)
// ============================================================================
// O que ela faz: recebe uma lista de marcas, troca {{nome}} e {{marca}} pelo
// nome de cada uma, e manda um e-mail por vez pelo Resend, indo devagar pra
// não estourar o limite do Resend.
//
// Ela também sabe PROGRAMAR um disparo pra uma data e hora (o Resend guarda o
// e-mail e manda na hora marcada, mesmo com o admin fechado) e CANCELAR um
// disparo programado que ainda não saiu.
//
// Onde a chave do Resend mora: NUNCA neste arquivo. Ela fica guardada como
// segredo desta função, dentro do painel do Supabase, com o nome
// RESEND_API_KEY. Aqui a gente só lê ela de Deno.env.get("RESEND_API_KEY"),
// nunca escreve o valor dela em lugar nenhum.
//
// Quem pode chamar esta função: só você, logada no seu admin com o e-mail
// luanacoin@gmail.com. Qualquer outra pessoa (ou pedido sem login) recebe
// recusa antes de qualquer e-mail ser mandado.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- ajustes fixos deste disparo ----
const EMAIL_PERMITIDO = "luanacoin@gmail.com";   // só esta pessoa pode disparar
const EMAIL_RESPOSTA = "contato@luanacoin.com";   // pra onde as respostas das marcas vão (reply-to)
// Quem aparece como remetente, pras marcas e também no teste pra você mesma.
// O domínio luanacoin.com já está verificado no Resend, então este endereço
// funciona pra qualquer destinatário.
const REMETENTE = "Luana Coin <contato@luanacoin.com>";
const MAXIMO_POR_CHAMADA = 250;                   // limite de segurança por chamada
const ESPERA_ENTRE_ENVIOS_MS = 200;               // ~5 e-mails por segundo, ritmo seguro do Resend
const MINIMO_ANTECEDENCIA_MS = 2 * 60 * 1000;     // um disparo programado precisa ser daqui a 2 minutos ou mais
const MAXIMO_ANTECEDENCIA_MS = 30 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000; // o Resend aceita até 30 dias à frente

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Troca {{nome}} (primeiro nome) e {{marca}} (nome completo) no texto.
function personalizar(texto: string, nomeCompleto: string) {
  var primeiroNome = String(nomeCompleto || "").trim().split(/\s+/)[0] || "";
  return String(texto || "")
    .replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome)
    .replace(/\{\{\s*marca\s*\}\}/gi, nomeCompleto || "");
}

// Tenta reconhecer a cota diária do Resend acabando, em qualquer formato
// de erro que ele devolva (nome do erro ou texto da mensagem).
function ehCotaEsgotada(corpoErro: any) {
  var texto = JSON.stringify(corpoErro || {}).toLowerCase();
  return texto.indexOf("daily_quota_exceeded") !== -1 || texto.indexOf("quota") !== -1;
}

// Pergunta pro Resend se o e-mail realmente ficou programado. Devolve true
// (está programado), false (NÃO está: ele pode ter saído na hora) ou null
// (não deu pra consultar, então não dá pra saber).
async function resendConfirmaProgramacao(idEmail: string, chaveResend: string): Promise<boolean | null> {
  try {
    const r = await fetch("https://api.resend.com/emails/" + encodeURIComponent(idEmail), {
      headers: { "Authorization": "Bearer " + chaveResend },
    });
    if (!r.ok) return null;
    const dados = await r.json().catch(() => null);
    if (!dados) return null;
    return Boolean(dados.scheduled_at) || dados.last_event === "scheduled";
  } catch {
    return null;
  }
}

// Cancela, no Resend, um e-mail programado que ainda não saiu.
async function resendCancelar(idEmail: string, chaveResend: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await fetch("https://api.resend.com/emails/" + encodeURIComponent(idEmail) + "/cancel", {
      method: "POST",
      headers: { "Authorization": "Bearer " + chaveResend },
    });
    if (r.ok) return { ok: true };
    const corpo = await r.json().catch(() => ({}));
    return { ok: false, erro: (corpo && (corpo.message || corpo.name)) || "Erro desconhecido do Resend" };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Erro desconhecido ao chamar o Resend" };
  }
}

// Cancela disparos programados. Recebe os "id" das linhas da tabela email_envios.
async function cancelarProgramados(corpo: any, supabase: any, chaveResend: string) {
  const ids: number[] = Array.isArray(corpo?.ids)
    ? corpo.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
    : [];
  if (ids.length === 0) {
    return resposta({ erro: "Nenhum envio indicado pra cancelar." }, 400);
  }
  if (ids.length > MAXIMO_POR_CHAMADA) {
    return resposta({ erro: "No máximo " + MAXIMO_POR_CHAMADA + " envios por chamada." }, 400);
  }

  const { data: linhas, error: erroBusca } = await supabase
    .from("email_envios").select("id, email, resend_id, status").in("id", ids);
  if (erroBusca) {
    return resposta({ erro: "Não consegui ler os envios no banco: " + erroBusca.message }, 500);
  }

  let cancelados = 0;
  let falhas = 0;
  let pulados = 0;
  const resultados: Array<{ id: number; email: string; status: string; erro?: string }> = [];

  for (const linha of (linhas || [])) {
    if (linha.status !== "agendado" || !linha.resend_id) {
      pulados++;
      resultados.push({ id: linha.id, email: linha.email, status: "pulado" });
      continue;
    }

    const cancelamento = await resendCancelar(linha.resend_id, chaveResend);
    if (!cancelamento.ok) {
      falhas++;
      resultados.push({ id: linha.id, email: linha.email, status: "erro", erro: cancelamento.erro });
    } else {
      const { data: atualizadas, error: erroAtualizar } = await supabase
        .from("email_envios").update({ status: "cancelado" }).eq("id", linha.id).select("id");
      if (erroAtualizar || !atualizadas || atualizadas.length === 0) {
        falhas++;
        resultados.push({
          id: linha.id, email: linha.email, status: "erro",
          erro: "Cancelado no Resend, mas não consegui atualizar o banco" + (erroAtualizar ? ": " + erroAtualizar.message : "."),
        });
      } else {
        cancelados++;
        resultados.push({ id: linha.id, email: linha.email, status: "cancelado" });
      }
    }

    await esperar(ESPERA_ENTRE_ENVIOS_MS);
  }

  return resposta({ cancelados: cancelados, falhas: falhas, pulados: pulados, resultados: resultados });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== "POST") {
    return resposta({ erro: "Método não permitido." }, 405);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return resposta({ erro: "RESEND_API_KEY não configurada nos segredos desta função." }, 500);
  }

  // ---- 1) confere quem está chamando ----
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const cabecalhoAuth = req.headers.get("Authorization") || "";

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: cabecalhoAuth } },
  });

  const { data: dadosUsuaria, error: erroUsuaria } = await supabase.auth.getUser();
  if (erroUsuaria || !dadosUsuaria?.user || dadosUsuaria.user.email !== EMAIL_PERMITIDO) {
    return resposta({ erro: "Não autorizada. Faça login no admin com a conta correta e tente de novo." }, 401);
  }

  // ---- 2) lê o corpo do pedido ----
  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "Corpo do pedido inválido (esperava JSON)." }, 400);
  }

  // O admin usa isto pra saber se esta função já entende "programar", antes de
  // deixar você programar qualquer coisa. Uma função antiga não responde isto.
  if (corpo?.acao === "versao") {
    return resposta({ versao: 2, agendamento: true });
  }

  if (corpo?.acao === "cancelar") {
    return await cancelarProgramados(corpo, supabase, resendApiKey);
  }

  const destinatarios: Array<{ email: string; nome: string }> = Array.isArray(corpo?.destinatarios) ? corpo.destinatarios : [];
  const assunto: string = String(corpo?.assunto || "").trim();
  const html: string = String(corpo?.html || "");

  if (!assunto || !html) {
    return resposta({ erro: "Faltou o assunto ou o corpo do e-mail." }, 400);
  }
  if (destinatarios.length === 0) {
    return resposta({ erro: "Nenhum destinatário enviado." }, 400);
  }
  if (destinatarios.length > MAXIMO_POR_CHAMADA) {
    return resposta({ erro: "No máximo " + MAXIMO_POR_CHAMADA + " destinatários por chamada. Envie em lotes menores." }, 400);
  }

  // ---- 2b) se for um disparo programado, confere a data e hora ----
  let agendarPara: string | null = null;
  const agendarParaTexto = String(corpo?.agendar_para || "").trim();
  if (agendarParaTexto) {
    const quando = new Date(agendarParaTexto);
    if (isNaN(quando.getTime())) {
      return resposta({ erro: "Data e hora da programação inválidas." }, 400);
    }
    const agora = Date.now();
    if (quando.getTime() < agora + MINIMO_ANTECEDENCIA_MS) {
      return resposta({ erro: "O horário programado precisa ser daqui a pelo menos 2 minutos." }, 400);
    }
    if (quando.getTime() > agora + MAXIMO_ANTECEDENCIA_MS) {
      return resposta({ erro: "O Resend só aceita programar até 30 dias à frente." }, 400);
    }
    agendarPara = quando.toISOString();
  }

  // ---- 3) busca a lista de descadastro, pra nunca mandar pra quem já pediu pra sair ----
  const { data: linhasOptout } = await supabase.from("email_optout").select("email");
  const emailsDescadastrados = new Set((linhasOptout || []).map((l: any) => String(l.email).toLowerCase().trim()));

  // ---- 4) manda um por um, devagar ----
  let enviados = 0;
  let agendados = 0;
  let falhas = 0;
  let pulados = 0;
  let cotaEsgotada = false;
  let erroGeral: string | null = null;           // motivo de ter parado no meio, se parou
  let programacaoConfirmada = false;             // a trava de segurança roda uma vez só por chamada
  const resultados: Array<{ email: string; status: string; erro?: string }> = [];
  const emailsJaVistos = new Set<string>(); // nunca duas vezes pro mesmo e-mail, nesta mesma chamada

  for (const destinatario of destinatarios) {
    const emailDestino = String(destinatario?.email || "").trim().toLowerCase();

    if (!emailDestino) { continue; }

    if (emailsJaVistos.has(emailDestino) || emailsDescadastrados.has(emailDestino)) {
      pulados++;
      resultados.push({ email: emailDestino, status: "pulado" });
      continue;
    }
    emailsJaVistos.add(emailDestino);

    if (cotaEsgotada) {
      pulados++;
      resultados.push({ email: emailDestino, status: "pulado" });
      continue;
    }

    const htmlPersonalizado = personalizar(html, destinatario?.nome || "");

    try {
      const respostaResend = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + resendApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: REMETENTE,
          to: [emailDestino],
          reply_to: EMAIL_RESPOSTA,
          subject: assunto,
          html: htmlPersonalizado,
          headers: {
            "List-Unsubscribe": "<mailto:" + EMAIL_RESPOSTA + "?subject=SAIR>",
          },
          ...(agendarPara ? { scheduled_at: agendarPara } : {}),
        }),
      });

      const corpoResend = await respostaResend.json().catch(() => ({}));

      if (!respostaResend.ok) {
        if (ehCotaEsgotada(corpoResend)) {
          cotaEsgotada = true;
        }
        falhas++;
        const mensagemErro = (corpoResend && (corpoResend.message || corpoResend.name)) || "Erro desconhecido do Resend";
        resultados.push({ email: emailDestino, status: "erro", erro: mensagemErro });
        await supabase.from("email_envios").insert({
          email: emailDestino,
          assunto: assunto,
          status: "erro",
          erro: mensagemErro,
          resend_id: null,
        });
      } else if (agendarPara) {
        const idEmail: string | null = corpoResend?.id || null;

        // Trava de segurança: na primeira vez, confere com o Resend que o
        // e-mail ficou mesmo programado. Se NÃO ficou, ele pode ter saído na
        // hora, então a gente para tudo aqui pra não mandar o resto de uma vez.
        if (!programacaoConfirmada && idEmail) {
          const confirmou = await resendConfirmaProgramacao(idEmail, resendApiKey);
          if (confirmou === false) {
            enviados++;
            resultados.push({ email: emailDestino, status: "ok" });
            await supabase.from("email_envios").insert({
              email: emailDestino,
              assunto: assunto,
              status: "ok",
              erro: null,
              resend_id: idEmail,
            });
            erroGeral = "O Resend não confirmou a programação, então o primeiro e-mail pode ter saído na hora (pra " + emailDestino + "). Parei os outros pra não sair nada de uma vez. Confira o item E-mails no Resend.";
            break;
          }
          programacaoConfirmada = true;
        }

        // Sem o registro no banco o admin não consegue mostrar nem cancelar
        // esse envio. Então, se o registro falhar, desfaz a programação agora.
        const { error: erroRegistro } = await supabase.from("email_envios").insert({
          email: emailDestino,
          assunto: assunto,
          status: "agendado",
          erro: null,
          resend_id: idEmail,
          agendado_para: agendarPara,
        });
        if (erroRegistro || !idEmail) {
          if (idEmail) { await resendCancelar(idEmail, resendApiKey); }
          falhas++;
          const mensagemErro = "Não consegui registrar a programação no banco, então desfiz o envio. Rode o trecho de programação do arquivo disparo.sql no SQL Editor do Supabase. (" + (erroRegistro ? erroRegistro.message : "o Resend não devolveu o id do e-mail") + ")";
          resultados.push({ email: emailDestino, status: "erro", erro: mensagemErro });
          erroGeral = mensagemErro;
          break;
        }

        agendados++;
        resultados.push({ email: emailDestino, status: "agendado" });
      } else {
        enviados++;
        resultados.push({ email: emailDestino, status: "ok" });
        await supabase.from("email_envios").insert({
          email: emailDestino,
          assunto: assunto,
          status: "ok",
          erro: null,
          resend_id: corpoResend?.id || null,
        });
      }
    } catch (erro) {
      falhas++;
      const mensagemErro = erro instanceof Error ? erro.message : "Erro desconhecido ao chamar o Resend";
      resultados.push({ email: emailDestino, status: "erro", erro: mensagemErro });
      await supabase.from("email_envios").insert({
        email: emailDestino,
        assunto: assunto,
        status: "erro",
        erro: mensagemErro,
        resend_id: null,
      });
    }

    await esperar(ESPERA_ENTRE_ENVIOS_MS);
  }

  return resposta({
    enviados: enviados,
    agendados: agendados,
    falhas: falhas,
    pulados: pulados,
    cotaEsgotada: cotaEsgotada,
    erroGeral: erroGeral,
    resultados: resultados,
  });
});
