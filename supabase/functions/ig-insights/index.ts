// ============================================================================
// FUNÇÃO "ig-insights" (a conexão com o Instagram e o token)
// ============================================================================
// Duas coisas, conforme o pedido que o painel manda ("acao"):
//
//   sem nada / "conexao"  Confere a ligação: qual conta está ligada, quantos
//                         seguidores ela tem e se o Instagram está mesmo
//                         avisando o sistema sobre comentários, mensagens e
//                         toques nos botões (a "assinatura de webhooks").
//
//   "renovar_token"       Pede ao Instagram pra estender a validade do token
//                         (que dura cerca de 60 dias) e anota a data nova na
//                         tabela ig_token_status. É o botão "Renovar agora" da
//                         contagem regressiva do painel. O robô semanal
//                         (ig-token-refresh) faz a mesma coisa sozinho.
//
// Os gráficos de alcance, novos seguidores e os melhores posts agora ficam na
// função ig-analise.
//
// Quem chama: o painel, com você logada. Ela confere se quem chamou é mesmo
// você (e-mail luanacoin@gmail.com). Pode deixar a "Verify JWT" ligada.
//
// Se o Instagram ainda não estiver ligado (faltam os segredos), ela NÃO dá erro:
// responde { conectado: false } e o painel mostra um aviso simpático.
//
// Segredos (nos segredos da função, nunca aqui): IG_ACCESS_TOKEN,
// GRAPH_API_VERSION (opcional). A chave de serviço do banco o Supabase já
// coloca sozinho.
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

// Renova o token e anota a validade nova. O endereço de renovação NÃO leva a
// versão no caminho, e o token precisa ter pelo menos 24 horas de vida.
async function renovarToken() {
  const servico = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const anotar = async (campos: Record<string, unknown>) => {
    const { error } = await servico.from("ig_token_status").upsert(
      { id: "main", ...campos, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    return !error;
  };

  const token = Deno.env.get("IG_ACCESS_TOKEN") ?? "";
  try {
    const r = await fetch(
      "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(token),
    );
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || dados?.error) {
      const mensagem = String(dados?.error?.message ?? ("Erro HTTP " + r.status));
      await anotar({ last_ok: false, last_error: mensagem });
      return { ok: false, erro: mensagem };
    }
    const segundos = Number(dados?.expires_in) || 0;
    const expiraEm = segundos > 0 ? new Date(Date.now() + segundos * 1000).toISOString() : null;
    // Normalmente o Instagram devolve o MESMO token, só com a validade estendida.
    const aviso = dados?.access_token && dados.access_token !== token
      ? "O Instagram devolveu um token diferente do que está nos segredos. Gere um token novo no Meta e atualize o segredo IG_ACCESS_TOKEN."
      : null;
    const guardou = await anotar({
      expires_at: expiraEm,
      last_ok: aviso === null,
      last_error: aviso,
      last_refreshed_at: new Date().toISOString(),
    });
    return { ok: true, expira_em: expiraEm, aviso, guardou_no_banco: guardou };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "erro desconhecido" };
  }
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

  let corpo: Qualquer = {};
  try { corpo = await req.json(); } catch { corpo = {}; }

  if (corpo?.acao === "renovar_token") return resposta(await renovarToken());

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

  return resposta({
    conectado: true,
    username: perfil.dados.username ?? null,
    seguidores: perfil.dados.followers_count ?? null,
    seguindo: perfil.dados.follows_count ?? null,
    midias: perfil.dados.media_count ?? null,
    webhooks: { consultou: assinatura.ok, campos: camposAssinados, erro: assinatura.ok ? null : assinatura.erro },
  });
});
