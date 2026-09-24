/* ============================================================================
   ABA: 📜 ROTEIROS
   Biblioteca de vídeos transcritos (seus e de outras creators), com
   transcrição automática pela API da Supadata.

   Este arquivo é carregado DEPOIS do script principal do admin (index.html),
   então pode usar direto tudo que já existe lá: banco, buscarSeguro, escapa,
   el, icone, abrirModal, fecharModal, faixaAviso, formatarData, irParaAba,
   ABAS e abaAtual.
============================================================================ */
"use strict";

var SUPADATA_BASE_URL = "https://api.supadata.ai/v1";
var ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
var ANTHROPIC_MODEL = "claude-opus-5-5";

var FONTE_ROTULO_ROTEIRO = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", manual: "Escrito à mão" };
var FONTE_ICONE_ROTEIRO = { instagram: "instagram", tiktok: "tiktok", youtube: "youtube", manual: "roteiros" };

var buscaRoteirosTexto = "";
var filtroRoteiroDeQuem = "todos";
var filtroRoteiroTag = "todas";
var deQuemNovoRoteiro = "outra";

var cacheRoteiros = [];
var chaveSupadataCache = null;
var chaveIACache = null;
var roteirosEmAndamento = {};
var idFluxoPrincipalRoteiro = null;

/* Junta dois objetos sem usar Object.assign, pra ficar no mesmo padrão do
   resto do arquivo (sem recursos novos de JavaScript). */
function mesclarObjetos(base, extra){
  var resultado = {};
  var chave;
  for(chave in base){ if(base.hasOwnProperty(chave)) resultado[chave] = base[chave]; }
  for(chave in extra){ if(extra.hasOwnProperty(chave)) resultado[chave] = extra[chave]; }
  return resultado;
}

/* ============================================================================
   LINK: limpar, validar, descobrir fonte e perfil
============================================================================ */
function limparLinkRoteiro(bruto){
  var url = String(bruto || "").trim();
  if(!url) return "";
  url = url.replace(/instagram\.com\/reels\//i, "instagram.com/reel/");
  if(/^https?:\/\//i.test(url)){
    try{
      var u = new URL(url);
      var paraRemover = [];
      u.searchParams.forEach(function(valor, chaveParam){
        if(chaveParam === "igsh" || chaveParam.toLowerCase().indexOf("utm_") === 0) paraRemover.push(chaveParam);
      });
      paraRemover.forEach(function(chaveParam){ u.searchParams.delete(chaveParam); });
      url = u.toString();
    }catch(erro){ /* se não der pra interpretar como URL, mantém como veio */ }
  }
  return url;
}

function linkValidoRoteiro(url){
  return /^https?:\/\//i.test(url);
}

function identificarFonteEPerfil(url){
  var resultado = { fonte: null, perfil: null };
  if(/instagram\.com/i.test(url)){
    resultado.fonte = "instagram";
    var mPerfil = url.match(/instagram\.com\/([A-Za-z0-9_.]+)\/reels?\//i);
    if(mPerfil){
      var candidato = mPerfil[1].toLowerCase();
      if(candidato !== "reel" && candidato !== "reels" && candidato !== "p") resultado.perfil = "@" + mPerfil[1];
    }
  } else if(/tiktok\.com/i.test(url)){
    resultado.fonte = "tiktok";
    var mTik = url.match(/tiktok\.com\/@([A-Za-z0-9_.]+)/i);
    if(mTik) resultado.perfil = "@" + mTik[1];
  } else if(/youtube\.com|youtu\.be/i.test(url)){
    resultado.fonte = "youtube";
  }
  return resultado;
}

function extrairIdEmbedRoteiro(url, fonte){
  var m;
  if(fonte === "instagram"){
    m = url.match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?reels?\/([A-Za-z0-9_-]+)/i);
    return m ? m[1] : null;
  }
  if(fonte === "youtube"){
    m = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i);
    if(m) return m[1];
    m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
    if(m) return m[1];
    m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
    if(m) return m[1];
    return null;
  }
  if(fonte === "tiktok"){
    m = url.match(/\/video\/(\d+)/);
    return m ? m[1] : null;
  }
  return null;
}

function montarEmbedRoteiro(r){
  if(!r.url) return null;
  var id = extrairIdEmbedRoteiro(r.url, r.fonte);
  if(!id) return null;
  if(r.fonte === "instagram") return "https://www.instagram.com/reel/" + id + "/embed";
  if(r.fonte === "youtube") return "https://www.youtube.com/embed/" + id;
  if(r.fonte === "tiktok") return "https://www.tiktok.com/embed/v2/" + id;
  return null;
}

/* ============================================================================
   CONFIGURAÇÃO: chave da Supadata (tabela configuracoes)
============================================================================ */
async function buscarChaveSupadata(forcarAtualizacao){
  if(!forcarAtualizacao && chaveSupadataCache !== null) return chaveSupadataCache;
  var res = await buscarSeguro(banco.from("configuracoes").select("valor").eq("chave", "supadata_api_key"));
  chaveSupadataCache = (res.ok && res.dados[0] && res.dados[0].valor) ? res.dados[0].valor : "";
  return chaveSupadataCache;
}

async function salvarChaveSupadata(chave){
  var res = await buscarSeguro(banco.from("configuracoes").upsert({
    chave: "supadata_api_key",
    valor: chave,
    updated_at: new Date().toISOString()
  }));
  if(res.ok) chaveSupadataCache = chave;
  return res;
}

async function buscarSaldoSupadata(chave){
  try{
    var resposta = await fetch(SUPADATA_BASE_URL + "/me", { headers: { "x-api-key": chave } });
    var corpo = null;
    try{ corpo = await resposta.json(); }catch(erroJson){}
    if(!resposta.ok || !corpo) return { ok: false };
    return { ok: true, plano: corpo.plan, usados: corpo.usedCredits, total: corpo.maxCredits };
  }catch(erro){
    return { ok: false };
  }
}

/* ============================================================================
   CONFIGURAÇÃO: chave da IA (Claude, tabela configuracoes)
============================================================================ */
async function buscarChaveIA(forcarAtualizacao){
  if(!forcarAtualizacao && chaveIACache !== null) return chaveIACache;
  var res = await buscarSeguro(banco.from("configuracoes").select("valor").eq("chave", "anthropic_api_key"));
  chaveIACache = (res.ok && res.dados[0] && res.dados[0].valor) ? res.dados[0].valor : "";
  return chaveIACache;
}

async function salvarChaveIA(chave){
  var res = await buscarSeguro(banco.from("configuracoes").upsert({
    chave: "anthropic_api_key",
    valor: chave,
    updated_at: new Date().toISOString()
  }));
  if(res.ok) chaveIACache = chave;
  return res;
}

/* ============================================================================
   CHAMADAS À SUPADATA (transcrição)
============================================================================ */
function extrairTextoTranscricaoSupadata(corpo){
  if(!corpo) return "";
  var conteudo = corpo.content;
  if(conteudo == null) return "";
  if(typeof conteudo === "string") return conteudo;
  if(Array.isArray(conteudo)){
    return conteudo.map(function(trecho){ return trecho && trecho.text ? trecho.text : ""; }).join(" ");
  }
  return "";
}

