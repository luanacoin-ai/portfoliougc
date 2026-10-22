// ============================================================================
// FUNÇÃO "ig-media" (a lista de posts do seu Instagram)
// ============================================================================
// O que ela faz: lista os seus posts mais recentes (com miniatura), pra você
// escolher, no editor da automação, em quais posts ela vale, e pra mostrar a
// foto do post na lista de automações.
//
// Dois jeitos de usar:
//   1) sem nada no pedido: devolve os 50 posts mais recentes.
//   2) com { "ids": ["123", "456"] }: devolve esses posts específicos (até 20),
//      mesmo os antigos que já saíram da lista dos 50 mais recentes.
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
const CAMPOS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Qualquer = any;

// Do jeito que o Instagram devolve pro jeito que o painel usa.
function paraPost(m: Qualquer) {
  return {
    id: String(m.id),
    legenda: String(m.caption ?? "").slice(0, 120),
    tipo: m.media_type ?? null,                                  // IMAGE, VIDEO, CAROUSEL_ALBUM
    miniatura: m.thumbnail_url ?? (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url : null) ?? null,
    link: m.permalink ?? null,
    data: m.timestamp ?? null,
  };
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

  let pedido: Qualquer = {};
  try { pedido = await req.json(); } catch { pedido = {}; }
  // Só números (o id de um post do Instagram), no máximo 20 por pedido.
  const ids: string[] = Array.isArray(pedido?.ids)
    ? pedido.ids.map((i: unknown) => String(i)).filter((i: string) => /^\d{5,30}$/.test(i)).slice(0, 20)
    : [];

  const versao = Deno.env.get("GRAPH_API_VERSION") || "v21.0";
  const cabecalho = { "Authorization": "Bearer " + Deno.env.get("IG_ACCESS_TOKEN") };

  try {
    // Jeito 2: posts específicos pelo número (um pedido por post, ao mesmo tempo).
    if (ids.length > 0) {
      const respostas = await Promise.all(ids.map(async (id) => {
        try {
          const r = await fetch("https://graph.instagram.com/" + versao + "/" + id + "?fields=" + CAMPOS, { headers: cabecalho });
          const dados = await r.json().catch(() => ({}));
          return r.ok && !dados?.error ? paraPost(dados) : null;     // post apagado ou sem acesso: some da lista
        } catch {
          return null;
        }
      }));
      return resposta({ conectado: true, posts: respostas.filter((p) => p !== null) });
    }

    // Jeito 1: os 50 mais recentes.
    const r = await fetch("https://graph.instagram.com/" + versao + "/me/media?fields=" + CAMPOS + "&limit=50", { headers: cabecalho });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || dados?.error) {
      return resposta({ conectado: false, motivo: "O Instagram recusou a conexão: " + String(dados?.error?.message ?? ("Erro HTTP " + r.status)) });
    }
    return resposta({ conectado: true, posts: (dados?.data ?? []).map(paraPost) });
  } catch (erro) {
    return resposta({ conectado: false, motivo: erro instanceof Error ? erro.message : "falha de rede" });
  }
});
