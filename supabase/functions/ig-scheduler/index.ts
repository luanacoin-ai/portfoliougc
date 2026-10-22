// ============================================================================
// FUNÇÃO "ig-scheduler" (o carteiro da automação de DM do Instagram)
// ============================================================================
// O que ela faz, a cada 1 minuto (chamada pelo relógio do banco, o pg_cron):
//   1) Esvazia a fila de envios (ig_send_queue): são as DMs que o freio
//      segurou porque passou do teto por minuto, hora ou dia. Pra cada uma,
//      pede uma ficha ao freio e, se tiver, manda.
//   2) Manda os passos com atraso (ig_scheduled) que já venceram.
//   3) De hora em hora, faz uma faxina nos registros velhos.
//
// Quem chama: o relógio do banco (pg_cron), sem login. Por isso esta função
// precisa ser publicada com a "Verify JWT" DESLIGADA. Quem garante que é o
// relógio, e não um estranho, é a senha SCHED_SECRET que vem no cabeçalho
// "x-sched-key". Sem a senha certa, ela recusa.
//
// Segredos (nos segredos da função no painel do Supabase, nunca aqui):
//   IG_ACCESS_TOKEN, IG_ACCOUNT_ID, GRAPH_API_VERSION, SCHED_SECRET
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
// Daqui pra baixo é só do ig-scheduler
// ---------------------------------------------------------------------------

const SETE_DIAS_MS = 7 * 24 * 3600 * 1000;   // comentário mais velho que isso já não aceita resposta privada
const MAXIMO_TENTATIVAS = 5;