function mensagemErroSupadata(corpo, statusHttp){
  var codigo = String((corpo && (corpo.error || corpo.code)) || "").toLowerCase();
  var detalhes = String((corpo && (corpo.details || corpo.message)) || "");
  var detalhesMin = detalhes.toLowerCase();

  if(codigo.indexOf("limit-exceeded") !== -1 || codigo.indexOf("limit_exceeded") !== -1){
    if(detalhesMin.indexOf("rate") !== -1){
      return "Você fez chamadas demais em pouco tempo pra Supadata. Espera 1 minuto e tenta de novo.";
    }
    return "Acabaram os créditos da sua conta Supadata esse mês. Espera o mês virar ou faça upgrade do plano em supadata.ai.";
  }
  if(codigo.indexOf("transcript-unavailable") !== -1 || statusHttp === 206){
    return "Não achei fala nesse vídeo. Costuma ser vídeo só com música ou só com texto na tela.";
  }
  if(statusHttp === 401 || statusHttp === 403){
    return "Sua chave da Supadata não é válida. Confira se colou certo no campo de configuração.";
  }
  if(statusHttp === 429){
    return "Você fez chamadas demais em pouco tempo pra Supadata. Espera 1 minuto e tenta de novo.";
  }
  return "Não consegui transcrever esse vídeo agora" + (detalhes ? " (" + detalhes + ")" : "") + ". Tenta de novo em alguns minutos.";
}

async function chamarTranscricaoSupadata(url, chave){
  var alvo = SUPADATA_BASE_URL + "/transcript?url=" + encodeURIComponent(url) + "&mode=auto&text=true&lang=pt";
  var resposta;
  try{
    resposta = await fetch(alvo, { headers: { "x-api-key": chave } });
  }catch(erro){
    return { ok: false, tipo: "erro", mensagem: "Não consegui falar com a Supadata. Confira sua internet e tenta de novo." };
  }
  var corpo = null;
  try{ corpo = await resposta.json(); }catch(erroJson){}

  if(resposta.status === 202 && corpo && corpo.jobId){
    return { ok: true, tipo: "job", jobId: corpo.jobId };
  }
  if(resposta.ok){
    var texto = extrairTextoTranscricaoSupadata(corpo).trim();
    if(!texto || (corpo && corpo.lang === "none")){
      return { ok: true, tipo: "vazio" };
    }
    return { ok: true, tipo: "pronto", texto: texto, segmentos: Array.isArray(corpo && corpo.content) ? corpo.content : null };
  }
  return { ok: false, tipo: "erro", mensagem: mensagemErroSupadata(corpo, resposta.status) };
}

async function consultarJobSupadata(jobId, chave){
  var resposta;
  try{
    resposta = await fetch(SUPADATA_BASE_URL + "/transcript/" + encodeURIComponent(jobId), { headers: { "x-api-key": chave } });
  }catch(erro){
    return { ok: false, tipo: "erro", mensagem: "Não consegui falar com a Supadata. Confira sua internet e tenta de novo." };
  }
  var corpo = null;
  try{ corpo = await resposta.json(); }catch(erroJson){}

  if(!resposta.ok){
    return { ok: false, tipo: "erro", mensagem: mensagemErroSupadata(corpo, resposta.status) };
  }
  var status = corpo && corpo.status;
  if(status === "completed"){
    var texto = extrairTextoTranscricaoSupadata(corpo).trim();
    if(!texto || corpo.lang === "none"){
      return { ok: true, tipo: "vazio" };
    }
    return { ok: true, tipo: "pronto", texto: texto, segmentos: Array.isArray(corpo.content) ? corpo.content : null };
  }
  if(status === "failed"){
    return { ok: false, tipo: "erro", mensagem: mensagemErroSupadata(corpo, resposta.status) };
  }
  return { ok: true, tipo: "aguardando" };
}

/* ============================================================================
   ANÁLISE COM IA (Claude): separa gancho, desenvolvimento, CTA, expressões
   e o motivo do roteiro prender atenção, a partir da transcrição.
============================================================================ */
function mensagemErroIA(corpo, statusHttp){
  var msg = (corpo && corpo.error && corpo.error.message) || "";
  var msgMin = msg.toLowerCase();
  if(statusHttp === 401) return "Sua chave de IA não é válida. Confira se colou certo no campo de configuração.";
  if(msgMin.indexOf("credit balance") !== -1 || msgMin.indexOf("purchase credits") !== -1){
    return "Sua conta da Anthropic ainda não tem créditos. Vai em console.anthropic.com, na seção \"Plans & Billing\", e carrega um valor pra poder usar.";
  }
  if(statusHttp === 429) return "Você fez chamadas demais em pouco tempo pra IA. Espera um minuto e tenta de novo.";
  var tipoErro = (corpo && corpo.error && corpo.error.type) || "";
  if(tipoErro === "overloaded_error") return "A IA está sobrecarregada agora. Tenta de novo daqui a pouco.";
  return "Não consegui analisar esse roteiro com a IA agora" + (msg ? " (" + msg + ")" : "") + ".";
}

/* O modelo sempre "pensa" antes de responder, então a resposta vem com um
   bloco de raciocínio (vazio) antes do texto. Junta só os blocos de texto. */
function textoDaRespostaIA(dados){
  if(!dados || !dados.content) return "";
  return dados.content
    .filter(function(bloco){ return bloco.type === "text"; })
    .map(function(bloco){ return bloco.text; })
    .join("")
    .trim();
}

async function analisarRoteiroComIA(transcricao, chaveIA){
  var esquema = {
    type: "object",
    properties: {
      estrutura: { type: "array", items: { type: "string" } },
      gancho: { type: "string" },
      desenvolvimento: { type: "array", items: { type: "string" } },
      cta: { type: "string" },
      expressoes: { type: "array", items: { type: "string" } },
      por_que_prende: { type: "string" }
    },
    required: ["estrutura", "gancho", "desenvolvimento", "cta", "expressoes", "por_que_prende"],
    additionalProperties: false
  };

  var instrucao = "Analise a transcrição de vídeo abaixo, escrita em português do Brasil, e devolva a estrutura dela.\n\n" +
    "\"estrutura\": de 2 a 4 palavras ou expressões curtas que classificam o formato e o assunto do vídeo, por exemplo \"tutorial\" ou \"produto de alto valor\".\n" +
    "\"gancho\": a frase ou pergunta de abertura que prende atenção nos primeiros segundos.\n" +
    "\"desenvolvimento\": os passos ou blocos principais do meio do vídeo, cada item começando com \"Passo N: \".\n" +
    "\"cta\": a chamada pra ação no final do vídeo.\n" +
    "\"expressoes\": de 4 a 8 palavras ou expressões específicas que a pessoa usa, tiradas literalmente da transcrição.\n" +
    "\"por_que_prende\": uma ou duas frases explicando por que esse roteiro prende atenção.\n\n" +
    "Transcrição:\n" + transcricao;

  var corpoPedido = {
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: instrucao }],
    output_config: { format: { type: "json_schema", schema: esquema } }
  };

  var resposta;
  try{
    resposta = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chaveIA,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(corpoPedido)
    });
  }catch(erro){
    return { ok: false, mensagem: "Não consegui falar com a IA. Confira sua internet e tenta de novo." };
  }

  var dados = null;
  try{ dados = await resposta.json(); }catch(erroJson){}

  if(!resposta.ok){
    return { ok: false, mensagem: mensagemErroIA(dados, resposta.status) };
  }

  var textoResposta = textoDaRespostaIA(dados);
  var analise;
  try{
    analise = JSON.parse(textoResposta);
  }catch(erroParse){
    return { ok: false, mensagem: "A IA respondeu num formato que não consegui ler. Tenta de novo." };
  }

  return { ok: true, analise: analise };
}

