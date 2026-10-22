// ============================================================================
// FUNÇÃO "ig-analise" (a aba Análises e o Sorteio da aba Instagram)
// ============================================================================
// O que ela faz, conforme o pedido que o painel manda ("acao"):
//
//   "conta"       Números da conta no período (7, 30 ou 90 dias): seguidores,
//                 novos seguidores por dia, alcance por dia, contas engajadas e
//                 interações. É rápida (poucas chamadas), roda toda vez que
//                 você troca o filtro de dias.
//
//   "posts"       Análise dos seus posts: curtidas, comentários, salvamentos,
//                 visualizações e alcance de cada um, e quem mais comenta. É
//                 PESADA (uma chamada por post), por isso só roda quando você
//                 clica em "Atualizar". O resultado dos posts fica guardado na
//                 tabela ig_analise_cache, pra a tela abrir rápido depois.
//                 A lista de quem mais comenta NÃO é guardada no banco (são
//                 @ de outras pessoas): só volta pro seu navegador.
//
//   "comentarios" Todos os comentários de UM post, pro sorteio. Não guarda nada.
//
// Quem chama: o painel, com você logada. Ela confere se quem chamou é mesmo
// você (e-mail luanacoin@gmail.com). Pode deixar a "Verify JWT" ligada.
//
// Se o Instagram ainda não estiver ligado, ela NÃO dá erro: responde
// { conectado: false } e o painel explica.
//
// Segredos (nos segredos da função, nunca aqui): IG_ACCESS_TOKEN,
// GRAPH_API_VERSION (opcional). A chave de serviço do banco o Supabase já
// coloca sozinho.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_PERMITIDO = "luanacoin@gmail.com";
const DIA_S = 24 * 3600;
const JANELA_MAXIMA_DIAS = 28;          // o Instagram limita cada consulta de métricas a ~30 dias
const LIMITE_DE_POSTS = 100;            // quantos posts recentes a análise olha
const POSTS_PARA_COMENTARISTAS = 25;    // de quantos posts ela lê os comentários
const PAGINAS_DE_COMENTARIOS_POR_POST = 3;
const MAXIMO_COMENTARIOS_SORTEIO = 5000;
const ORCAMENTO_DE_TEMPO_MS = 100_000;  // a função precisa responder antes do limite do Supabase

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

const GRAPH = "https://graph.instagram.com/" + (Deno.env.get("GRAPH_API_VERSION") || "v21.0");

// Lê (GET) a API do Instagram. Aceita um caminho ("/me") ou o endereço completo da
// próxima página que o próprio Instagram devolve.
async function lerGraph(caminho: string): Promise<{ ok: boolean; dados: Qualquer; erro?: string }> {
  try {
    const url = caminho.startsWith("http") ? caminho : GRAPH + caminho;
    const r = await fetch(url, { headers: { "Authorization": "Bearer " + (Deno.env.get("IG_ACCESS_TOKEN") ?? "") } });
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

// Quebra um período grande em janelas de até 28 dias, da mais antiga pra mais nova.
function janelas(dias: number, agora: number): Array<[number, number]> {
  const lista: Array<[number, number]> = [];
  let fim = agora;
  let restante = dias;
  while (restante > 0) {
    const passo = Math.min(restante, JANELA_MAXIMA_DIAS);
    lista.unshift([fim - passo * DIA_S, fim]);
    fim = fim - passo * DIA_S;
    restante -= passo;
  }
  return lista;
}

function somarPorDia(series: Array<Array<{ dia: string; valor: number }>>): Array<{ dia: string; valor: number }> {
  const mapa: Record<string, number> = {};
  for (const serie of series) for (const p of serie) mapa[p.dia] = (mapa[p.dia] ?? 0) + p.valor;
  return Object.keys(mapa).sort().map((dia) => ({ dia, valor: mapa[dia] }));
}

function serieDia(dados: Qualquer): Array<{ dia: string; valor: number }> {
  const valores = dados?.data?.[0]?.values ?? [];
  return valores.map((v: Qualquer) => ({ dia: diaDaMetrica(v.end_time), valor: Number(v.value) || 0 }));
}

// Valores únicos de cada métrica quando se pede "metric_type=total_value".
function totais(dados: Qualquer): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of (dados?.data ?? [])) out[m.name] = Number(m?.total_value?.value) || 0;
  return out;
}

