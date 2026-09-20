// ============================================================================
// FUNÇÃO "enviar-emails" (o carteiro)
// ============================================================================
// O que ela faz: recebe uma lista de marcas, troca {{nome}} e {{marca}} pelo
// nome de cada uma, e manda um e-mail por vez pelo Resend, indo devagar pra
// não estourar o limite do Resend.
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
const REMETENTE = "Luana Coin <contato@luanacoin.com>"; // quem aparece como remetente pras marcas
// Enquanto o domínio luanacoin.com não estiver verificado no Resend, ele só
// deixa mandar e-mail usando este remetente de teste dele mesmo, e só pra
// quem é dona da conta Resend. Por isso: e-mail pra você mesma usa este
// remetente (funciona hoje, sem precisar verificar nada); e-mail pra
// qualquer outra pessoa usa o REMETENTE de verdade (precisa do domínio
// verificado, porque é um envio de verdade pra fora).
const REMETENTE_TESTE = "Luana Coin <onboarding@resend.dev>";
const MAXIMO_POR_CHAMADA = 250;                   // limite de segurança por chamada
const ESPERA_ENTRE_ENVIOS_MS = 200;               // ~5 e-mails por segundo, ritmo seguro do Resend

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

  // ---- 3) busca a lista de descadastro, pra nunca mandar pra quem já pediu pra sair ----
  const { data: linhasOptout } = await supabase.from("email_optout").select("email");
  const emailsDescadastrados = new Set((linhasOptout || []).map((l: any) => String(l.email).toLowerCase().trim()));

  // ---- 4) manda um por um, devagar ----
  let enviados = 0;
  let falhas = 0;
  let pulados = 0;
  let cotaEsgotada = false;
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
    const remetenteUsado = emailDestino === EMAIL_PERMITIDO.toLowerCase() ? REMETENTE_TESTE : REMETENTE;

    try {
      const respostaResend = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + resendApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: remetenteUsado,
          to: [emailDestino],
          reply_to: EMAIL_RESPOSTA,
          subject: assunto,
          html: htmlPersonalizado,
          headers: {
            "List-Unsubscribe": "<mailto:" + EMAIL_RESPOSTA + "?subject=SAIR>",
          },
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
    falhas: falhas,
    pulados: pulados,
    cotaEsgotada: cotaEsgotada,
    resultados: resultados,
  });
});