/* Acompanha a transcrição do início ao fim: manda o pedido, e se vier 202,
   consulta o job a cada 5 segundos até terminar ou passar de 6 minutos.
   Chama aoAtualizar(segundosPassados) uma vez por segundo, pra tela mostrar
   o andamento. */
function transcreverComEspera(url, chave, aoAtualizar){
  return new Promise(function(resolve){
    var resolvido = false;
    var inicio = Date.now();
    var ultimoJobId = null;
    var tickInterval;

    function segundosPassados(){ return Math.round((Date.now() - inicio) / 1000); }

    function resolverUmaVez(valor){
      if(resolvido) return;
      resolvido = true;
      clearInterval(tickInterval);
      resolve(valor);
    }

    tickInterval = setInterval(function(){
      var seg = segundosPassados();
      aoAtualizar(seg);
      if(seg >= 360){
        resolverUmaVez({ ok: false, tipo: "erro", mensagem: "Essa transcrição está demorando mais que o normal, mais de 6 minutos. Tenta de novo daqui a pouco." });
      }
    }, 1000);
    aoAtualizar(0);

    async function passo(){
      if(resolvido) return;
      var resultado = ultimoJobId ? await consultarJobSupadata(ultimoJobId, chave) : await chamarTranscricaoSupadata(url, chave);
      if(resolvido) return;
      if(!resultado.ok){ resolverUmaVez(resultado); return; }
      if(resultado.tipo === "job"){ ultimoJobId = resultado.jobId; setTimeout(passo, 5000); return; }
      if(resultado.tipo === "aguardando"){ setTimeout(passo, 5000); return; }
      resolverUmaVez(resultado);
    }
    passo();
  });
}

/* ============================================================================
   ABA PRINCIPAL
============================================================================ */
async function abaRoteiros(painel){
  var chaveAtual = await buscarChaveSupadata(true);
  var chaveIAAtual = await buscarChaveIA(true);

  var res = await buscarSeguro(banco.from("roteiros").select("*").order("created_at", { ascending: false }));
  var html = "";
  if(!res.ok) html += faixaAviso("Não consegui carregar sua biblioteca de roteiros. Confira se a tabela existe no seu Supabase (veja o arquivo sql-roteiros.sql).", "erro");

  cacheRoteiros = res.dados;

  html += '<p style="font-size:.85rem; color:#6b6353; margin-bottom:16px;">Cole o link de um reel e eu transcrevo. Serve pros seus e pros das outras, com etiqueta pra você separar.</p>';

  html += '<div style="display:flex; gap:14px; flex-wrap:wrap;">' +
    '<div class="painel-branco" id="painelConfigSupadata" style="flex:1; min-width:280px;"></div>' +
    '<div class="painel-branco" id="painelConfigIA" style="flex:1; min-width:280px;"></div>' +
  '</div>';

  html += '<div class="painel-branco">' +
    '<div class="barra-acoes">' +
      '<div class="campo-busca" style="flex:2; min-width:260px;"><input id="campoLinkRoteiro" placeholder="Cole aqui: instagram.com/reel/... · tiktok.com/... · youtube.com/..."></div>' +
      '<select id="seletorDeQuemNovo" class="btn">' +
        '<option value="outra" ' + (deQuemNovoRoteiro === "outra" ? "selected" : "") + '>De outra pessoa</option>' +
        '<option value="minha" ' + (deQuemNovoRoteiro === "minha" ? "selected" : "") + '>Meu</option>' +
      '</select>' +
      '<button type="button" class="btn btn-principal" id="btnTranscrever">🎧 Transcrever</button>' +
      '<button type="button" class="btn" id="btnEscreverNaMao">' + icone("mais") + ' Escrever na mão</button>' +
    '</div>' +
    '<div id="avisoRoteiros"></div>' +
  '</div>';

  html += '<div class="barra-acoes">' +
    '<div class="campo-busca">' + icone("busca") + '<input id="buscaRoteiros" placeholder="Buscar por transcrição, perfil, título ou notas" value="' + escapa(buscaRoteirosTexto) + '"></div>' +
    '<div class="chips" id="chipsDeQuemRoteiro"></div>' +
    '<button type="button" class="btn" id="btnEstudarClaude">🧠 Estudar com o Claude</button>' +
  '</div>';
  html += '<div class="chips" id="chipsTagRoteiro" style="margin-bottom:14px;"></div>';

  html += '<div id="gradeRoteiros"></div>';

  painel.innerHTML = html;

  montarPainelConfigSupadata(document.getElementById("painelConfigSupadata"), chaveAtual);
  montarPainelConfigIA(document.getElementById("painelConfigIA"), chaveIAAtual);

  document.getElementById("seletorDeQuemNovo").addEventListener("change", function(e){ deQuemNovoRoteiro = e.target.value; });
  document.getElementById("btnTranscrever").addEventListener("click", function(){ iniciarFluxoTranscricao(); });
  document.getElementById("campoLinkRoteiro").addEventListener("keydown", function(e){
    if(e.key === "Enter"){ e.preventDefault(); iniciarFluxoTranscricao(); }
  });
  document.getElementById("btnEscreverNaMao").addEventListener("click", function(){ abrirModalEditarRoteiro(null); });

  document.getElementById("buscaRoteiros").addEventListener("input", function(e){
    buscaRoteirosTexto = e.target.value;
    desenharBibliotecaRoteiros(cacheRoteiros);
  });

  var chipsDeQuem = document.getElementById("chipsDeQuemRoteiro");
  var opcoesDeQuem = [{ v: "todos", r: "Todos" }, { v: "minha", r: "Meus" }, { v: "outra", r: "De outras" }];
  opcoesDeQuem.forEach(function(op){
    var chip = el('<button type="button" class="chip ' + (filtroRoteiroDeQuem === op.v ? "ativo" : "") + '">' + op.r + '</button>');
    chip.addEventListener("click", function(){
      filtroRoteiroDeQuem = op.v;
      Array.prototype.forEach.call(chipsDeQuem.children, function(c){ c.classList.remove("ativo"); });
      chip.classList.add("ativo");
      desenharBibliotecaRoteiros(cacheRoteiros);
    });
    chipsDeQuem.appendChild(chip);
  });

  var chipsTag = document.getElementById("chipsTagRoteiro");
  var tagsExistentes = todasTagsUnicasRoteiro(cacheRoteiros);
  var opcoesTag = [{ v: "todas", r: "Todas as tags" }].concat(tagsExistentes.map(function(t){ return { v: t, r: t }; }));
  opcoesTag.forEach(function(op){
    var chip = el('<button type="button" class="chip ' + (filtroRoteiroTag === op.v ? "ativo" : "") + '">' + escapa(op.r) + '</button>');
    chip.addEventListener("click", function(){
      filtroRoteiroTag = op.v;
      Array.prototype.forEach.call(chipsTag.children, function(c){ c.classList.remove("ativo"); });
      chip.classList.add("ativo");
      desenharBibliotecaRoteiros(cacheRoteiros);
    });
    chipsTag.appendChild(chip);
  });

  document.getElementById("btnEstudarClaude").addEventListener("click", function(e){
    var botao = e.currentTarget;
    var prompt = montarPromptEstudarRoteiros(cacheRoteiros);
    var areaAviso = document.getElementById("avisoRoteiros");
    if(!prompt){
      if(areaAviso) areaAviso.innerHTML = faixaAviso("Você ainda não tem roteiros marcados como \"De outra\" com transcrição pra estudar.", "erro");
      return;
    }
    var original = botao.innerHTML;
    navigator.clipboard.writeText(prompt).then(function(){
      botao.innerHTML = "copiado ✓";
      setTimeout(function(){ botao.innerHTML = original; }, 1800);
    }).catch(function(){
      botao.innerHTML = "não deu pra copiar";
      setTimeout(function(){ botao.innerHTML = original; }, 1800);
    });
  });

  desenharBibliotecaRoteiros(cacheRoteiros);
}