/* ---------------------------------------------------------------- "conta" */
async function acaoConta(corpo: Qualquer) {
  const dias = [7, 30, 90].includes(Number(corpo?.dias)) ? Number(corpo.dias) : 30;
  const perfil = await lerGraph("/me?fields=username,followers_count,media_count");
  if (!perfil.ok) {
    return { conectado: false, motivo: "O Instagram recusou a conexão: " + perfil.erro };
  }

  const agora = Math.floor(Date.now() / 1000);
  const avisos: string[] = [];
  const janelasDoPeriodo = janelas(dias, agora);

  // Alcance por dia (uma consulta por janela de 28 dias, todas ao mesmo tempo).
  const respostasAlcance = await Promise.all(
    janelasDoPeriodo.map(([de, ate]) => lerGraph("/me/insights?metric=reach&period=day&since=" + de + "&until=" + ate)),
  );
  const alcanceSeries = respostasAlcance.filter((r) => r.ok).map((r) => serieDia(r.dados));
  const falhaAlcance = respostasAlcance.find((r) => !r.ok);
  if (falhaAlcance) avisos.push("Alcance: " + falhaAlcance.erro);

  // Novos seguidores: o Instagram só informa os últimos 30 dias (e só pra contas com mais de 100 seguidores).
  const diasNovos = Math.min(dias, JANELA_MAXIMA_DIAS);
  const novos = await lerGraph("/me/insights?metric=follower_count&period=day&since=" + (agora - diasNovos * DIA_S) + "&until=" + agora);
  if (!novos.ok) avisos.push("Novos seguidores: " + novos.erro + " (o Instagram só mostra isso pra contas com mais de 100 seguidores)");

  // Contas engajadas e interações: totais do período (somando as janelas).
  const respostasTotais = await Promise.all(
    janelasDoPeriodo.map(([de, ate]) =>
      lerGraph("/me/insights?metric=accounts_engaged,total_interactions&metric_type=total_value&period=day&since=" + de + "&until=" + ate)
    ),
  );
  let contasEngajadas = 0;
  let interacoes = 0;
  let consultouTotais = false;
  for (const r of respostasTotais) {
    if (!r.ok) continue;
    consultouTotais = true;
    const t = totais(r.dados);
    contasEngajadas += t.accounts_engaged ?? 0;
    interacoes += t.total_interactions ?? 0;
  }
  if (!consultouTotais && respostasTotais.length > 0) {
    avisos.push("Contas engajadas e interações: " + (respostasTotais[0].erro ?? "o Instagram não respondeu"));
  }

  const alcance = somarPorDia(alcanceSeries);
  return {
    conectado: true,
    dias,
    username: perfil.dados.username ?? null,
    seguidores: perfil.dados.followers_count ?? null,
    novos_seguidores: novos.ok ? serieDia(novos.dados) : [],
    novos_dias_consultados: diasNovos,
    alcance,
    alcance_total: alcance.reduce((s, p) => s + p.valor, 0),
    contas_engajadas: consultouTotais ? contasEngajadas : null,
    interacoes: consultouTotais ? interacoes : null,
    avisos,
  };
}

/* ---------------------------------------------------------------- "posts" */
// Conjuntos de métricas por post, do mais completo ao mais simples. Cada tipo de
// post (foto, vídeo, carrossel) aceita métricas diferentes, e um pedido com uma
// métrica que o tipo não aceita é recusado inteiro. Então tenta do mais completo
// pro mais simples e lembra qual funcionou pra cada tipo.
const CONJUNTOS_DE_METRICAS = [
  ["views", "reach", "saved", "shares"],
  ["plays", "reach", "saved", "shares"],
  ["reach", "saved", "shares"],
  ["reach", "saved"],
  ["reach"],
];

async function metricasDoPost(id: string, lembrete: Record<string, number>, tipo: string): Promise<Record<string, number>> {
  const comecar = lembrete[tipo] ?? 0;
  for (let i = comecar; i < CONJUNTOS_DE_METRICAS.length; i++) {
    const r = await lerGraph("/" + id + "/insights?metric=" + CONJUNTOS_DE_METRICAS[i].join(","));
    if (r.ok) {
      lembrete[tipo] = i;
      const out: Record<string, number> = {};
      for (const m of (r.dados?.data ?? [])) out[m.name] = Number(m?.values?.[0]?.value ?? m?.total_value?.value) || 0;
      return out;
    }
  }
  return {};
}

