// ============================================================================
// FUNÇÃO "instagram-webhook" (o cérebro da automação de DM do Instagram)
// ============================================================================
// O que ela faz: é o endereço que você cadastra no Meta for Developers como
// "Webhook". Quando alguém comenta no seu post, ou toca num botão da conversa,
// o Instagram chama esta função. Ela acha a automação certa (tabela
// ig_automations), manda a DM com botão, e segue a conversa quando a pessoa
// toca no botão.
//
// Quem chama: o PRÓPRIO Instagram, sem login nenhum. Por isso esta função
// precisa ser publicada com a "Verify JWT" DESLIGADA (no site do Supabase:
// Edge Functions > instagram-webhook > Details > "Verify JWT" desligado; na
// linha de comando: --no-verify-jwt). No lugar do login, quem garante que é
// mesmo o Instagram é a assinatura do pedido, conferida com o APP_SECRET.
//
// Onde ficam os segredos: NUNCA neste arquivo. Ficam nos segredos desta função
// no painel do Supabase (Edge Functions > Secrets). Aqui só lemos eles com
// Deno.env.get("NOME"). Veja a lista completa em INSTAGRAM-LEIA-ME.md.
//   IG_ACCESS_TOKEN, IG_ACCOUNT_ID, APP_SECRET, APP_SECRET_ENFORCE,
//   VERIFY_TOKEN, GRAPH_API_VERSION, SCHED_SECRET, TEST_IG_ACCOUNTS
// A chave de serviço do banco (SUPABASE_SERVICE_ROLE_KEY) o Supabase já coloca
// sozinho em toda função, você não precisa configurar.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===== INICIO DO BLOCO COMPARTILHADO (igual no instagram-webhook e no ig-scheduler) =====
// Se mudar algo aqui, copie a mudança pro outro arquivo também.

const GRAPH_VERSAO = Deno.env.get("GRAPH_API_VERSION") || "v21.0";
const GRAPH = "https://graph.instagram.com/" + GRAPH_VERSAO;

// Códigos de erro do Instagram que significam "bloqueio, limite ou token ruim"
// (falha DURA: pesa mais no disjuntor e não adianta tentar o plano B).
const CODIGOS_DUROS = [4, 10, 17, 32, 190, 200, 341, 368, 613, 803];

// deno-lint-ignore no-explicit-any
type Qualquer = any;
type Botao = { title: string; next?: number | string | null; url?: string | null };
type Passo = {
  id: number | string;
  message: string;
  buttons?: Botao[];
  assets?: string[];
  collect?: { field: string; next?: number | string | null };
  delay?: { seconds: number; next?: number | string | null };
};
type Destino = { comment_id?: string; id?: string };
type ErroEnvio = { codigo: number | null; mensagem: string; duro: boolean; transitorio: boolean };
type ResultadoEnvio = { ok: boolean; formato?: "botao" | "pilula" | "texto"; mid?: string | null; erro?: ErroEnvio };