/* ============================================================================
   PAINEL: CHAVE DA SUPADATA
============================================================================ */
function montarPainelConfigSupadata(area, chaveAtual){
  var textoStatus = chaveAtual
    ? '<p style="font-size:.8rem; color:#8a8272; margin-bottom:10px;">Chave salva, terminando em <strong>' + escapa(chaveAtual.slice(-4)) + '</strong>.</p>'
    : '<p style="font-size:.8rem; color:#8a8272; margin-bottom:10px;">Você ainda não tem uma chave salva. Crie uma conta grátis em <a href="https://supadata.ai" target="_blank" rel="noopener">supadata.ai</a>, são 100 créditos por mês, sem precisar de cartão. Copie a sua API key e cole aqui embaixo.</p>';

  area.innerHTML =
    '<p class="painel-titulo">🔑 Chave da Supadata</p>' +
    textoStatus +
    '<form id="formChaveSupadata" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">' +
      '<div class="campo" style="flex:1; min-width:220px; margin-bottom:0;">' +
        '<label>' + (chaveAtual ? "Trocar chave" : "Colar chave") + '</label>' +
        '<input type="password" id="campoChaveSupadata" placeholder="' + (chaveAtual ? "Cole uma chave nova pra trocar" : "Cole sua API key aqui") + '">' +
      '</div>' +
      '<button type="submit" class="btn btn-principal">Salvar</button>' +
    '</form>' +
    '<p id="saldoSupadata" style="font-size:.76rem; color:#8a8272; margin-top:10px;"></p>' +
    '<p class="aviso erro oculto" id="erroChaveSupadata"></p>';

  document.getElementById("formChaveSupadata").addEventListener("submit", async function(e){
    e.preventDefault();
    var campo = document.getElementById("campoChaveSupadata");
    var novaChave = campo.value.trim();
    if(!novaChave) return;
    var res = await salvarChaveSupadata(novaChave);
    var erroEl = document.getElementById("erroChaveSupadata");
    if(!res.ok){
      erroEl.textContent = "Não consegui salvar a chave: " + res.mensagem;
      erroEl.classList.remove("oculto");
      return;
    }
    irParaAba("roteiros");
  });

  atualizarSaldoSupadataNaTela(chaveAtual);
}

async function atualizarSaldoSupadataNaTela(chave){
  var elSaldo = document.getElementById("saldoSupadata");
  if(!elSaldo) return;
  if(!chave){ elSaldo.textContent = ""; return; }
  elSaldo.textContent = "Consultando seus créditos...";
  var saldo = await buscarSaldoSupadata(chave);
  elSaldo = document.getElementById("saldoSupadata");
  if(!elSaldo) return;
  if(!saldo.ok){ elSaldo.textContent = "Não consegui consultar seus créditos agora."; return; }
  elSaldo.textContent = saldo.usados + " de " + saldo.total + " créditos usados esse mês" + (saldo.plano ? " · plano " + saldo.plano : "") + ".";
}

/* ============================================================================
   PAINEL: CHAVE DA IA (CLAUDE)
============================================================================ */
function montarPainelConfigIA(area, chaveAtual){
  var textoStatus = chaveAtual
    ? '<p style="font-size:.8rem; color:#8a8272; margin-bottom:10px;">Chave salva, terminando em <strong>' + escapa(chaveAtual.slice(-4)) + '</strong>. Com ela, assim que uma transcrição termina, a Claude já separa gancho, desenvolvimento, CTA e expressões sozinha.</p>'
    : '<p style="font-size:.8rem; color:#8a8272; margin-bottom:10px;">Opcional: cole aqui uma chave da API da Anthropic (console.anthropic.com) pra transcrição vir com o gancho, o desenvolvimento, o CTA e as expressões já separados pela Claude. Sem essa chave, o roteiro guarda só a transcrição, e você preenche o resto na mão se quiser.</p>';

  area.innerHTML =
    '<p class="painel-titulo">🧠 Chave da IA (Claude)</p>' +
    textoStatus +
    '<form id="formChaveIA" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">' +
      '<div class="campo" style="flex:1; min-width:220px; margin-bottom:0;">' +
        '<label>' + (chaveAtual ? "Trocar chave" : "Colar chave") + '</label>' +
        '<input type="password" id="campoChaveIA" placeholder="' + (chaveAtual ? "Cole uma chave nova pra trocar" : "Cole sua chave da Anthropic aqui") + '">' +
      '</div>' +
      '<button type="submit" class="btn btn-principal">Salvar</button>' +
    '</form>' +
    '<p class="aviso erro oculto" id="erroChaveIA"></p>';

  document.getElementById("formChaveIA").addEventListener("submit", async function(e){
    e.preventDefault();
    var campo = document.getElementById("campoChaveIA");
    var novaChave = campo.value.trim();
    if(!novaChave) return;
    var res = await salvarChaveIA(novaChave);
    var erroEl = document.getElementById("erroChaveIA");
    if(!res.ok){
      erroEl.textContent = "Não consegui salvar a chave: " + res.mensagem;
      erroEl.classList.remove("oculto");
      return;
    }
    irParaAba("roteiros");
  });
}