function respostaJSON(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function iguaisConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

async function buscarAutomacao(sb: Qualquer, id: string): Promise<Qualquer | null> {
  const { data } = await sb.from("ig_automations").select("*").eq("id", id).limit(1);
  return data && data.length > 0 ? data[0] : null;
}

// 1) A fila de envios que o freio segurou.
async function esvaziarFila(sb: Qualquer, resumo: Qualquer) {
  const { data: itens, error } = await sb.from("ig_send_queue").select("*")
    .eq("status", "pendente").order("created_at").limit(20);
  if (error) {
    console.error("não consegui ler a fila", error.message);
    return;
  }

  for (const item of itens ?? []) {
    // Comentário velho demais: o Instagram não deixa mais responder.
    if (Date.now() - new Date(item.created_at).getTime() > SETE_DIAS_MS) {
      await sb.from("ig_send_queue").update({ status: "expirado", last_error: "Passou de 7 dias" }).eq("id", item.id);
      await registrarEntrega(sb, {
        ig_user_id: item.ig_user_id, automation_id: item.automation_id, canal: "private_reply", tipo: "flow",
        status: "erro", motivo: "Ficou na fila mais de 7 dias, o Instagram já não aceita resposta",
      });
      resumo.fila.expirados++;
      continue;
    }

    const automacao = await buscarAutomacao(sb, item.automation_id);
    const passo0: Passo | undefined = automacao?.flow?.steps?.[0];
    if (!automacao || !automacao.active || !passo0) {
      await sb.from("ig_send_queue").update({ status: "erro", last_error: "A automação foi apagada, desligada ou está sem mensagem" }).eq("id", item.id);
      resumo.fila.erros++;
      continue;
    }

    // Sem ficha do freio: para por aqui, o resto espera o próximo minuto.
    if (!(await pegarFicha(sb))) {
      resumo.fila.adiados++;
      break;
    }

    const r = await enviarPasso(sb, { comment_id: item.comment_id }, automacao.id, passo0);
    await registrarResultadoFreio(sb, r.ok, !r.ok && !!r.erro?.duro);
    const tentativas = (item.tentativas ?? 0) + 1;

    if (r.ok) {
      await sb.from("ig_send_queue").update({ status: "enviado", sent_at: new Date().toISOString(), tentativas, last_error: null }).eq("id", item.id);
      await registrarEntrega(sb, {
        ig_user_id: item.ig_user_id, automation_id: automacao.id, canal: "private_reply", tipo: "flow",
        status: "ok", motivo: "Enviado pela fila",
      });
      await salvarLead(sb, { ig_user_id: item.ig_user_id, username: item.username, last_source: "comment", automation_id: automacao.id });
      await aposEnviarPasso(sb, automacao, passo0, item.ig_user_id, item.username);
      const erroAnexo = await enviarAnexos(sb, item.ig_user_id, passo0.assets);
      if (erroAnexo) {
        await registrarEntrega(sb, {
          ig_user_id: item.ig_user_id, automation_id: automacao.id, canal: "dm", tipo: "asset",
          status: "erro", motivo: "Arquivo não enviado: " + erroAnexo.mensagem,
        });
      }
      resumo.fila.enviados++;
    } else {
      const erro = r.erro!;
      const vaiTentarDeNovo = (erro.duro || erro.transitorio) && tentativas < MAXIMO_TENTATIVAS;
      await sb.from("ig_send_queue").update({
        status: vaiTentarDeNovo ? "pendente" : "erro", tentativas, last_error: erro.mensagem,
      }).eq("id", item.id);
      if (!vaiTentarDeNovo) {
        await registrarEntrega(sb, {
          ig_user_id: item.ig_user_id, automation_id: automacao.id, canal: "private_reply", tipo: "flow",
          status: "erro", motivo: erro.mensagem,
        });
        resumo.fila.erros++;
      } else {
        resumo.fila.adiados++;
        if (erro.duro) break;           // bloqueio ou limite: para de insistir neste minuto
      }
    }
    await esperar(300);
  }
}

// 2) Passos com atraso que já venceram ("mande a próxima mensagem daqui a X").
async function enviarPassosAgendados(sb: Qualquer, resumo: Qualquer) {
  const { data: devidos, error } = await sb.from("ig_scheduled").select("*")
    .eq("sent", false).lte("send_at", new Date().toISOString()).order("send_at").limit(50);
  if (error) {
    console.error("não consegui ler os passos com atraso", error.message);
    return;
  }

  for (const item of devidos ?? []) {
    // Reivindica antes de enviar: se duas execuções se cruzarem, só uma envia.
    const { data: reivindicado } = await sb.from("ig_scheduled").update({ sent: true })
      .eq("id", item.id).eq("sent", false).select("id");
    if (!reivindicado || reivindicado.length === 0) continue;

    const automacao = await buscarAutomacao(sb, item.automation_id);
    const passo = automacao ? acharPasso(automacao, item.step_id) : null;
    if (!automacao || !automacao.active || !passo) continue;

    const r = await enviarPasso(sb, { id: item.ig_user_id }, automacao.id, passo);
    await registrarEntrega(sb, {
      ig_user_id: item.ig_user_id, automation_id: automacao.id, canal: "dm", tipo: "flow",
      status: r.ok ? "ok" : "erro", motivo: r.ok ? "Passo com atraso" : r.erro?.mensagem,
    });
    if (r.ok) {
      await aposEnviarPasso(sb, automacao, passo, item.ig_user_id);
      await enviarAnexos(sb, item.ig_user_id, passo.assets);
      resumo.atrasados.enviados++;
    } else {
      resumo.atrasados.erros++;
    }
    await esperar(300);
  }
}

// 3) Faxina: apaga registros técnicos velhos pra o banco não crescer à toa.
async function faxina(sb: Qualquer) {
  const dias = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
  await sb.from("ig_processed_events").delete().lt("created_at", dias(3));
  await sb.from("ig_bot_sends").delete().lt("created_at", dias(3));
  await sb.from("ig_scheduled").delete().eq("sent", true).lt("created_at", dias(7));
  await sb.from("ig_send_queue").delete().neq("status", "pendente").lt("created_at", dias(30));

  // Privacidade (LGPD): a política promete apagar os contatos da automação 12 meses
  // depois da última interação. "updated_at" do contato muda a cada nova interação.
  const { error: erroLeads } = await sb.from("ig_leads").delete().lt("updated_at", dias(365));
  if (erroLeads) console.error("não consegui apagar contatos antigos", erroLeads.message);
  await sb.from("ig_deliveries").delete().lt("ts", dias(365));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respostaJSON({ erro: "Método não permitido." }, 405);

  const senha = Deno.env.get("SCHED_SECRET") ?? "";
  const enviada = req.headers.get("x-sched-key") ?? "";
  if (!senha || !iguaisConstante(senha, enviada)) {
    return respostaJSON({ erro: "Não autorizado." }, 401);
  }

  const sb = criarBanco();
  const resumo = {
    fila: { enviados: 0, erros: 0, expirados: 0, adiados: 0 },
    atrasados: { enviados: 0, erros: 0 },
  };
  try {
    await esvaziarFila(sb, resumo);
    await enviarPassosAgendados(sb, resumo);
    if (new Date().getMinutes() === 0) await faxina(sb);   // uma vez por hora
  } catch (erro) {
    console.error("erro no ig-scheduler", erro);
    return respostaJSON({ ...resumo, erro: erro instanceof Error ? erro.message : "erro desconhecido" }, 500);
  }
  return respostaJSON(resumo);
});
