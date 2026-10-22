// ============================================================================
// FUNÇÃO "ig-media" (a lista de posts do seu Instagram)
// ============================================================================
// O que ela faz: lista os seus posts mais recentes (com miniatura), pra você
// escolher, no editor da automação, em quais posts ela vale.
//
// Quem chama: o painel, com você logada. Ela confere se quem chamou é mesmo
// você (e-mail luanacoin@gmail.com). Pode deixar a "Verify JWT" ligada.
//
// Se o Instagram ainda não estiver ligado, ela NÃO dá erro: responde
// { conectado: false } e o painel explica.
//
// Segredos (nos segredos da função, nunca aqui): IG_ACCESS_TOKEN,
// GRAPH_API_VERSION (opcional).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_PERMITIDO = "luanacoin@gmail.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: usuaria, error: erroUsuaria } = await supabase.auth.getUser();
  if (erroUsuaria || !usuaria?.user || usuaria.user.email !== EMAIL_PERMITIDO) {
    return resposta({ erro: "Não autorizada. Faça login no painel com a conta correta." }, 401);
  }

  if (!Deno.env.get("IG_ACCESS_TOKEN")) {
    return resposta({
      conectado: false,
      motivo: "O Instagram ainda não está ligado: falta o segredo IG_ACCESS_TOKEN nas funções do Supabase.",
    });
  }

  const versao = Deno.env.get("GRAPH_API_VERSION") || "v21.0";
  try {
    const r = await fetch(
      "https://graph.instagram.com/" + versao + "/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=50",
      { headers: { "Authorization": "Bearer " + Deno.env.get("IG_ACCESS_TOKEN") } },
    );
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || dados?.error) {
      return resposta({ conectado: false, motivo: "O Instagram recusou a conexão: " + String(dados?.error?.message ?? ("Erro HTTP " + r.status)) });
    }

    // deno-lint-ignore no-explicit-any
    const posts = (dados?.data ?? []).map((m: any) => ({
      id: String(m.id),
      legenda: String(m.caption ?? "").slice(0, 120),
      tipo: m.media_type ?? null,                                  // IMAGE, VIDEO, CAROUSEL_ALBUM
      miniatura: m.thumbnail_url ?? (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url : null) ?? null,
      link: m.permalink ?? null,
      data: m.timestamp ?? null,
    }));
    return resposta({ conectado: true, posts });
  } catch (erro) {
    return resposta({ conectado: false, motivo: erro instanceof Error ? erro.message : "falha de rede" });
  }
});