/* ============================================================================
   FLUXO DE TRANSCRIÇÃO
============================================================================ */
async function iniciarFluxoTranscricao(){
  var campoLink = document.getElementById("campoLinkRoteiro");
  var areaAviso = document.getElementById("avisoRoteiros");
  if(!campoLink || !areaAviso) return;

  var url = limparLinkRoteiro(campoLink.value);

  if(!linkValidoRoteiro(url)){
    areaAviso.innerHTML = faixaAviso("Isso não parece um link. Cole o endereço completo do vídeo, começando com https://", "erro");
    return;
  }

  var info = identificarFonteEPerfil(url);
  if(!info.fonte){
    areaAviso.innerHTML = faixaAviso("Esse link não parece ser do Instagram, TikTok ou YouTube. Cole um link de um desses três, ou use \"Escrever na mão\" pra guardar sem link.", "erro");
    return;
  }

  var chave = await buscarChaveSupadata();
  if(!chave){
    areaAviso.innerHTML = faixaAviso("Você ainda não salvou sua chave da Supadata. Crie uma conta grátis em supadata.ai, são 100 créditos por mês sem precisar de cartão, copie a sua API key e cole no campo \"Chave da Supadata\" aqui em cima.", "erro");
    return;
  }

  var existente = cacheRoteiros.filter(function(r){ return r.url === url; })[0];
  if(existente){
    var continuar = window.confirm("Esse link já está na sua biblioteca" + (existente.titulo ? " (\"" + existente.titulo + "\")" : "") + ". Quer transcrever de novo mesmo assim?");
    if(!continuar) return;
  }

  var dadosIniciais = {
    fonte: info.fonte,
    url: url,
    perfil: info.perfil || null,
    de_quem: deQuemNovoRoteiro,
    status: "processando"
  };

  areaAviso.innerHTML = faixaAviso("Criando o registro na sua biblioteca...");
  var criado = await buscarSeguro(banco.from("roteiros").insert(dadosIniciais).select());
  if(!criado.ok || !criado.dados[0]){
    areaAviso.innerHTML = faixaAviso("Não consegui criar o registro no banco: " + criado.mensagem, "erro");
    return;
  }

  var novaLinha = criado.dados[0];
  cacheRoteiros.unshift(novaLinha);
  campoLink.value = "";
  idFluxoPrincipalRoteiro = novaLinha.id;
  desenharBibliotecaRoteiros(cacheRoteiros);

  await processarTranscricao(novaLinha, chave);
}

async function retomarRoteiro(r){
  var areaAviso = document.getElementById("avisoRoteiros");
  var chave = await buscarChaveSupadata();
  if(!chave){
    if(areaAviso) areaAviso.innerHTML = faixaAviso("Você ainda não salvou sua chave da Supadata. Cole ela ali em cima pra poder tentar de novo.", "erro");
    return;
  }
  await buscarSeguro(banco.from("roteiros").update({ status: "processando", erro: null, updated_at: new Date().toISOString() }).eq("id", r.id));
  var atualizado = mesclarObjetos(r, { status: "processando", erro: null });
  atualizarCacheRoteiro(atualizado);
  idFluxoPrincipalRoteiro = r.id;
  desenharBibliotecaRoteiros(cacheRoteiros);
  await processarTranscricao(atualizado, chave);
}

async function processarTranscricao(roteiro, chave){
  roteirosEmAndamento[roteiro.id] = true;
  desenharBibliotecaRoteiros(cacheRoteiros);

  var resultado = await transcreverComEspera(roteiro.url, chave, function(seg){
    atualizarProgressoNaTelaRoteiro(roteiro.id, seg);
  });

  delete roteirosEmAndamento[roteiro.id];
  var eraFluxoPrincipal = (idFluxoPrincipalRoteiro === roteiro.id);
  if(eraFluxoPrincipal) idFluxoPrincipalRoteiro = null;

  var areaAviso = document.getElementById("avisoRoteiros");

  if(resultado.tipo === "pronto"){
    var dadosSalvar = {
      transcricao: resultado.texto,
      segmentos: resultado.segmentos || null,
      status: "pronto",
      erro: null,
      updated_at: new Date().toISOString()
    };
    await buscarSeguro(banco.from("roteiros").update(dadosSalvar).eq("id", roteiro.id));
    var linhaFinal = mesclarObjetos(roteiro, dadosSalvar);
    atualizarCacheRoteiro(linhaFinal);
    desenharBibliotecaRoteiros(cacheRoteiros);

    var chaveIA = await buscarChaveIA();
    var mensagemFinal = "✅ Terminei de ouvir o vídeo.";
    if(chaveIA){
      if(eraFluxoPrincipal && areaAviso) areaAviso.innerHTML = faixaAviso("✅ Terminei de ouvir o vídeo. Agora tô analisando a estrutura com a IA...");
      linhaFinal = await rodarAnaliseIA(linhaFinal, chaveIA);
      mensagemFinal = linhaFinal.analise_status === "pronta"
        ? "✅ Pronto, com a estrutura já analisada."
        : "✅ Terminei de ouvir o vídeo, mas não consegui analisar a estrutura (" + (linhaFinal.analise_erro || "erro desconhecido") + ").";
    }

    if(eraFluxoPrincipal && areaAviso) areaAviso.innerHTML = faixaAviso(mensagemFinal);
    if(typeof abaAtual !== "undefined" && abaAtual === "roteiros"){
      abrirModalEditarRoteiro(linhaFinal, { mensagemTopo: "✅ Pronto. Revisa, dá um nome e salva." });
    }
    return;
  }

  if(resultado.tipo === "vazio"){
    var msgVazio = "Não achei fala nesse vídeo. Costuma ser vídeo só com música ou só com texto na tela.";
    await buscarSeguro(banco.from("roteiros").update({ status: "falhou", erro: msgVazio, updated_at: new Date().toISOString() }).eq("id", roteiro.id));
    var linhaVazia = mesclarObjetos(roteiro, { status: "falhou", erro: msgVazio });
    atualizarCacheRoteiro(linhaVazia);
    desenharBibliotecaRoteiros(cacheRoteiros);
    if(eraFluxoPrincipal && areaAviso) areaAviso.innerHTML = faixaAviso(msgVazio + " Você pode guardar assim mesmo e escrever a transcrição na mão, no card dele aqui embaixo.", "erro");
    return;
  }

  await buscarSeguro(banco.from("roteiros").update({ status: "falhou", erro: resultado.mensagem, updated_at: new Date().toISOString() }).eq("id", roteiro.id));
  var linhaErro = mesclarObjetos(roteiro, { status: "falhou", erro: resultado.mensagem });
  atualizarCacheRoteiro(linhaErro);
  desenharBibliotecaRoteiros(cacheRoteiros);
  if(eraFluxoPrincipal && areaAviso) areaAviso.innerHTML = faixaAviso(resultado.mensagem, "erro");
}

/* Chama a IA pra separar gancho, desenvolvimento, CTA e expressões a partir
   da transcrição já salva, e grava o resultado no roteiro. Devolve a linha
   do roteiro já atualizada (com os campos da análise, ou com analise_erro
   preenchido se algo deu errado). */
async function rodarAnaliseIA(roteiro, chaveIA){
  await buscarSeguro(banco.from("roteiros").update({ analise_status: "processando", analise_erro: null }).eq("id", roteiro.id));

  var resultado = await analisarRoteiroComIA(roteiro.transcricao || "", chaveIA);

  var dadosAnalise;
  if(resultado.ok){
    var a = resultado.analise;
    dadosAnalise = {
      estrutura: Array.isArray(a.estrutura) ? a.estrutura : [],
      gancho: a.gancho || null,
      desenvolvimento: Array.isArray(a.desenvolvimento) ? a.desenvolvimento : [],
      cta: a.cta || null,
      expressoes: Array.isArray(a.expressoes) ? a.expressoes : [],
      por_que_prende: a.por_que_prende || null,
      analise_status: "pronta",
      analise_erro: null
    };
  } else {
    dadosAnalise = { analise_status: "falhou", analise_erro: resultado.mensagem };
  }

  await buscarSeguro(banco.from("roteiros").update(dadosAnalise).eq("id", roteiro.id));
  var linhaFinal = mesclarObjetos(roteiro, dadosAnalise);
  atualizarCacheRoteiro(linhaFinal);
  desenharBibliotecaRoteiros(cacheRoteiros);
  return linhaFinal;
}

