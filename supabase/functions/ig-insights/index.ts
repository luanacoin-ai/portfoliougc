// ============================================================================
// FUNÇÃO "ig-insights" (as métricas da aba Instagram)
// ============================================================================
// O que ela faz: puxa da API do Instagram o número de seguidores, os novos
// seguidores por dia e o alcance por dia (últimos 15 dias), e devolve tudo
// pronto pro painel desenhar os gráficos.
//
// Quem chama: o painel, com você logada. Ela confere se quem chamou é mesmo
// você (e-mail luanacoin@gmail.com) antes de devolver qualquer coisa. Pode
// deixar a "Verify JWT" desta função ligada (o padrão).
//
// Se o Instagram ainda não estiver ligado (faltam os segredos), ela NÃO dá erro:
// responde { conectado: false } e o painel mostra um aviso simpático.
//
// Segredos (nos segredos da função, nunca aqui): IG_ACCESS_TOKEN,
// GRAPH_API_VERSION (opcional).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_PERMITIDO = "luanacoin@gmail.com";
const DIAS = 15;

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

async function lerGraph(caminho: string): Promise<{ ok: boolean; dados: Qualquer; erro?: string }> {
  const versao = Deno.env.get("GRAPH_API_VERSION") || "v21.0";
  try {
    const r = await fetch("https://graph.instagram.com/" + versao + caminho, {
      headers: { "Authorization": "Bearer " + (Deno.env.get("IG_ACCESS_TOKEN") ?? "") },
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || dados?.error) {
      return { ok: false, dados, erro: String(dados?.error?.message ?? ("Erro HTTP " + r.status)) };
    }
    return { ok: true, dados };
  } catch (e) {
    return { ok: false, dados: {}, erro: e instanceof Error ? e.message : "falha de rede" };
  }
}

// O Instagram marca o fim de cada dia por volta das 7h/8h UTC do dia seguinte.
// Tirando 12 horas, cai certinho dentro do dia que a métrica mede.
function diaDaMetrica(fim: string): string {
  return new Date(new Date(fim).getTime() - 12 * 3600 * 1000).toISOString().slice(0, 10);
}

function serieDia(dados: Qualquer): Array<{ dia: string; valor: number }> {
  const valores = dados?.data?.[0]?.values ?? [];
  return valores.map((v: Qualquer) => ({ dia: diaDaMetrica(v.end_time), valor: Number(v.value) || 0 }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);

  // Só você: confere o login de quem chamou.
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

  const perfil = await lerGraph("/me?fields=username,name,followers_count,follows_count,media_count");
  if (!perfil.ok) {
    return resposta({ conectado: false, motivo: "O Instagram recusou a conexão: " + perfil.erro });
  }

  // O Instagram só avisa o sistema de comentários e mensagens se a conta estiver
  // "assinada" nos webhooks. Conferimos aqui quais avisos estão ligados.
  const assinatura = await lerGraph("/me/subscribed_apps");
  const camposAssinados: string[] = [];
  if (assinatura.ok) {
    for (const app of (assinatura.dados?.data ?? [])) {
      for (const campo of (app?.subscribed_fields ?? [])) {
        if (!camposAssinados.includes(campo)) camposAssinados.push(String(campo));
      }
    }
  }

  const agora = Math.floor(Date.now() / 1000);
  const desde = agora - DIAS * 24 * 3600;
  const avisos: string[] = [];

  const alcance = await lerGraph("/me/insights?metric=reach&period=day&since=" + desde + "&until=" + agora);
  if (!alcance.ok) avisos.push("Alcance: " + alcance.erro);

  const novos = await lerGraph("/me/insights?metric=follower_count&period=day&since=" + desde + "&until=" + agora);
  if (!novos.ok) {
    avisos.push("Novos seguidores: " + novos.erro + " (o Instagram só mostra isso pra contas com mais de 100 seguidores)");
  }

  return resposta({
    conectado: true,
    username: perfil.dados.username ?? null,
    seguidores: perfil.dados.followers_count ?? null,
    seguindo: perfil.dados.follows_count ?? null,
    midias: perfil.dados.media_count ?? null,
    novos_seguidores: novos.ok ? serieDia(novos.dados) : [],
    alcance: alcance.ok ? serieDia(alcance.dados) : [],
    webhooks: { consultou: assinatura.ok, campos: camposAssinados, erro: assinatura.ok ? null : assinatura.erro },
    avisos,
  });
});