function criarBanco(): Qualquer {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Corta o texto pra caber num limite de BYTES (o Instagram conta bytes no texto simples).
function cortarBytes(texto: string, maximo: number): string {
  const enc = new TextEncoder();
  if (enc.encode(texto).length <= maximo) return texto;
  let t = texto;
  while (t.length > 0 && enc.encode(t).length > maximo - 3) t = t.slice(0, -1);
  return t + "...";
}

// Chama a API do Instagram. Nunca lança erro: devolve { ok, status, dados }.
async function chamarGraph(caminho: string, corpo?: unknown, metodo = "POST"): Promise<{ ok: boolean; status: number; dados: Qualquer }> {
  try {
    const r = await fetch(GRAPH + caminho, {
      method: metodo,
      headers: {
        "Authorization": "Bearer " + (Deno.env.get("IG_ACCESS_TOKEN") ?? ""),
        "Content-Type": "application/json",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok && !dados?.error, status: r.status, dados };
  } catch (e) {
    return { ok: false, status: 0, dados: { error: { message: e instanceof Error ? e.message : "falha de rede" } } };
  }
}

function erroDoGraph(r: { status: number; dados: Qualquer }): ErroEnvio {
  const e = r.dados?.error ?? {};
  const codigo = Number(e.code) || null;
  const mensagem = String(e.error_user_msg || e.message || ("Erro HTTP " + r.status));
  const duro = r.status === 429 || (codigo !== null && CODIGOS_DUROS.includes(codigo)) ||
    /spam|blocked|temporarily|rate limit|too many|access token/i.test(mensagem);
  const transitorio = r.status === 0 || r.status >= 500;
  return { codigo, mensagem, duro, transitorio };
}

// ---- o freio de envio (as duas funções do banco, veja instagram.sql) ----
// Se o banco não responder, o freio "falha fechado": diz que NÃO pode enviar.
async function pegarFicha(sb: Qualquer): Promise<boolean> {
  const { data, error } = await sb.rpc("take_send_slot", { p_key: "private_reply" });
  if (error) {
    console.error("take_send_slot falhou (rodou o instagram.sql?)", error.message);
    return false;
  }
  return data === true;
}

async function registrarResultadoFreio(sb: Qualquer, ok: boolean, duro: boolean) {
  const { error } = await sb.rpc("record_send_result", { p_key: "private_reply", p_ok: ok, p_hard: duro });
  if (error) console.error("record_send_result falhou", error.message);
}

async function registrarEntrega(
  sb: Qualquer,
  d: { ig_user_id: string; automation_id?: string | null; canal: string; tipo: string; status: string; motivo?: string | null },
) {
  const { error } = await sb.from("ig_deliveries").insert({
    ig_user_id: d.ig_user_id,
    automation_id: d.automation_id ?? null,
    canal: d.canal,
    tipo: d.tipo,
    status: d.status,
    motivo: d.motivo ?? null,
  });
  if (error) console.error("não consegui registrar a entrega", error.message);
}

async function salvarLead(sb: Qualquer, dados: Record<string, unknown>) {
  const { error } = await sb.from("ig_leads").upsert(
    { ...dados, updated_at: new Date().toISOString() },
    { onConflict: "ig_user_id" },
  );
  if (error) console.error("não consegui salvar o lead", error.message);
}

// Um botão só vale se tem destino: um link (url) ou um próximo passo (next).
// Botão sem destino é DESCARTADO (não vai pra DM, igual a prévia do painel).
function botoesEnviaveis(passo: Passo): Botao[] {
  return (passo.buttons ?? []).filter((b) => {
    const temUrl = typeof b.url === "string" && b.url.trim() !== "";
    const temNext = b.next !== undefined && b.next !== null && String(b.next) !== "";
    return String(b.title ?? "").trim() !== "" && (temUrl || temNext);
  });
}

function garantirHttp(url: string): string {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

// Manda UMA mensagem e, se der certo, guarda o id dela em ig_bot_sends (pra
// reconhecer o "echo" depois).
async function tentarEnviar(
  sb: Qualquer,
  destino: Destino,
  mensagem: Qualquer,
  formato: "botao" | "pilula" | "texto",
): Promise<ResultadoEnvio> {
  const r = await chamarGraph("/" + (Deno.env.get("IG_ACCOUNT_ID") ?? "me") + "/messages", { recipient: destino, message: mensagem });
  if (!r.ok) return { ok: false, formato, erro: erroDoGraph(r) };
  const mid: string | null = r.dados?.message_id ?? null;
  if (mid) {
    const { error } = await sb.from("ig_bot_sends").upsert({ mid }, { onConflict: "mid" });
    if (error) console.error("não consegui guardar o mid", error.message);
  }
  return { ok: true, formato, mid };
}

// O pulo do gato dos botões: manda o passo com os botões ANEXADOS na mensagem
// (button template). Se o Instagram recusar, tenta como pílulas (quick reply),
// e por último como texto puro (com o link no texto), pra a mensagem nunca
// deixar de chegar. Se o erro for bloqueio/limite, não adianta tentar o plano B.
async function enviarPasso(sb: Qualquer, destino: Destino, automacaoId: string, passo: Passo): Promise<ResultadoEnvio> {
  const texto = String(passo.message ?? "").trim() || "Oi!";
  const botoes = botoesEnviaveis(passo);

  if (botoes.length === 0) {
    return await tentarEnviar(sb, destino, { text: cortarBytes(texto, 1000) }, "texto");
  }

  // 1) botão ANEXADO (no máximo 3 botões neste formato; título de até 20 letras)
  const comoBotao = {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: texto.slice(0, 640),
        buttons: botoes.slice(0, 3).map((b) =>
          b.url
            ? { type: "web_url", url: garantirHttp(String(b.url)), title: String(b.title).slice(0, 20) }
            : { type: "postback", title: String(b.title).slice(0, 20), payload: "STEP:" + automacaoId + ":" + b.next }
        ),
      },
    },
  };
  const erros: string[] = [];
  let r = await tentarEnviar(sb, destino, comoBotao, "botao");
  if (r.ok) return r;
  erros.push("botão: " + r.erro!.mensagem);
  if (r.erro!.duro) return { ok: false, formato: "botao", erro: { ...r.erro!, mensagem: erros.join(" | ") } };

  // 2) pílula (quick reply): só cabe botão que continua a conversa; os links
  // vão escritos no texto. Aqui cabem até 13.
  const postbacks = botoes.filter((b) => !b.url);
  const links = botoes.filter((b) => b.url);
  const textoComLinks = texto + (links.length > 0
    ? "\n\n" + links.map((b) => String(b.title) + ": " + garantirHttp(String(b.url))).join("\n")
    : "");
  if (postbacks.length > 0) {
    r = await tentarEnviar(sb, destino, {
      text: cortarBytes(textoComLinks, 1000),
      quick_replies: postbacks.slice(0, 13).map((b) => ({
        content_type: "text",
        title: String(b.title).slice(0, 20),
        payload: "STEP:" + automacaoId + ":" + b.next,
      })),
    }, "pilula");
    if (r.ok) return r;
    erros.push("pílula: " + r.erro!.mensagem);
    if (r.erro!.duro) return { ok: false, formato: "pilula", erro: { ...r.erro!, mensagem: erros.join(" | ") } };
  }

  // 3) texto puro
  r = await tentarEnviar(sb, destino, { text: cortarBytes(textoComLinks, 1000) }, "texto");
  if (r.ok) return r;
  erros.push("texto: " + r.erro!.mensagem);
  return { ok: false, formato: "texto", erro: { ...r.erro!, mensagem: erros.join(" | ") } };
}

// Manda os arquivos do passo (PDF, áudio, foto, vídeo) como mensagens separadas,
// pelo id da pessoa. Devolve o erro do primeiro que falhar, ou null se deu tudo certo.
async function enviarAnexos(sb: Qualquer, igUserId: string, idsArquivos: string[] | undefined): Promise<ErroEnvio | null> {
  if (!idsArquivos || idsArquivos.length === 0) return null;
  const { data } = await sb.from("ig_assets").select("*").in("id", idsArquivos);
  for (const id of idsArquivos) {
    const arquivo = (data ?? []).find((a: Qualquer) => a.id === id);
    if (!arquivo) continue;
    const r = await tentarEnviar(sb, { id: igUserId }, {
      attachment: { type: arquivo.tipo, payload: { url: arquivo.public_url } },
    }, "texto");
    if (!r.ok) return r.erro ?? null;
  }
  return null;
}

function acharPasso(automacao: Qualquer, id: unknown): Passo | null {
  const passos: Passo[] = automacao?.flow?.steps ?? [];
  return passos.find((p) => String(p.id) === String(id)) ?? null;
}

// Depois que um passo saiu: anota onde a pessoa está na conversa, e prepara o
// que o passo pedir (esperar um dado dela, ou mandar o próximo sozinho depois de X).
async function aposEnviarPasso(sb: Qualquer, automacao: Qualquer, passo: Passo, igUserId: string, username?: string | null) {
  const lead: Record<string, unknown> = {
    ig_user_id: igUserId,
    automation_id: automacao.id,
    flow_step: String(passo.id),
    expecting: passo.collect
      ? { field: passo.collect.field, next: passo.collect.next ?? null, automation_id: automacao.id }
      : null,
  };
  if (username) lead.username = username;
  if ((passo.buttons ?? []).some((b) => b.url)) lead.link_sent = true;
  await salvarLead(sb, lead);

  if (passo.delay && passo.delay.next !== undefined && passo.delay.next !== null) {
    const segundos = Math.max(0, Number(passo.delay.seconds) || 0);
    const { error } = await sb.from("ig_scheduled").insert({
      ig_user_id: igUserId,
      automation_id: automacao.id,
      step_id: String(passo.delay.next),
      send_at: new Date(Date.now() + segundos * 1000).toISOString(),
    });
    if (error) console.error("não consegui agendar o passo com atraso", error.message);
  }
}

// ===== FIM DO BLOCO COMPARTILHADO =====


// ---------------------------------------------------------------------------
// Daqui pra baixo é só do instagram-webhook
// ---------------------------------------------------------------------------

function iguaisConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

// Confere a assinatura (HMAC SHA-256) que o Instagram manda no cabeçalho
// X-Hub-Signature-256, usando o APP_SECRET.
async function assinaturaValida(req: Request, corpoBruto: string): Promise<boolean> {
  const segredo = Deno.env.get("APP_SECRET");
  const cabecalho = req.headers.get("x-hub-signature-256") || "";
  if (!segredo || !cabecalho.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoBruto));
  const esperado = Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return iguaisConstante(esperado, cabecalho.slice("sha256=".length));
}

// ---- eventos repetidos: o Instagram às vezes manda o mesmo aviso duas vezes ----
// Devolve true se este é o primeiro (pode processar) e false se já foi visto.
async function marcarProcessado(sb: Qualquer, idEvento: string): Promise<boolean> {
  const { error } = await sb.from("ig_processed_events").insert({ id: idEvento });
  if (!error) return true;
  if (error.code === "23505") return false;      // já existia
  console.error("ig_processed_events falhou (rodou o instagram.sql?)", error.message);
  return true;                                    // erro estranho: melhor processar do que perder
}

async function desmarcarProcessado(sb: Qualquer, idEvento: string) {
  await sb.from("ig_processed_events").delete().eq("id", idEvento);
}

// ---- achar a automação certa pelo comentário ----
function normalizar(texto: string): string {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A palavra precisa aparecer inteira (não casa "eu" dentro de "europa").
function bateComPalavra(texto: string, automacao: Qualquer, aceitarQualquer: boolean): boolean {
  if (automacao.match_any && aceitarQualquer) return true;
  const alvo = normalizar(texto);
  const palavras = String(automacao.keyword ?? "").split(",").map(normalizar).filter(Boolean);
  return palavras.some((p) => new RegExp("(^|[^a-z0-9])" + escaparRegex(p) + "([^a-z0-9]|$)").test(alvo));
}

function escolherAutomacao(automacoes: Qualquer[], texto: string, mediaId: string | null, ehComentario: boolean): Qualquer | null {
  const candidatas = automacoes.filter((a) => {
    const posts: string[] = a.media_ids ?? [];
    if (ehComentario) {
      if (posts.length > 0 && (!mediaId || !posts.includes(mediaId))) return false;
    } else if (posts.length > 0) {
      return false;                              // automação de post específico não vale pra DM solta
    }
    return bateComPalavra(texto, a, ehComentario); // "qualquer palavra" só vale em comentário
  });
  if (candidatas.length === 0) return null;
  // Mais específica ganha: post escolhido primeiro, depois palavra-chave (em vez de "qualquer").
  const pontos = (a: Qualquer) => ((a.media_ids ?? []).length > 0 ? 2 : 0) + (a.match_any ? 0 : 1);
  candidatas.sort((x, y) => pontos(y) - pontos(x));
  return candidatas[0];
}

function contasDeTeste(): string[] {
  return (Deno.env.get("TEST_IG_ACCOUNTS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// A resposta pública alterna entre o texto principal e as variações (A/B).
function escolherRespostaPublica(automacao: Qualquer, idComentario: string): string | null {
  const textos = [automacao.public_reply, ...(automacao.public_reply_variants ?? [])]
    .map((t: unknown) => String(t ?? "").trim()).filter(Boolean);
  if (textos.length === 0) return null;
  let soma = 0;
  for (const c of idComentario) soma += c.charCodeAt(0);
  return textos[soma % textos.length];
}

// ---- COMENTÁRIO ----
async function tratarComentario(sb: Qualquer, valor: Qualquer, idContaDaEntrada: string | null) {
  const idComentario = String(valor?.id ?? "");
  const texto = String(valor?.text ?? "");
  const idPessoa = String(valor?.from?.id ?? "");
  const username: string | null = valor?.from?.username ?? null;
  const idPost: string | null = valor?.media?.id ? String(valor.media.id) : null;
  const minhaConta = Deno.env.get("IG_ACCOUNT_ID") ?? "";

  if (!idComentario || !idPessoa) return;
  // Comentário da PRÓPRIA conta (inclusive a nossa resposta pública): ignora.
  if (idPessoa === minhaConta || idPessoa === idContaDaEntrada) return;
  // Resposta a outro comentário (não é um comentário direto no post): ignora.
  if (valor?.parent_id) return;

  if (!(await marcarProcessado(sb, "comment:" + idComentario))) return;

  const { data: automacoes, error: erroAut } = await sb.from("ig_automations").select("*").eq("active", true).order("created_at");
  if (erroAut) {
    console.error("não consegui ler as automações", erroAut.message);
    await desmarcarProcessado(sb, "comment:" + idComentario);
    return;
  }
  const automacao = escolherAutomacao(automacoes ?? [], texto, idPost, true);
  if (!automacao) return;

  // Regra do "1 por dia": quem já recebeu uma DM nas últimas 24h é pulado.
  // As contas de TEST_IG_ACCOUNTS ignoram a regra, pra você testar à vontade.
  if (!contasDeTeste().includes(idPessoa)) {
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recentes } = await sb.from("ig_deliveries").select("id")
      .eq("ig_user_id", idPessoa).in("status", ["ok", "na_fila"]).gte("ts", desde).limit(1);
    if (recentes && recentes.length > 0) {
      await registrarEntrega(sb, {
        ig_user_id: idPessoa, automation_id: automacao.id, canal: "private_reply", tipo: "flow",
        status: "pulado", motivo: "Já recebeu uma DM nas últimas 24h (regra de 1 por dia)",
      });
      return;
    }
  }

  const resultado = await entregarAutomacao(sb, automacao, { idComentario, idPessoa, username });

  if (resultado === "erro") {
    // Falhou de vez: libera a marca de "já vi", pra um reenvio poder tentar de novo.
    await desmarcarProcessado(sb, "comment:" + idComentario);
    return;
  }

  // Saiu (ou está garantido na fila): responde no comentário e marca o lead.
  const resposta = escolherRespostaPublica(automacao, idComentario);
  if (resposta) {
    const r = await chamarGraph("/" + idComentario + "/replies", { message: resposta });
    if (!r.ok) console.error("não consegui responder no comentário", erroDoGraph(r).mensagem);
  }
  await salvarLead(sb, {
    ig_user_id: idPessoa,
    username,
    last_source: "comment",
    last_keyword: automacao.match_any ? null : String(automacao.keyword ?? ""),
    automation_id: automacao.id,
  });
}

// Manda a Mensagem 1 (primeiro passo do fluxo) como resposta privada ao comentário.
// Passa pelo freio. Devolve "enviado", "fila" ou "erro".
async function entregarAutomacao(
  sb: Qualquer,
  automacao: Qualquer,
  ctx: { idComentario: string; idPessoa: string; username: string | null },
): Promise<"enviado" | "fila" | "erro"> {
  const passo0: Passo | undefined = automacao?.flow?.steps?.[0];
  if (!passo0) {
    await registrarEntrega(sb, {
      ig_user_id: ctx.idPessoa, automation_id: automacao.id, canal: "private_reply", tipo: "flow",
      status: "erro", motivo: "A automação não tem nenhuma mensagem (fluxo vazio)",
    });
    return "erro";
  }

  const enfileirar = async (motivo: string) => {
    const { error } = await sb.from("ig_send_queue").insert({
      comment_id: ctx.idComentario, automation_id: automacao.id, ig_user_id: ctx.idPessoa, username: ctx.username,
    });
    if (error && error.code !== "23505") {
      console.error("não consegui colocar na fila", error.message);
      return false;
    }
    await registrarEntrega(sb, {
      ig_user_id: ctx.idPessoa, automation_id: automacao.id, canal: "private_reply", tipo: "flow",
      status: "na_fila", motivo,
    });
    return true;
  };

  // O freio: sem ficha, vai pra fila e o ig-scheduler manda depois.
  if (!(await pegarFicha(sb))) {
    return (await enfileirar("Freio de envio: limite por minuto, hora ou dia (ou pausa de segurança)")) ? "fila" : "erro";
  }

  const r = await enviarPasso(sb, { comment_id: ctx.idComentario }, automacao.id, passo0);
  await registrarResultadoFreio(sb, r.ok, !r.ok && !!r.erro?.duro);

  if (!r.ok) {
    const erro = r.erro!;
    // Limite ou erro de rede: não perde a pessoa, vai pra fila e tenta de novo depois.
    if (erro.duro || erro.transitorio) {
      return (await enfileirar("Instagram recusou por enquanto: " + erro.mensagem)) ? "fila" : "erro";
    }
    await registrarEntrega(sb, {
      ig_user_id: ctx.idPessoa, automation_id: automacao.id, canal: "private_reply", tipo: "flow",
      status: "erro", motivo: erro.mensagem,
    });
    return "erro";
  }

  await registrarEntrega(sb, {
    ig_user_id: ctx.idPessoa, automation_id: automacao.id, canal: "private_reply", tipo: "flow",
    status: "ok", motivo: r.formato === "botao" ? null : "Enviado sem botão anexado (formato: " + r.formato + ")",
  });
  await aposEnviarPasso(sb, automacao, passo0, ctx.idPessoa, ctx.username);

  // Arquivos da Mensagem 1: o Instagram só deixa mandar depois da resposta
  // privada se a janela de conversa estiver aberta. Se recusar, só anota.
  const erroAnexo = await enviarAnexos(sb, ctx.idPessoa, passo0.assets);
  if (erroAnexo) {
    await registrarEntrega(sb, {
      ig_user_id: ctx.idPessoa, automation_id: automacao.id, canal: "dm", tipo: "asset",
      status: "erro", motivo: "Arquivo não enviado: " + erroAnexo.mensagem,
    });
  }
  return "enviado";
}

// ---- MENSAGEM / BOTÃO (postback ou quick reply) ----
async function tratarMensagem(sb: Qualquer, ev: Qualquer, idContaDaEntrada: string | null) {
  const remetente = String(ev?.sender?.id ?? "");
  const destinatario = String(ev?.recipient?.id ?? "");
  const minhaConta = Deno.env.get("IG_ACCOUNT_ID") ?? "";
  const ehEcho = ev?.message?.is_echo === true || remetente === minhaConta || remetente === idContaDaEntrada;

  // Echo = mensagem que SAIU da sua conta. Se não foi o sistema que mandou (o
  // mid não está em ig_bot_sends), foi você respondendo à mão: marca a pessoa.
  if (ehEcho) {
    const mid = ev?.message?.mid;
    if (mid && destinatario) {
      const { data } = await sb.from("ig_bot_sends").select("mid").eq("mid", mid).limit(1);
      if (!data || data.length === 0) {
        const { data: lead } = await sb.from("ig_leads").select("tags").eq("ig_user_id", destinatario).limit(1);
        if (lead && lead.length > 0) {
          const tags: string[] = lead[0].tags ?? [];
          if (!tags.includes("humano")) await salvarLead(sb, { ig_user_id: destinatario, tags: [...tags, "humano"] });
        }
      }
    }
    return;
  }

  const mid = ev?.message?.mid ?? ev?.postback?.mid;
  if (!remetente) return;
  if (mid && !(await marcarProcessado(sb, "msg:" + mid))) return;

  const payload: string | undefined = ev?.postback?.payload ?? ev?.message?.quick_reply?.payload;

  // Toque num botão da conversa: "STEP:idDaAutomacao:proximoPasso"
  if (payload && payload.startsWith("STEP:")) {
    const partes = payload.split(":");
    await avancarConversa(sb, remetente, partes[1], partes.slice(2).join(":"));
    return;
  }

  const texto: string | undefined = ev?.message?.text;
  if (!texto) return;

  // A pessoa está respondendo a uma pergunta do fluxo (e-mail, telefone)?
  const { data: leads } = await sb.from("ig_leads").select("*").eq("ig_user_id", remetente).limit(1);
  const lead = leads && leads.length > 0 ? leads[0] : null;
  if (lead?.expecting?.field) {
    await receberDado(sb, lead, texto);
    return;
  }

  // Mensagem solta: só responde se bater uma palavra-chave (nunca "qualquer palavra").
  const { data: automacoes } = await sb.from("ig_automations").select("*").eq("active", true).order("created_at");
  const automacao = escolherAutomacao(automacoes ?? [], texto, null, false);
  if (!automacao) return;                          // sem palavra-chave: silêncio
  const passo0: Passo | undefined = automacao?.flow?.steps?.[0];
  if (!passo0) return;

  const r = await enviarPasso(sb, { id: remetente }, automacao.id, passo0);
  await registrarEntrega(sb, {
    ig_user_id: remetente, automation_id: automacao.id, canal: "dm", tipo: "flow",
    status: r.ok ? "ok" : "erro", motivo: r.ok ? null : r.erro?.mensagem,
  });
  if (!r.ok) return;
  await salvarLead(sb, { ig_user_id: remetente, last_source: "dm", last_keyword: texto.slice(0, 80), automation_id: automacao.id });
  await aposEnviarPasso(sb, automacao, passo0, remetente);
  await enviarAnexos(sb, remetente, passo0.assets);
}

// A pessoa tocou num botão: manda o passo que o botão aponta.
async function avancarConversa(sb: Qualquer, idPessoa: string, idAutomacao: string, idPasso: string) {
  const { data: lista } = await sb.from("ig_automations").select("*").eq("id", idAutomacao).eq("active", true).limit(1);
  const automacao = lista && lista.length > 0 ? lista[0] : null;
  if (!automacao) return;                          // apagada ou desligada: a conversa para
  const passo = acharPasso(automacao, idPasso);
  if (!passo) return;

  const r = await enviarPasso(sb, { id: idPessoa }, automacao.id, passo);
  await registrarEntrega(sb, {
    ig_user_id: idPessoa, automation_id: automacao.id, canal: "dm", tipo: "flow",
    status: r.ok ? "ok" : "erro", motivo: r.ok ? null : r.erro?.mensagem,
  });
  if (!r.ok) return;
  await aposEnviarPasso(sb, automacao, passo, idPessoa);
  const erroAnexo = await enviarAnexos(sb, idPessoa, passo.assets);
  if (erroAnexo) {
    await registrarEntrega(sb, {
      ig_user_id: idPessoa, automation_id: automacao.id, canal: "dm", tipo: "asset",
      status: "erro", motivo: "Arquivo não enviado: " + erroAnexo.mensagem,
    });
  }
}

// Pegou o dado que o passo pediu (e-mail, telefone...): valida, salva e segue.
async function receberDado(sb: Qualquer, lead: Qualquer, textoBruto: string) {
  const campo: string = lead.expecting.field;
  const valor = textoBruto.trim();
  let valido = true;
  if (campo === "email") valido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
  if (campo === "telefone") valido = valor.replace(/\D/g, "").length >= 8;

  if (!valido) {
    const aviso = campo === "email"
      ? "Hmm, esse e-mail parece estranho. Pode mandar de novo?"
      : "Não consegui entender esse número. Pode mandar de novo, com o DDD?";
    await tentarEnviar(sb, { id: lead.ig_user_id }, { text: aviso }, "texto");
    return;
  }

  const atualizacao: Record<string, unknown> = {
    ig_user_id: lead.ig_user_id,
    expecting: null,
    campos: { ...(lead.campos ?? {}), [campo]: valor },
  };
  if (campo === "email") atualizacao.email = valor;
  if (campo === "telefone") atualizacao.telefone = valor;
  await salvarLead(sb, atualizacao);

  const proximo = lead.expecting.next;
  if (proximo === null || proximo === undefined) return;
  const { data: lista } = await sb.from("ig_automations").select("*").eq("id", lead.expecting.automation_id).limit(1);
  const automacao = lista && lista.length > 0 ? lista[0] : null;
  const passo = automacao ? acharPasso(automacao, proximo) : null;
  if (!automacao || !passo) return;
  const r = await enviarPasso(sb, { id: lead.ig_user_id }, automacao.id, passo);
  await registrarEntrega(sb, {
    ig_user_id: lead.ig_user_id, automation_id: automacao.id, canal: "dm", tipo: "flow",
    status: r.ok ? "ok" : "erro", motivo: r.ok ? null : r.erro?.mensagem,
  });
  if (r.ok) await aposEnviarPasso(sb, automacao, passo, lead.ig_user_id);
}

// ---- a porta de entrada ----
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // a) Aperto de mão: o Meta confere se o endereço é seu.
  if (req.method === "GET") {
    const verifyToken = Deno.env.get("VERIFY_TOKEN") ?? "";
    if (
      url.searchParams.get("hub.mode") === "subscribe" && verifyToken !== "" &&
      url.searchParams.get("hub.verify_token") === verifyToken
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("Proibido", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });

  // b) Recebimento
  const corpoBruto = await req.text();
  const assinaturaOk = await assinaturaValida(req, corpoBruto);
  if (!assinaturaOk) {
    // Por padrão roda em MODO TESTE (só avisa no log). Depois de testar tudo,
    // ligue APP_SECRET_ENFORCE=true pra recusar pedidos que não vêm do Instagram.
    if ((Deno.env.get("APP_SECRET_ENFORCE") ?? "false").toLowerCase() === "true") {
      return new Response("Assinatura inválida", { status: 403 });
    }
    console.warn("Assinatura inválida ou ausente (modo teste: processando mesmo assim).");
  }

  let corpo: Qualquer;
  try {
    corpo = JSON.parse(corpoBruto);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const sb = criarBanco();
  try {
    for (const entrada of corpo?.entry ?? []) {
      const idConta = entrada?.id ? String(entrada.id) : null;
      for (const mudanca of entrada?.changes ?? []) {
        if (mudanca?.field === "comments") await tratarComentario(sb, mudanca.value, idConta);
      }
      for (const evento of entrada?.messaging ?? []) {
        await tratarMensagem(sb, evento, idConta);
      }
    }
  } catch (erro) {
    // Sempre responde 200, senão o Instagram fica reenviando o mesmo aviso.
    console.error("erro ao processar o aviso do Instagram", erro);
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
});