function atualizarProgressoNaTelaRoteiro(id, seg){
  var texto = "Ouvindo o vídeo… " + seg + "s. Costuma levar de 3 a 4 minutos, pode deixar a aba aberta.";
  var spanCard = document.getElementById("tempoRoteiro-" + id);
  if(spanCard) spanCard.textContent = texto;
  if(id === idFluxoPrincipalRoteiro){
    var areaAviso = document.getElementById("avisoRoteiros");
    if(areaAviso) areaAviso.innerHTML = faixaAviso(texto);
  }
}

function atualizarCacheRoteiro(linha){
  var idx = -1;
  cacheRoteiros.forEach(function(x, i){ if(x.id === linha.id) idx = i; });
  if(idx === -1) cacheRoteiros.unshift(linha);
  else cacheRoteiros[idx] = linha;
}

/* ============================================================================
   BIBLIOTECA: busca, filtros e cartões
============================================================================ */
function todasTagsUnicasRoteiro(lista){
  var vistas = {};
  var resultado = [];
  lista.forEach(function(r){
    (r.tags || []).forEach(function(t){
      if(t && !vistas[t]){ vistas[t] = true; resultado.push(t); }
    });
  });
  resultado.sort();
  return resultado;
}

function filtrarRoteiros(lista){
  return lista.filter(function(r){
    if(filtroRoteiroDeQuem !== "todos" && r.de_quem !== filtroRoteiroDeQuem) return false;
    if(filtroRoteiroTag !== "todas" && (r.tags || []).indexOf(filtroRoteiroTag) === -1) return false;
    if(buscaRoteirosTexto){
      var alvo = ((r.titulo || "") + " " + (r.perfil || "") + " " + (r.transcricao || "") + " " + (r.obs || "") + " " + (r.legenda || "")).toLowerCase();
      if(alvo.indexOf(buscaRoteirosTexto.toLowerCase()) === -1) return false;
    }
    return true;
  });
}

function desenharBibliotecaRoteiros(todos){
  var area = document.getElementById("gradeRoteiros");
  if(!area) return;

  if(todos.length === 0){
    area.innerHTML = '<div class="vazio-explicacao">Você ainda não tem nenhum roteiro guardado. Cole um link ali em cima, ou clique em "Escrever na mão".</div>';
    return;
  }

  var lista = filtrarRoteiros(todos);
  if(lista.length === 0){
    area.innerHTML = '<div class="vazio-explicacao">Nenhum roteiro encontrado com esse filtro.</div>';
    return;
  }

  area.innerHTML = '<div class="grade-roteiros">' + lista.map(montarCardRoteiro).join("") + '</div>';
  ligarEventosCardsRoteiro(area, todos);
}

function montarCardRoteiro(r){
  var emAndamento = !!roteirosEmAndamento[r.id];
  var capaHtml;

  if(r.status === "processando"){
    if(emAndamento){
      capaHtml = '<div class="capa-roteiro capa-processando">' + icone("relogio") +
        '<span class="texto-processando" id="tempoRoteiro-' + r.id + '">Ouvindo o vídeo…</span></div>';
    } else {
      capaHtml = '<div class="capa-roteiro capa-processando">' + icone("relogio") +
        '<span class="texto-processando">Ficou parado no meio</span>' +
        '<button type="button" class="btn btn-pequeno" data-retomar="' + r.id + '">Tentar de novo</button></div>';
    }
  } else if(r.status === "falhou"){
    capaHtml = '<div class="capa-roteiro capa-falhou">' + icone("alerta") +
      '<span class="texto-falhou">' + escapa(r.erro || "Não consegui transcrever.") + '</span>' +
      '<button type="button" class="btn btn-pequeno" data-abrir-mesmo="' + r.id + '">Abrir mesmo assim</button></div>';
  } else if(r.fonte === "manual" && !r.url){
    capaHtml = '<div class="capa-roteiro">' +
      '<div class="capa-icone-fonte">' + icone("roteiros") + '</div>' +
      '<span style="font-size:.62rem; color:#8a8272;">Escrito à mão</span></div>';
  } else {
    capaHtml = '<div class="capa-roteiro">' +
      '<div class="capa-icone-fonte">' + icone(FONTE_ICONE_ROTEIRO[r.fonte] || "roteiros") + '</div>' +
      '<button type="button" class="btn btn-pequeno" data-ver="' + r.id + '">▶ ver vídeo</button></div>';
  }

  var etiquetaDeQuem = r.de_quem === "minha"
    ? '<span class="etiqueta meu">Meu</span>'
    : '<span class="etiqueta outra">De outra</span>';

  var trechinho = (r.transcricao || "").trim();
  var previa = trechinho
    ? escapa(trechinho.slice(0, 220)) + (trechinho.length > 220 ? "…" : "")
    : '<span style="color:#b7ae98;">Sem transcrição ainda.</span>';

  var tagsHtml = (r.tags || []).map(function(t){
    return '<span class="pilula" style="background:#eee5d2; color:#6b6353;">' + escapa(t) + '</span>';
  }).join(" ");

  return '<div class="cartao-roteiro">' +
    capaHtml +
    '<div class="corpo-roteiro">' +
      '<p class="titulo-roteiro">' + escapa(r.titulo || "Sem título") + etiquetaDeQuem + '</p>' +
      '<p class="meta-roteiro">' + icone(FONTE_ICONE_ROTEIRO[r.fonte] || "roteiros") +
        (r.perfil ? escapa(r.perfil) + " · " : "") +
        (FONTE_ROTULO_ROTEIRO[r.fonte] || r.fonte || "") +
        (r.postado_em ? " · " + formatarData(r.postado_em) : "") + '</p>' +
      (tagsHtml ? '<div class="tags-roteiro">' + tagsHtml + '</div>' : "") +
      '<p class="previa-roteiro">' + previa + '</p>' +
      '<div class="acoes-roteiro">' +
        '<button type="button" class="btn btn-pequeno" data-copiar="' + r.id + '">' + icone("copiar") + ' Copiar transcrição</button>' +
        '<button type="button" class="btn btn-pequeno" data-editar="' + r.id + '">' + icone("editar") + ' Editar</button>' +
        '<button type="button" class="btn btn-pequeno btn-perigo" data-apagar="' + r.id + '">' + icone("lixeira") + ' Apagar</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function ligarEventosCardsRoteiro(area, todos){
  area.querySelectorAll("[data-ver]").forEach(function(botao){
    botao.addEventListener("click", function(){
      var r = todos.filter(function(x){ return String(x.id) === botao.dataset.ver; })[0];
      if(!r) return;
      abrirVideoModalRoteiro(r);
    });
  });

  area.querySelectorAll("[data-copiar]").forEach(function(botao){
    botao.addEventListener("click", function(){
      var r = todos.filter(function(x){ return String(x.id) === botao.dataset.copiar; })[0];
      if(!r) return;
      copiarTranscricaoRoteiro(r.transcricao || "", botao);
    });
  });

  area.querySelectorAll("[data-editar]").forEach(function(botao){
    botao.addEventListener("click", function(){
      var r = todos.filter(function(x){ return String(x.id) === botao.dataset.editar; })[0];
      if(!r) return;
      abrirModalEditarRoteiro(r);
    });
  });

  area.querySelectorAll("[data-apagar]").forEach(function(botao){
    botao.addEventListener("click", async function(){
      var r = todos.filter(function(x){ return String(x.id) === botao.dataset.apagar; })[0];
      if(!r) return;
      if(!window.confirm("Apagar o roteiro" + (r.titulo ? ' "' + r.titulo + '"' : "") + "? Isso não pode ser desfeito.")) return;
      await buscarSeguro(banco.from("roteiros").delete().eq("id", r.id));
      irParaAba("roteiros");
    });
  });

  area.querySelectorAll("[data-retomar]").forEach(function(botao){
    botao.addEventListener("click", function(){
      var r = todos.filter(function(x){ return String(x.id) === botao.dataset.retomar; })[0];
      if(r) retomarRoteiro(r);
    });
  });

  area.querySelectorAll("[data-abrir-mesmo]").forEach(function(botao){
    botao.addEventListener("click", function(){
      var r = todos.filter(function(x){ return String(x.id) === botao.dataset.abrirMesmo; })[0];
      if(r) abrirModalEditarRoteiro(r, { mensagemTopo: "Você pode escrever a transcrição na mão aqui embaixo, se quiser." });
    });
  });
}

