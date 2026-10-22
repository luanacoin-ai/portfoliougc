// ============================================================================
// FUNÇÃO "ig-token-refresh" (renova o token do Instagram)
// ============================================================================
// O token do Instagram vale cerca de 60 dias. Esta função, chamada 1 vez por
// semana pelo relógio do banco (pg_cron), pede ao Instagram pra estender a
// validade e anota em ig_token_status até quando ele vale e se deu certo. Na
// aba Instagram do painel aparece um aviso se a renovação falhar.
//
// Quem chama: o relógio do banco, sem login. Por isso esta função precisa ser
// publicada com a "Verify JWT" DESLIGADA, e só aceita quem traz a senha
// SCHED_SECRET no cabeçalho "x-sched-key".
//
// Detalhe do Instagram: o endereço de renovação NÃO leva a versão no caminho
// (é graph.instagram.com/refresh_access_token, sem /v21.0). E o token precisa
// ter pelo menos 24 horas de vida pra poder ser renovado.
//
// Segredos (nos segredos da função, nunca aqui): IG_ACCESS_TOKEN, SCHED_SECRET.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function respostaJSON(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function iguaisConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respostaJSON({ erro: "Método não permitido." }, 405);

  const senha = Deno.env.get("SCHED_SECRET") ?? "";
  const enviada = req.headers.get("x-sched-key") ?? "";
  if (!senha || !iguaisConstante(senha, enviada)) {
    return respostaJSON({ erro: "Não autorizado." }, 401);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const anotar = async (campos: Record<string, unknown>) => {
    const { error } = await sb.from("ig_token_status").upsert(
      { id: "main", ...campos, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (error) console.error("não consegui gravar ig_token_status (rodou o instagram.sql?)", error.message);
  };

  // trim: um espaço ou quebra de linha colado junto com o token, no segredo, passa
  // despercebido nas outras funções (que mandam o token num cabeçalho), mas aqui
  // faria o token parecer "diferente" do que o Instagram devolve.
  const token = (Deno.env.get("IG_ACCESS_TOKEN") ?? "").trim();
  if (!token) {
    await anotar({ last_ok: false, last_error: "O segredo IG_ACCESS_TOKEN não está configurado." });
    return respostaJSON({ ok: false, erro: "IG_ACCESS_TOKEN não configurado." }, 500);
  }

  try {
    const r = await fetch(
      "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(token),
    );
    const dados = await r.json().catch(() => ({}));

    if (!r.ok || dados?.error) {
      const mensagem = String(dados?.error?.message ?? ("Erro HTTP " + r.status));
      await anotar({ last_ok: false, last_error: mensagem });
      return respostaJSON({ ok: false, erro: mensagem }, 502);
    }

    const segundos = Number(dados?.expires_in) || 0;
    const expiraEm = segundos > 0 ? new Date(Date.now() + segundos * 1000).toISOString() : null;
    // Normalmente o Instagram devolve o MESMO token, só com a validade estendida.
    // Se um dia vier um token diferente, o segredo precisa ser trocado à mão.
    const devolvido = String(dados?.access_token ?? "");
    const aviso = devolvido && devolvido !== token
      ? "O Instagram devolveu um token diferente do que está nos segredos. Gere um token novo no Meta e atualize o segredo IG_ACCESS_TOKEN." +
        " (conferência: o segredo tem " + token.length + " caracteres e o devolvido tem " + devolvido.length + " caracteres)"
      : null;

    await anotar({
      expires_at: expiraEm,
      last_ok: aviso === null,
      last_error: aviso,
      last_refreshed_at: new Date().toISOString(),
    });
    return respostaJSON({ ok: true, expira_em: expiraEm, aviso });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "erro desconhecido";
    await anotar({ last_ok: false, last_error: mensagem });
    return respostaJSON({ ok: false, erro: mensagem }, 500);
  }
});