async function listarPosts(limite: number): Promise<{ ok: boolean; posts: Qualquer[]; erro?: string }> {
  const campos = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  let proxima = "/me/media?fields=" + campos + "&limit=50";
  const posts: Qualquer[] = [];
  while (proxima && posts.length < limite) {
    const r = await lerGraph(proxima);
    if (!r.ok) return { ok: posts.length > 0, posts, erro: r.erro };
    posts.push(...(r.dados?.data ?? []));
    proxima = r.dados?.paging?.next ?? "";
  }
  return { ok: true, posts: posts.slice(0, limite) };
}

// Quem mais comenta: conta os comentários de cada @ nos posts mais recentes.
async function contarComentaristas(posts: Qualquer[], meuUsuario: string | null, inicio: number) {
  const contagem: Record<string, number> = {};
  let analisados = 0;
  const lote = 5;
  const alvo = posts.slice(0, POSTS_PARA_COMENTARISTAS);
  for (let i = 0; i < alvo.length; i += lote) {
    if (Date.now() - inicio > ORCAMENTO_DE_TEMPO_MS) break;
    await Promise.all(alvo.slice(i, i + lote).map(async (post) => {
      if (!post.comments_count) return;
      let proxima = "/" + post.id + "/comments?fields=username&limit=100";
      for (let p = 0; p < PAGINAS_DE_COMENTARIOS_POR_POST && proxima; p++) {
        const r = await lerGraph(proxima);
        if (!r.ok) return;
        for (const c of (r.dados?.data ?? [])) {
          const nome = String(c.username ?? "").trim();
          if (!nome || nome === meuUsuario) continue;
          contagem[nome] = (contagem[nome] ?? 0) + 1;
          analisados++;
        }
        proxima = r.dados?.paging?.next ?? "";
      }
    }));
  }
  const ranking = Object.keys(contagem)
    .map((username) => ({ username, comentarios: contagem[username] }))
    .sort((a, b) => b.comentarios - a.comentarios)
    .slice(0, 30);
  return { ranking, analisados };
}

async function acaoPosts(servico: Qualquer) {
  const inicio = Date.now();
  const perfil = await lerGraph("/me?fields=username");
  if (!perfil.ok) return { conectado: false, motivo: "O Instagram recusou a conexão: " + perfil.erro };

  const lista = await listarPosts(LIMITE_DE_POSTS);
  if (!lista.ok) return { conectado: false, motivo: "Não consegui listar os posts: " + lista.erro };

  const lembrete: Record<string, number> = {};
  const resultado: Qualquer[] = [];
  let parcial = false;
  const lote = 8;

  // Aquecimento: o primeiro post de cada tipo (foto, vídeo, carrossel) é analisado
  // sozinho, pra a função descobrir quais métricas esse tipo aceita. Aí os grupos
  // abaixo já começam pelo conjunto certo, em vez de errar 8 vezes ao mesmo tempo.
  const jaAnalisados: Record<string, Record<string, number>> = {};
  const tiposVistos: Record<string, boolean> = {};
  for (const m of lista.posts) {
    const tipo = String(m.media_type ?? "IMAGE");
    if (tiposVistos[tipo]) continue;
    tiposVistos[tipo] = true;
    jaAnalisados[String(m.id)] = await metricasDoPost(String(m.id), lembrete, tipo);
  }

  for (let i = 0; i < lista.posts.length; i += lote) {
    const grupo = lista.posts.slice(i, i + lote);
    if (Date.now() - inicio > ORCAMENTO_DE_TEMPO_MS) {
      parcial = true;
      // sem tempo pras métricas: guarda o post só com o que já veio na lista
      for (const m of grupo) resultado.push(paraPost(m, jaAnalisados[String(m.id)] ?? {}));
      continue;
    }
    const metricas = await Promise.all(grupo.map((m) =>
      jaAnalisados[String(m.id)] ?? metricasDoPost(String(m.id), lembrete, String(m.media_type ?? "IMAGE"))
    ));
    grupo.forEach((m, j) => resultado.push(paraPost(m, metricas[j])));
  }

  const comentaristas = await contarComentaristas(lista.posts, perfil.dados.username ?? null, inicio);
  const atualizadoEm = new Date().toISOString();
  const cache = { posts: resultado, total_posts: resultado.length, parcial, aviso_listagem: lista.erro ?? null };

  // Guarda o resultado dos POSTS (sem os @ de quem comentou) pra a tela abrir rápido.
  let guardou = true;
  try {
    const { error } = await servico.from("ig_analise_cache").upsert(
      { id: "posts", dados: cache, atualizado_em: atualizadoEm },
      { onConflict: "id" },
    );
    if (error) guardou = false;
  } catch {
    guardou = false;
  }

  return {
    conectado: true,
    atualizado_em: atualizadoEm,
    guardou_no_banco: guardou,
    ...cache,
    quem_mais_comenta: comentaristas.ranking,
    comentarios_analisados: comentaristas.analisados,
  };
}