function abrirVideoModalRoteiro(r){
  var embedUrl = montarEmbedRoteiro(r);
  if(!embedUrl){
    if(r.url) window.open(r.url, "_blank", "noopener");
    return;
  }
  var html = '<p class="form-titulo">' + escapa(r.titulo || "Vídeo") + '</p>' +
    '<div class="caixa-video-modal"><iframe src="' + embedUrl + '" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen frameborder="0"></iframe></div>';
  abrirModal(html, true);
}

function copiarTranscricaoRoteiro(texto, botao){
  var original = botao.innerHTML;
  navigator.clipboard.writeText(texto || "").then(function(){
    botao.innerHTML = "copiado ✓";
    setTimeout(function(){ botao.innerHTML = original; }, 1500);
  }).catch(function(){
    botao.innerHTML = "não deu pra copiar";
    setTimeout(function(){ botao.innerHTML = original; }, 1500);
  });
}

/* ============================================================================
   MODAL: EDITAR / ESCREVER NA MÃO
============================================================================ */
function montarColunaVideoRoteiro(r){
  var linkAbrir = r.url
    ? '<a href="' + escapa(r.url) + '" target="_blank" rel="noopener" style="font-size:.76rem; display:block; margin-top:8px;">abrir no ' + (FONTE_ROTULO_ROTEIRO[r.fonte] || "site") + ' ↗</a>'
    : "";
  var embedUrl = montarEmbedRoteiro(r);
  if(embedUrl){
    return '<div class="caixa-video-modal"><iframe src="' + embedUrl + '" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen frameborder="0"></iframe></div>' + linkAbrir;
  }
  if(r.url){
    return '<div class="vazio-explicacao">Não consegui montar o preview desse link.</div>' + linkAbrir;
  }
  return '<div class="vazio-explicacao">Sem link salvo pra esse roteiro.</div>';
}

function abrirModalEditarRoteiro(roteiro, opts){
  opts = opts || {};
  var editando = !!(roteiro && roteiro.id);
  var r = roteiro || {};
  var deQuemAtual = r.de_quem || deQuemNovoRoteiro || "outra";

  var opcoesFonte = ["instagram", "tiktok", "youtube", "manual"].map(function(f){
    var sel = (r.fonte || "manual") === f ? "selected" : "";
    return '<option value="' + f + '" ' + sel + '>' + FONTE_ROTULO_ROTEIRO[f] + '</option>';
  }).join("");

  var statusAnaliseTexto = "";
  var statusAnaliseClasse = "aviso oculto";
  if(r.analise_status === "falhou"){
    statusAnaliseTexto = r.analise_erro || "Não consegui analisar.";
    statusAnaliseClasse = "aviso erro";
  } else if(r.analise_status === "pronta"){
    statusAnaliseTexto = "✅ Analisado pela IA.";
    statusAnaliseClasse = "aviso";
  }

  var html = '<p class="form-titulo">' + (editando ? "Editar roteiro" : "Escrever roteiro na mão") + '</p>';
  if(opts.mensagemTopo) html += faixaAviso(opts.mensagemTopo);

  html += '<div class="roteiro-edicao-grade">';

  html += '<div class="roteiro-coluna-form"><form id="formRoteiro">' +
      '<div class="form-linha">' +
        '<div class="campo"><label>Origem</label><select id="frFonte">' + opcoesFonte + '</select></div>' +
        '<div class="campo"><label>De quem é</label><select id="frDeQuem">' +
          '<option value="outra" ' + (deQuemAtual === "outra" ? "selected" : "") + '>De outra pessoa</option>' +
          '<option value="minha" ' + (deQuemAtual === "minha" ? "selected" : "") + '>Meu</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="campo"><label>Título</label><input id="frTitulo" placeholder="Dá um nome pra esse roteiro" value="' + escapa(r.titulo || "") + '"></div>' +
      '<div class="form-linha">' +
        '<div class="campo"><label>Perfil (@)</label><input id="frPerfil" value="' + escapa(r.perfil || "") + '"></div>' +
        '<div class="campo"><label>Data de postagem</label><input type="date" id="frPostadoEm" value="' + (r.postado_em || "") + '"></div>' +
      '</div>' +
      '<div class="campo"><label>Link do vídeo</label><input id="frUrl" value="' + escapa(r.url || "") + '"></div>' +

      '<div class="secao-analise">' +
        '<div class="cabecalho-analise">' +
          '<span>🧠 Análise da IA</span>' +
          (editando ? '<button type="button" class="btn btn-pequeno" id="btnAnalisarIA">Analisar com IA</button>' : '') +
        '</div>' +
        '<p id="statusAnaliseIA" class="' + statusAnaliseClasse + '">' + escapa(statusAnaliseTexto) + '</p>' +
        '<div class="campo"><label>🧩 Estrutura (separe por vírgula)</label><input id="frEstrutura" placeholder="ex: tutorial, produto de alto valor" value="' + escapa((r.estrutura || []).join(", ")) + '"></div>' +
        '<div class="campo"><label>🪝 Gancho</label><textarea id="frGancho">' + escapa(r.gancho || "") + '</textarea></div>' +
        '<div class="campo"><label>📋 Desenvolvimento (um passo por linha)</label><textarea id="frDesenvolvimento" style="min-height:100px;">' + escapa((r.desenvolvimento || []).join("\n")) + '</textarea></div>' +
        '<div class="campo"><label>📤 CTA</label><textarea id="frCta">' + escapa(r.cta || "") + '</textarea></div>' +
        '<div class="campo"><label>💬 Expressões que ela usa (separe por vírgula)</label><input id="frExpressoes" value="' + escapa((r.expressoes || []).join(", ")) + '"></div>' +
        '<div class="campo"><label>✅ Por que prende</label><textarea id="frPorQuePrende">' + escapa(r.por_que_prende || "") + '</textarea></div>' +
      '</div>' +

      '<div class="campo"><label>Tags (separe por vírgula)</label><input id="frTags" placeholder="ex: gancho, react, beleza" value="' + escapa((r.tags || []).join(", ")) + '"></div>' +
      '<div class="campo"><label>Legenda do post</label><textarea id="frLegenda">' + escapa(r.legenda || "") + '</textarea></div>' +
      '<div class="campo"><label>Roteiro / transcrição</label><textarea id="frTranscricao" style="min-height:180px;">' + escapa(r.transcricao || "") + '</textarea></div>' +
      '<div class="campo"><label>Suas notas</label><textarea id="frObs" placeholder="ex: abre com pergunta, corta a cada 2s. CTA só no final">' + escapa(r.obs || "") + '</textarea></div>' +
      '<div class="form-acoes"><button type="button" class="btn" id="btnCancelarRoteiro">Cancelar</button><button type="submit" class="btn btn-principal">Salvar</button></div>' +
      '<p class="aviso erro oculto" id="frErro"></p>' +
    '</form></div>';

  html += '<div class="roteiro-coluna-video"><p class="painel-titulo">O vídeo</p><div id="colunaVideoRoteiro">' + montarColunaVideoRoteiro(r) + '</div></div>';

  html += '</div>';

  abrirModal(html, true);
  modalBox.style.maxWidth = "920px";

  document.getElementById("btnCancelarRoteiro").addEventListener("click", fecharModal);

  function atualizarColunaVideo(){
    var colunaVideo = document.getElementById("colunaVideoRoteiro");
    if(!colunaVideo) return;
    colunaVideo.innerHTML = montarColunaVideoRoteiro({
      fonte: document.getElementById("frFonte").value,
      url: document.getElementById("frUrl").value.trim(),
      titulo: r.titulo
    });
  }
  document.getElementById("frFonte").addEventListener("change", atualizarColunaVideo);
  document.getElementById("frUrl").addEventListener("change", atualizarColunaVideo);

  if(editando){
    document.getElementById("btnAnalisarIA").addEventListener("click", async function(){
      var statusEl = document.getElementById("statusAnaliseIA");
      var chaveIA = await buscarChaveIA();
      if(!chaveIA){
        statusEl.textContent = "Salve uma chave de IA aqui em cima da aba Roteiros antes de analisar.";
        statusEl.className = "aviso erro";
        return;
      }
      var transcricaoAtual = document.getElementById("frTranscricao").value.trim();
      if(!transcricaoAtual){
        statusEl.textContent = "Escreva ou cole a transcrição antes de analisar.";
        statusEl.className = "aviso erro";
        return;
      }
      var botaoAnalisar = document.getElementById("btnAnalisarIA");
      botaoAnalisar.disabled = true;
      botaoAnalisar.textContent = "Analisando...";
      statusEl.textContent = "";
      statusEl.className = "aviso oculto";

      var roteiroParaAnalise = mesclarObjetos(r, { transcricao: transcricaoAtual });
      var atualizado = await rodarAnaliseIA(roteiroParaAnalise, chaveIA);
      r = atualizado;

      botaoAnalisar.disabled = false;
      botaoAnalisar.textContent = "Analisar com IA";

      if(atualizado.analise_status === "pronta"){
        document.getElementById("frEstrutura").value = (atualizado.estrutura || []).join(", ");
        document.getElementById("frGancho").value = atualizado.gancho || "";
        document.getElementById("frDesenvolvimento").value = (atualizado.desenvolvimento || []).join("\n");
        document.getElementById("frCta").value = atualizado.cta || "";
        document.getElementById("frExpressoes").value = (atualizado.expressoes || []).join(", ");
        document.getElementById("frPorQuePrende").value = atualizado.por_que_prende || "";
        statusEl.textContent = "✅ Analisado agora.";
        statusEl.className = "aviso";
      } else {
        statusEl.textContent = atualizado.analise_erro || "Não consegui analisar.";
        statusEl.className = "aviso erro";
      }
    });
  }

  document.getElementById("formRoteiro").addEventListener("submit", async function(e){
    e.preventDefault();
    var tags = document.getElementById("frTags").value.split(",")
      .map(function(t){ return t.trim(); })
      .filter(function(t){ return !!t; });
    var estrutura = document.getElementById("frEstrutura").value.split(",")
      .map(function(t){ return t.trim(); })
      .filter(function(t){ return !!t; });
    var expressoes = document.getElementById("frExpressoes").value.split(",")
      .map(function(t){ return t.trim(); })
      .filter(function(t){ return !!t; });
    var desenvolvimento = document.getElementById("frDesenvolvimento").value.split("\n")
      .map(function(t){ return t.trim(); })
      .filter(function(t){ return !!t; });

    var dados = {
      fonte: document.getElementById("frFonte").value,
      titulo: document.getElementById("frTitulo").value.trim() || null,
      de_quem: document.getElementById("frDeQuem").value,
      perfil: document.getElementById("frPerfil").value.trim() || null,
      url: document.getElementById("frUrl").value.trim() || null,
      postado_em: document.getElementById("frPostadoEm").value || null,
      tags: tags,
      legenda: document.getElementById("frLegenda").value.trim() || null,
      transcricao: document.getElementById("frTranscricao").value.trim() || null,
      obs: document.getElementById("frObs").value.trim() || null,
      estrutura: estrutura,
      gancho: document.getElementById("frGancho").value.trim() || null,
      desenvolvimento: desenvolvimento,
      cta: document.getElementById("frCta").value.trim() || null,
      expressoes: expressoes,
      por_que_prende: document.getElementById("frPorQuePrende").value.trim() || null,
      status: "pronto",
      erro: null,
      updated_at: new Date().toISOString()
    };

    var res;
    if(editando){
      res = await buscarSeguro(banco.from("roteiros").update(dados).eq("id", r.id));
    } else {
      res = await buscarSeguro(banco.from("roteiros").insert(dados));
    }

    if(!res.ok){
      var erroEl = document.getElementById("frErro");
      erroEl.textContent = "Não consegui salvar: " + res.mensagem;
      erroEl.classList.remove("oculto");
      return;
    }

    delete roteirosEmAndamento[r.id];
    fecharModal();
    irParaAba("roteiros");
  });
}

/* ============================================================================
   ESTUDAR COM O CLAUDE
============================================================================ */
function montarPromptEstudarRoteiros(lista){
  var deOutras = lista
    .filter(function(r){ return r.de_quem === "outra" && r.transcricao; })
    .sort(function(a, b){ return new Date(b.created_at) - new Date(a.created_at); })
    .slice(0, 10);

  if(deOutras.length === 0) return null;

  var blocos = deOutras.map(function(r, i){
    return "Roteiro " + (i + 1) + ", perfil " + (r.perfil || "desconhecido") + ":\n" + r.transcricao;
  }).join("\n\n---\n\n");

  return "Aqui estão " + deOutras.length + " roteiros de outras creators que eu salvei recentemente:\n\n" +
    blocos +
    "\n\n---\n\nCom base nesses roteiros, me diga:\n" +
    "1. Quais assuntos estão em alta entre eles.\n" +
    "2. Quais expressões ou frases estão se repetindo e prendendo atenção.\n" +
    "3. Os padrões de gancho que eles usam, com um exemplo real de cada roteiro.\n" +
    "4. Cinco roteiros novos no MEU assunto (troque aqui pelo seu nicho), reaproveitando a estrutura desses roteiros, não o conteúdo, sem ficar robotizado ou forçado.";
}