// Do jeito que o Instagram devolve pro jeito que o painel usa.
function paraPost(m: Qualquer, met: Record<string, number>) {
  const ehVideo = m.media_type === "VIDEO";
  return {
    id: String(m.id),
    legenda: String(m.caption ?? "").slice(0, 120),
    tipo: m.media_product_type === "REELS" ? "REELS" : (m.media_type ?? null),
    miniatura: m.thumbnail_url ?? (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url : null) ?? null,
    link: m.permalink ?? null,
    data: m.timestamp ?? null,
    curtidas: Number(m.like_count) || 0,
    comentarios: Number(m.comments_count) || 0,
    salvos: met.saved ?? 0,
    compartilhamentos: met.shares ?? 0,
    alcance: met.reach ?? 0,
    // "visualizações": o Instagram chama de views (ou plays, nos Reels antigos). Se não vier, usa o alcance.
    vistos: met.views ?? met.plays ?? (ehVideo ? 0 : (met.reach ?? 0)),
  };
}

/* ---------------------------------------------------------- "comentarios" */
async function acaoComentarios(corpo: Qualquer) {
  const idPost = String(corpo?.media_id ?? "");
  if (!/^\d{5,30}$/.test(idPost)) return { erro: "Escolha um post válido." };

  const perfil = await lerGraph("/me?fields=username");
  if (!perfil.ok) return { conectado: false, motivo: "O Instagram recusou a conexão: " + perfil.erro };

  const comentarios: Array<{ username: string; texto: string; data: string | null }> = [];
  let proxima = "/" + idPost + "/comments?fields=username,text,timestamp&limit=100";
  let truncado = false;
  while (proxima) {
    if (comentarios.length >= MAXIMO_COMENTARIOS_SORTEIO) { truncado = true; break; }
    const r = await lerGraph(proxima);
    if (!r.ok) {
      if (comentarios.length === 0) return { conectado: false, motivo: "Não consegui ler os comentários: " + r.erro };
      truncado = true;
      break;
    }
    for (const c of (r.dados?.data ?? [])) {
      comentarios.push({ username: String(c.username ?? ""), texto: String(c.text ?? ""), data: c.timestamp ?? null });
    }
    proxima = r.dados?.paging?.next ?? "";
  }
  return { conectado: true, meu_usuario: perfil.dados.username ?? null, comentarios, truncado };
}

/* -------------------------------------------------------------- a entrada */
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

  // deno-lint-ignore no-explicit-any
  let corpo: any = {};
  try { corpo = await req.json(); } catch { corpo = {}; }

  try {
    if (corpo?.acao === "posts") {
      // Só esta ação grava no banco, e grava com a chave de serviço (o painel não escreve nessa tabela).
      const servico = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
      });
      return resposta(await acaoPosts(servico));
    }
    if (corpo?.acao === "comentarios") return resposta(await acaoComentarios(corpo));
    return resposta(await acaoConta(corpo));
  } catch (erro) {
    console.error("erro no ig-analise", erro);
    return resposta({ conectado: false, motivo: "Erro inesperado: " + (erro instanceof Error ? erro.message : "desconhecido") });
  }
});
