/* ============================================================================
   ABA INSTAGRAM, PARTE 2: o topo com a contagem regressiva do token, e as telas
   Visão geral, Análises, Marcas, Propostas e Sorteio.
   (Automações e Leads ficam no instagram.js.)

   Este arquivo é carregado DEPOIS do instagram.js, então pode usar tudo que já
   existe nele e no painel: banco, buscarSeguro, escapa, el, icone, faixaAviso,
   irParaAba, abrirModal, fecharModal, formatarDataHora, formatarDinheiro,
   baixarCSV, igAttr, igContar, igChamarFuncao, igCarregarPosts, igFormatarNumero,
   igGraficoBarras, igCartaoMetrica, igCartaoConexao, igHa, igPillStatus,
   igCarregarAvisoFreio, igCarregarUltimosEnvios, igCarregarTodasAsLinhas,
   igTextoFuncaoIndisponivel.
============================================================================ */
"use strict";

/* ============================================================================
   O TOPO: A CONTAGEM REGRESSIVA DO TOKEN E AS ENTREGAS DAS ÚLTIMAS 24 HORAS
============================================================================ */
var igEstadoToken = null;        // a linha de ig_token_status (quando o token vence)
var igRelogioToken = null;       // o cronômetro que atualiza a tela a cada segundo

// Quanto falta pro token vencer, quebrado em dias, horas, minutos e segundos.
function igPartesDaContagem(expiraEm){
  var ms = new Date(expiraEm).getTime() - Date.now();
  var t = Math.max(0, ms);
  var d = Math.floor(t / 86400000);
  return {
    vencido: ms <= 0,
    d: d,
    h: Math.floor((t % 86400000) / 3600000),
    m: Math.floor((t % 3600000) / 60000),
    s: Math.floor((t % 60000) / 1000),
    // verde com folga, amarelo quando está chegando, vermelho nos últimos dias
    nivel: ms <= 0 || d < 5 ? "perigo" : (d < 15 ? "atencao" : "ok")
  };
}

function igDoisDigitos(n){ return ("0" + n).slice(-2); }

function igHtmlPillToken(){
  if(!igEstadoToken || !igEstadoToken.expires_at){
    return '<button type="button" class="ig-pill neutro" data-ir-visao title="Ainda não sei quando o token vence. Clique pra descobrir.">Token: ver validade</button>';
  }
  return '<button type="button" class="ig-pill" data-ig-relogio="pill" data-ir-visao title="Contagem regressiva até o token do Instagram vencer. Clique pra ver os detalhes."></button>';
}

// Chamada a cada segundo: escreve a contagem em todo lugar da tela que a mostra.
function igAtualizarRelogios(){
  var elementos = document.querySelectorAll("[data-ig-relogio]");
  if(elementos.length === 0){
    if(igRelogioToken){ clearInterval(igRelogioToken); igRelogioToken = null; }   // saiu da aba: para de gastar
    return;
  }
  if(!igEstadoToken || !igEstadoToken.expires_at) return;
  var p = igPartesDaContagem(igEstadoToken.expires_at);
  elementos.forEach(function(e){
    e.classList.remove("ok", "atencao", "perigo");
    e.classList.add(p.nivel);
    if(e.getAttribute("data-ig-relogio") === "pill"){
      e.textContent = p.vencido
        ? "Token vencido"
        : "Token " + p.d + "d " + igDoisDigitos(p.h) + "h " + igDoisDigitos(p.m) + "m " + igDoisDigitos(p.s) + "s";
    } else {
      ["d", "h", "m", "s"].forEach(function(un){
        var caixa = e.querySelector('[data-un="' + un + '"]');
        if(caixa) caixa.textContent = un === "d" ? String(p[un]) : igDoisDigitos(p[un]);
      });
    }
  });
}

function igIniciarRelogioToken(){
  if(igRelogioToken) clearInterval(igRelogioToken);
  igAtualizarRelogios();
  igRelogioToken = setInterval(igAtualizarRelogios, 1000);
}

// Lê o estado do token e liga os dois "selinhos" do topo. Roda em segundo plano.
async function igCarregarPills(){
  var ontem = new Date(Date.now() - 86400000).toISOString();
  var r = await Promise.all([
    buscarSeguro(banco.from("ig_token_status").select("*").eq("id", "main").limit(1)),
    igContar(banco.from("ig_deliveries").select("id", { count: "exact", head: true }).eq("status", "ok").gte("ts", ontem))
  ]);
  var area = document.getElementById("igPills");
  if(!area) return;                                   // trocou de aba enquanto carregava
  igEstadoToken = r[0].ok && r[0].dados.length > 0 ? r[0].dados[0] : null;
  area.innerHTML = igHtmlPillToken() +
    '<span class="ig-pill neutro" title="DMs enviadas nas últimas 24 horas">' + (r[1] === null ? "-" : igFormatarNumero(r[1])) + ' entregas <small>24h</small></span>';
  area.querySelectorAll("[data-ir-visao]").forEach(function(b){
    b.addEventListener("click", function(){ igSubabaAtual = "visao"; irParaAba("instagram"); });
  });
  igIniciarRelogioToken();
}

/* ============================================================================
   VISÃO GERAL
============================================================================ */
function igHtmlCartaoToken(status){
  var titulo = '<p class="painel-titulo">Token do Instagram</p>';
  var botao = '<button type="button" class="btn" id="btnRenovarToken">Renovar agora</button>';
  var explicacao = '<p class="ig-ajuda">O token é a "chave" que deixa o sistema falar com o seu Instagram. Ele vale cerca de 60 dias, e um robô renova sozinho toda semana. Se ele vencer, as automações param. "Renovar agora" pede ao Instagram mais 60 dias.</p>';
  var erro = status && status.last_ok === false && status.last_error
    ? '<p class="aviso erro" style="margin-top:10px;">A última renovação falhou: ' + escapa(status.last_error) + '</p>' : "";

  if(!status || !status.expires_at){
    return '<div class="painel-branco ig-token-card">' + titulo +
      '<p style="font-size:.84rem; margin-bottom:10px;">Ainda não sei quando o seu token vence. Clique em "Renovar agora": eu peço ao Instagram pra renovar e anoto a validade nova, e a contagem regressiva começa a andar.</p>' +
      botao + '<div id="igResultadoToken"></div>' + erro + explicacao + '</div>';
  }
  var p = igPartesDaContagem(status.expires_at);
  return '<div class="painel-branco ig-token-card">' + titulo +
    '<div class="ig-contagem ' + p.nivel + '" data-ig-relogio="caixas">' +
      '<div class="ig-caixa"><b data-un="d">' + p.d + '</b><small>dias</small></div>' +
      '<div class="ig-caixa"><b data-un="h">' + igDoisDigitos(p.h) + '</b><small>horas</small></div>' +
      '<div class="ig-caixa"><b data-un="m">' + igDoisDigitos(p.m) + '</b><small>min</small></div>' +
      '<div class="ig-caixa"><b data-un="s">' + igDoisDigitos(p.s) + '</b><small>seg</small></div>' +
    '</div>' +
    '<p style="font-size:.82rem; margin:10px 0 2px;">' + (p.vencido ? '<strong>Venceu em ' : 'Vence em <strong>') + escapa(formatarDataHora(status.expires_at)) + '</strong></p>' +
    '<p class="ig-ajuda" style="margin:0 0 12px;">' + (status.last_refreshed_at ? "Última renovação: " + escapa(formatarDataHora(status.last_refreshed_at)) + " (" + escapa(igHa(status.last_refreshed_at)) + ")." : "Ainda não foi renovado pelo painel.") + '</p>' +
    botao + '<div id="igResultadoToken"></div>' + erro + explicacao + '</div>';
}

async function igRenovarToken(){
  var botao = document.getElementById("btnRenovarToken");
  var resultado = document.getElementById("igResultadoToken");
  botao.disabled = true;
  botao.textContent = "Renovando...";
  var r = await igChamarFuncao("ig-insights", { acao: "renovar_token" });
  var funcaoForaDoAr = !r.ok && /Failed to send|non-2xx|Edge Function|not found|FunctionsFetchError/i.test(r.mensagem || "");
  if(funcaoForaDoAr){
    botao.disabled = false; botao.textContent = "Renovar agora";
    resultado.innerHTML = faixaAviso(igTextoFuncaoIndisponivel("ig-insights", r.mensagem), "erro");
    return;
  }
  if(!r.ok){
    // a função respondeu, mas com um motivo (o Instagram recusou)
    r = { ok: true, dados: { ok: false, erro: r.mensagem } };
  }
  if(r.dados.conectado === false){
    botao.disabled = false; botao.textContent = "Renovar agora";
    resultado.innerHTML = faixaAviso(r.dados.motivo || "O Instagram ainda não está ligado.", "erro");
    return;
  }
  if(r.dados.ok === false){
    botao.disabled = false; botao.textContent = "Renovar agora";
    var dica = /24 hours|24 horas|too new|recently/i.test(r.dados.erro || "") ? " (o token precisa ter pelo menos 24 horas de vida pra ser renovado)" : "";
    resultado.innerHTML = faixaAviso("O Instagram não renovou: " + (r.dados.erro || "motivo desconhecido") + dica, "erro");
    return;
  }
  // deu certo: mostra a validade nova e recarrega a tela (a contagem recomeça)
  if(r.dados.aviso) alert(r.dados.aviso);
  irParaAba("instagram");
}

async function igRenderVisaoGeral(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando a visão geral...</p>';
  var ontem = new Date(Date.now() - 86400000).toISOString();
  var semana = new Date(Date.now() - 7 * 86400000).toISOString();

  var r = await Promise.all([
    igChamarFuncao("ig-insights"),
    buscarSeguro(banco.from("ig_token_status").select("*").eq("id", "main").limit(1)),
    buscarSeguro(banco.from("ig_automations").select("id, active")),
    igContar(banco.from("ig_leads").select("ig_user_id", { count: "exact", head: true })),
    igContar(banco.from("ig_deliveries").select("id", { count: "exact", head: true }).eq("status", "ok").gte("ts", ontem)),
    igContar(banco.from("ig_deliveries").select("id", { count: "exact", head: true }).eq("status", "ok").gte("ts", semana)),
    igContar(banco.from("ig_send_queue").select("id", { count: "exact", head: true }).eq("status", "pendente"))
  ]);
  var conexao = r[0], tokenRes = r[1], automacoes = r[2];
  igEstadoToken = tokenRes.ok && tokenRes.dados.length > 0 ? tokenRes.dados[0] : igEstadoToken;

  var ativas = automacoes.ok ? automacoes.dados.filter(function(a){ return a.active; }).length : null;
  var ig = conexao.ok ? conexao.dados : null;
  var conectado = !!(ig && ig.conectado);

  var html = '<div class="ig-visao-grade">';
  html += igHtmlCartaoToken(igEstadoToken);
  if(conectado){
    html += '<div>' + igCartaoConexao(ig) +
      '<div class="painel-branco"><p class="painel-titulo">Seu perfil</p><p style="font-size:.84rem;"><strong>@' + escapa(ig.username || "") + '</strong>: ' +
      igFormatarNumero(ig.seguidores) + ' seguidores, ' + igFormatarNumero(ig.midias) + ' publicações.</p></div></div>';
  } else {
    var passos = [
      { feito: tokenRes.ok && automacoes.ok, texto: "Tabelas do banco criadas (instagram.sql)" },
      { feito: conexao.ok, texto: "Funções do Instagram publicadas no Supabase" + (conexao.ok ? "" : " (a ig-insights não respondeu)") },
      { feito: conexao.ok && !(ig && ig.motivo && /IG_ACCESS_TOKEN/.test(ig.motivo)), texto: "Token do Instagram colocado nos segredos" },
      { feito: false, texto: "Webhook ligado no Meta, com a assinatura da conta" }
    ];
    html += '<div class="painel-branco"><p class="painel-titulo">Falta ligar o Instagram</p>' +
      '<p style="font-size:.82rem; color:#6b6353; margin-bottom:10px;">Enquanto isso não estiver pronto, o painel mostra "-" nos números do Instagram e as automações não disparam.</p>' +
      '<ul class="ig-checklist">' + passos.map(function(p){
        return '<li class="' + (p.feito ? "feito" : "falta") + '"><span>' + (p.feito ? "Feito" : "Falta") + '</span>' + escapa(p.texto) + '</li>';
      }).join("") + '</ul>' +
      (conexao.ok && ig && ig.motivo ? '<p class="ig-ajuda">' + escapa(ig.motivo) + '</p>' : '') +
      (!conexao.ok ? '<p class="ig-ajuda">' + escapa(igTextoFuncaoIndisponivel("ig-insights", conexao.mensagem)) + '</p>' : '') +
      '<p class="ig-ajuda">Passo a passo completo no arquivo INSTAGRAM-LEIA-ME.md.</p></div>';
  }
  html += '</div>';

  html += '<div class="grade-cartoes">' +
    igCartaoMetrica(ativas === null ? "-" : ativas + " de " + automacoes.dados.length, "automações ativas") +
    igCartaoMetrica(r[3] === null ? "-" : igFormatarNumero(r[3]), "leads captados") +
    igCartaoMetrica(r[4] === null ? "-" : igFormatarNumero(r[4]), "DMs enviadas (24h)") +
    igCartaoMetrica(r[5] === null ? "-" : igFormatarNumero(r[5]), "DMs enviadas (7 dias)") +
    igCartaoMetrica(r[6] === null ? "-" : igFormatarNumero(r[6]), "na fila de envio") +
  '</div>';

  html += '<div id="igAvisoFreio"></div>';
  html += '<div class="painel-branco"><p class="painel-titulo">Últimos envios</p><div id="igUltimosEnvios"><p class="vazio-explicacao">Carregando...</p></div></div>';
  area.innerHTML = html;

  var botaoRenovar = document.getElementById("btnRenovarToken");
  if(botaoRenovar) botaoRenovar.addEventListener("click", igRenovarToken);
  igIniciarRelogioToken();
  igCarregarAvisoFreio();
  igCarregarUltimosEnvios();
}

/* ============================================================================
   ANÁLISES: seguidores, alcance, interações e melhores posts
============================================================================ */
var igPeriodoAnalise = 30;                       // 7, 30, 90 ou 0 (tudo)
var igOrdemPosts = "melhores";
var igCacheConta = {};                           // { 7: {...}, 30: {...} } na memória, pra trocar de filtro sem esperar
var IG_CHAVE_COMENTARISTAS = "igQuemMaisComenta";

var IG_ICONES_POST = {
  curtidas: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.5 3 5 6.4 5c2 0 3.4 1.1 4.1 2.3h3C14.2 6.1 15.6 5 17.6 5 21 5 22.8 8.5 21.5 11.8 19.5 16.4 12 21 12 21z"/></svg>',
  comentarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.6A8 8 0 1 1 21 12z"/></svg>',
  salvos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4V3z"/></svg>',
  vistos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'
};

var IG_ORDENS_POSTS = [
  { chave: "melhores", rotulo: "Melhores", valor: function(p){ return p.curtidas + 3 * p.comentarios + 4 * p.salvos + 4 * p.compartilhamentos; } },
  { chave: "curtidas", rotulo: "Mais curtidos", valor: function(p){ return p.curtidas; } },
  { chave: "comentarios", rotulo: "Mais comentados", valor: function(p){ return p.comentarios; } },
  { chave: "salvos", rotulo: "Mais salvos", valor: function(p){ return p.salvos; } },
  { chave: "vistos", rotulo: "Mais vistos", valor: function(p){ return p.vistos; } }
];

function igDiasDoFiltro(){ return igPeriodoAnalise === 0 ? 90 : igPeriodoAnalise; }

function igLerComentaristasGuardados(){
  try{ return JSON.parse(localStorage.getItem(IG_CHAVE_COMENTARISTAS) || "null"); }catch(erro){ return null; }
}
function igGuardarComentaristas(dados){
  try{ localStorage.setItem(IG_CHAVE_COMENTARISTAS, JSON.stringify(dados)); }catch(erro){}
}

async function igRenderAnalises(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando análises...</p>';

  var cacheRes = await buscarSeguro(banco.from("ig_analise_cache").select("*").eq("id", "posts").limit(1));
  var cache = cacheRes.ok && cacheRes.dados.length > 0 ? cacheRes.dados[0] : null;

  var chips = [{ v: 7, r: "7 dias" }, { v: 30, r: "30 dias" }, { v: 90, r: "90 dias" }, { v: 0, r: "Tudo" }];
  area.innerHTML =
    '<div class="ig-filtro-topo">' +
      '<div class="chips">' + chips.map(function(c){
        return '<button type="button" class="chip ' + (igPeriodoAnalise === c.v ? "ativo" : "") + '" data-periodo="' + c.v + '">' + c.r + '</button>';
      }).join("") + '</div>' +
      '<button type="button" class="btn" id="btnAtualizarAnalise">Atualizar</button>' +
    '</div>' +
    '<div id="igAnaliseConta"><p class="vazio-explicacao">Carregando os números da conta...</p></div>' +
    '<div id="igAnalisePosts"></div>';

  area.querySelectorAll("[data-periodo]").forEach(function(b){
    b.addEventListener("click", function(){ igPeriodoAnalise = Number(b.getAttribute("data-periodo")); igRenderAnalises(area); });
  });
  document.getElementById("btnAtualizarAnalise").addEventListener("click", function(){ igAtualizarAnalise(area); });

  igDesenharPostsAnalise(cache, null);
  igCarregarContaAnalise();
}

async function igCarregarContaAnalise(){
  var dias = igDiasDoFiltro();
  var alvo = document.getElementById("igAnaliseConta");
  var dados = igCacheConta[dias];
  if(!dados){
    var r = await igChamarFuncao("ig-analise", { acao: "conta", dias: dias });
    alvo = document.getElementById("igAnaliseConta");
    if(!alvo) return;
    if(!r.ok){
      alvo.innerHTML = '<div class="painel-branco"><p class="painel-titulo">Conecte seu Instagram pra ver as análises</p><p style="font-size:.82rem; color:#6b6353;">' + escapa(igTextoFuncaoIndisponivel("ig-analise", r.mensagem)) + '</p></div>';
      return;
    }
    dados = r.dados;
    if(dados.conectado) igCacheConta[dias] = dados;
  }
  if(!alvo) return;
  if(!dados.conectado){
    alvo.innerHTML = '<div class="grade-cartoes">' +
      igCartaoMetrica("-", "seguidores") + igCartaoMetrica("-", "novos seguidores") + igCartaoMetrica("-", "alcance") +
      igCartaoMetrica("-", "contas engajadas") + igCartaoMetrica("-", "interações") + '</div>' +
      '<div class="painel-branco"><p class="painel-titulo">Conecte seu Instagram pra ver as análises</p>' +
      '<p style="font-size:.82rem; color:#6b6353;">Os números de seguidores, alcance e interações vêm direto do Instagram. Quando você terminar a configuração (INSTAGRAM-LEIA-ME.md), eles aparecem aqui.</p>' +
      (dados.motivo ? '<p class="ig-ajuda">' + escapa(dados.motivo) + '</p>' : '') + '</div>';
    return;
  }

  var rotuloPeriodo = igPeriodoAnalise === 0 ? "90d" : dias + "d";
  var novos = dados.novos_seguidores || [];
  var somaNovos = novos.reduce(function(t, p){ return t + p.valor; }, 0);
  var rotuloNovos = dados.novos_dias_consultados < dias ? dados.novos_dias_consultados + "d, máx. do Instagram" : rotuloPeriodo;
  alvo.innerHTML =
    '<div class="grade-cartoes">' +
      igCartaoMetrica(igFormatarNumero(dados.seguidores), "seguidores") +
      igCartaoMetrica(novos.length ? "+" + igFormatarNumero(somaNovos) : "-", "novos seguidores (" + rotuloNovos + ")") +
      igCartaoMetrica(igFormatarNumero(dados.alcance_total), "alcance (" + rotuloPeriodo + ")") +
      igCartaoMetrica(igFormatarNumero(dados.contas_engajadas), "contas engajadas") +
      igCartaoMetrica(igFormatarNumero(dados.interacoes), "interações") +
    '</div>' +
    (igPeriodoAnalise === 0 ? '<p class="ig-ajuda" style="margin:-10px 0 14px;">"Tudo" mostra no máximo 90 dias nos gráficos e nos totais da conta, que é o que o Instagram entrega. Os posts abaixo entram todos.</p>' : '') +
    '<div class="painel-branco"><p class="painel-titulo">Alcance por dia <span class="ig-ajuda" style="font-weight:400;">(passe o mouse pra ver os números)</span></p>' + igGraficoBarras(dados.alcance, "rosa") + '</div>' +
    (novos.length ? '<div class="painel-branco"><p class="painel-titulo">Novos seguidores por dia</p>' + igGraficoBarras(novos, "") + '</div>' : '') +
    (dados.avisos && dados.avisos.length ? '<p class="ig-ajuda" style="margin-bottom:14px;">' + dados.avisos.map(escapa).join("<br>") + '</p>' : '');
}

// O botão "Atualizar": roda a análise pesada dos posts e refaz os números da conta.
async function igAtualizarAnalise(area){
  var botao = document.getElementById("btnAtualizarAnalise");
  var alvo = document.getElementById("igAnalisePosts");
  botao.disabled = true;
  botao.textContent = "Analisando...";
  alvo.innerHTML = '<div class="painel-branco"><p class="painel-titulo">Analisando seus posts...</p><p style="font-size:.82rem; color:#6b6353;">O Instagram precisa ser consultado post por post, então isso pode levar até 1 minuto. Pode esperar nesta tela.</p></div>';
  igCacheConta = {};

  var r = await igChamarFuncao("ig-analise", { acao: "posts" });
  if(!r.ok || !r.dados.conectado){
    botao.disabled = false; botao.textContent = "Atualizar";
    alvo.innerHTML = faixaAviso(!r.ok ? igTextoFuncaoIndisponivel("ig-analise", r.mensagem) : (r.dados.motivo || "Não consegui analisar."), "erro");
    igCarregarContaAnalise();
    return;
  }
  igGuardarComentaristas({ atualizado_em: r.dados.atualizado_em, ranking: r.dados.quem_mais_comenta || [], analisados: r.dados.comentarios_analisados || 0 });
  // "dados" no mesmo formato do que fica guardado no banco
  igDesenharPostsAnalise({
    atualizado_em: r.dados.atualizado_em,
    dados: { posts: r.dados.posts, total_posts: r.dados.total_posts, parcial: r.dados.parcial, aviso_listagem: r.dados.aviso_listagem }
  }, r.dados.guardou_no_banco === false ? "Não consegui guardar o resultado no banco (rodou o instagram.sql?), então ele some quando você sair da tela." : null);
  botao.disabled = false;
  botao.textContent = "Atualizar";
  igCarregarContaAnalise();
}

function igDesenharPostsAnalise(cache, avisoExtra){
  var alvo = document.getElementById("igAnalisePosts");
  if(!alvo) return;

  if(!cache || !cache.dados || !cache.dados.posts){
    alvo.innerHTML = '<div class="painel-branco"><p class="painel-titulo">Melhores posts</p>' +
      '<p style="font-size:.84rem; margin-bottom:6px;">Ainda não analisei os seus posts. Clique em <strong>Atualizar</strong> no canto de cima: eu busco curtidas, comentários, salvamentos e visualizações de cada post, e quem mais comenta.</p>' +
      '<p class="ig-ajuda">Essa análise é pesada, por isso só roda quando você clica. O resultado fica guardado e a tela abre rápido da próxima vez.</p></div>';
    return;
  }

  var todos = cache.dados.posts;
  var dias = igPeriodoAnalise;
  var corte = dias === 0 ? 0 : Date.now() - dias * 86400000;
  var doPeriodo = todos.filter(function(p){ return !p.data || new Date(p.data).getTime() >= corte; });
  var ordem = IG_ORDENS_POSTS.filter(function(o){ return o.chave === igOrdemPosts; })[0] || IG_ORDENS_POSTS[0];
  var ordenados = doPeriodo.slice().sort(function(a, b){ return ordem.valor(b) - ordem.valor(a); }).slice(0, 14);
  var rotuloPeriodo = dias === 0 ? "todos" : dias + " dias";

  var html = '<div class="painel-branco"><div class="ig-filtro-topo" style="margin-bottom:12px;">' +
    '<p class="painel-titulo" style="margin:0;">Melhores posts (' + rotuloPeriodo + ')</p>' +
    '<div class="chips">' + IG_ORDENS_POSTS.map(function(o){
      return '<button type="button" class="chip ' + (igOrdemPosts === o.chave ? "ativo" : "") + '" data-ordem-post="' + o.chave + '">' + o.rotulo + '</button>';
    }).join("") + '</div></div>';

  if(ordenados.length === 0){
    html += '<p class="vazio-explicacao">Nenhum post publicado nesse período entre os ' + todos.length + ' analisados.</p>';
  } else {
    html += '<div class="ig-posts-linha">' + ordenados.map(function(p){
      var capa = p.miniatura ? '<img src="' + igAttr(p.miniatura) + '" alt="" loading="lazy">' : '<span class="ig-sem-imagem">' + escapa(p.tipo || "Post") + '</span>';
      return '<a class="ig-post-card" href="' + igAttr(p.link || "#") + '" target="_blank" rel="noopener" title="' + igAttr(p.legenda || "Post sem legenda") + '">' +
        '<div class="ig-post-capa">' + capa + (p.tipo ? '<span class="ig-post-tipo">' + escapa(p.tipo === "CAROUSEL_ALBUM" ? "Carrossel" : (p.tipo === "REELS" ? "Reels" : (p.tipo === "VIDEO" ? "Vídeo" : "Foto"))) + '</span>' : '') + '</div>' +
        '<div class="ig-post-met">' +
          '<span title="Curtidas">' + IG_ICONES_POST.curtidas + igFormatarNumero(p.curtidas) + '</span>' +
          '<span title="Comentários">' + IG_ICONES_POST.comentarios + igFormatarNumero(p.comentarios) + '</span>' +
          '<span title="Salvamentos">' + IG_ICONES_POST.salvos + igFormatarNumero(p.salvos) + '</span>' +
          '<span title="Visualizações">' + IG_ICONES_POST.vistos + igFormatarNumero(p.vistos) + '</span>' +
        '</div></a>';
    }).join("") + '</div>';
  }
  html += '</div>';

  var comentaristas = igLerComentaristasGuardados();
  html += '<div class="painel-branco ig-ultima-atualizacao"><strong>Última atualização: ' + escapa(formatarDataHora(cache.atualizado_em)) + '</strong>' +
    '<div class="ig-ajuda" style="margin-top:2px;">' + todos.length + ' posts' + (comentaristas ? ' e ' + igFormatarNumero(comentaristas.analisados) + ' comentários' : '') +
    ' analisados. Só atualiza quando você clica em "Atualizar".' + (cache.dados.parcial ? ' A última análise terminou por falta de tempo: alguns posts estão sem salvamentos e visualizações. Clique em Atualizar de novo.' : '') + '</div>' +
    (avisoExtra ? '<p class="aviso erro" style="margin:8px 0 0;">' + escapa(avisoExtra) + '</p>' : '') + '</div>';

  if(comentaristas && comentaristas.ranking && comentaristas.ranking.length > 0){
    var maior = comentaristas.ranking[0].comentarios || 1;
    html += '<div class="painel-branco"><p class="painel-titulo">Quem mais comenta <span class="ig-ajuda" style="font-weight:400;">(nos posts mais recentes analisados)</span></p><div class="ig-ranking">' +
      comentaristas.ranking.slice(0, 15).map(function(c, i){
        return '<div class="ig-ranking-linha"><span class="ig-ranking-pos">' + (i + 1) + '</span>' +
          '<a href="https://instagram.com/' + igAttr(c.username) + '" target="_blank" rel="noopener">@' + escapa(c.username) + '</a>' +
          '<span class="ig-ranking-barra"><i style="width:' + Math.max(4, Math.round(c.comentarios / maior * 100)) + '%"></i></span>' +
          '<strong>' + igFormatarNumero(c.comentarios) + '</strong></div>';
      }).join("") + '</div>' +
      '<p class="ig-ajuda" style="margin-top:8px;">Essa lista fica guardada só neste navegador (não vai pro banco), porque são @ de outras pessoas.</p></div>';
  }
  alvo.innerHTML = html;
  alvo.querySelectorAll("[data-ordem-post]").forEach(function(b){
    b.addEventListener("click", function(){ igOrdemPosts = b.getAttribute("data-ordem-post"); igDesenharPostsAnalise(cache, avisoExtra); });
  });
}

/* ============================================================================
   MARCAS (as marcas que chegaram pelo Instagram)
   Funciona com uma etiqueta: quem tiver a etiqueta "marca" na aba Leads aparece
   aqui, e dá pra mandar pra aba Marcas do painel (a sua base de contatos).
============================================================================ */
var IG_ETIQUETA_MARCA = "marca";

function igTemEtiquetaMarca(lead){
  return (lead.tags || []).some(function(t){ return String(t).toLowerCase() === IG_ETIQUETA_MARCA; });
}

async function igRenderMarcas(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando marcas...</p>';
  var res = await igCarregarTodasAsLinhas(function(){ return banco.from("ig_leads").select("*").order("ig_user_id"); }, 5);
  if(!res.ok){
    area.innerHTML = faixaAviso("Não consegui carregar os leads. Confira se você rodou o arquivo instagram.sql no Supabase. Detalhe: " + (res.mensagem || ""), "erro");
    return;
  }
  var marcas = res.dados.filter(igTemEtiquetaMarca);
  var candidatos = res.dados.filter(function(l){ return !igTemEtiquetaMarca(l) && l.username; });

  // Quem já está na aba Marcas do painel (procura pelo @), pra não duplicar.
  var jaNaBase = {};
  var arrobas = [];
  marcas.forEach(function(l){ if(l.username) { arrobas.push("@" + l.username); arrobas.push(l.username); } });
  for(var i = 0; i < arrobas.length; i += 60){
    var achadas = await buscarSeguro(banco.from("marcas").select("id, instagram").in("instagram", arrobas.slice(i, i + 60)));
    (achadas.dados || []).forEach(function(m){ jaNaBase[String(m.instagram || "").replace(/^@/, "").toLowerCase()] = true; });
  }

  area.innerHTML =
    '<div class="painel-branco"><p class="painel-titulo">Como funciona</p>' +
      '<p style="font-size:.82rem; color:#6b6353;">Aqui ficam os leads que você marcou com a etiqueta <strong>marca</strong>: marcas e empresas que chegaram pelo Instagram. Pra marcar alguém, use a caixa abaixo ou clique nas etiquetas da pessoa na aba Leads. Dali você manda a marca pra aba <strong>Marcas</strong> do painel, que é a sua base de contatos.</p>' +
      '<div class="barra-acoes" style="margin:12px 0 0;"><div class="campo-busca">' + icone("busca") + '<input id="igCampoNovaMarca" list="igListaCandidatos" placeholder="Digite o @ de um lead pra marcar como marca"></div>' +
      '<datalist id="igListaCandidatos">' + candidatos.slice(0, 500).map(function(l){ return '<option value="@' + igAttr(l.username) + '"></option>'; }).join("") + '</datalist>' +
      '<button class="btn btn-principal" id="btnMarcarMarca">Marcar como marca</button></div>' +
      '<div id="igMensagemMarca"></div></div>' +
    '<div class="painel-branco"><p class="painel-titulo">Marcas (' + marcas.length + ')</p><div class="tabela-scroll" id="igTabelaMarcas"></div></div>';

  var tabela = document.getElementById("igTabelaMarcas");
  if(marcas.length === 0){
    tabela.innerHTML = '<p class="vazio-explicacao">Nenhuma marca ainda. Marque um lead com a etiqueta "marca" pra ele aparecer aqui.</p>';
  } else {
    var t = el('<table><thead><tr><th>Marca</th><th>Palavra</th><th>Contato</th><th>Última vez</th><th>Na sua base</th><th></th></tr></thead><tbody></tbody></table>');
    marcas.sort(function(a, b){ return String(b.updated_at).localeCompare(String(a.updated_at)); }).forEach(function(l){
      var arroba = l.username ? "@" + l.username : "(sem @)";
      var contato = [l.email, l.telefone].filter(Boolean).map(escapa).join("<br>") || '<span style="color:#b7ae98;">-</span>';
      var estaNaBase = l.username && jaNaBase[String(l.username).toLowerCase()];
      var tr = el('<tr><td>' + (l.username ? '<a href="https://instagram.com/' + igAttr(l.username) + '" target="_blank" rel="noopener"><strong>' + escapa(arroba) + '</strong></a>' : '<strong>(sem @)</strong>') + '</td>' +
        '<td>' + escapa(l.last_keyword || "-") + '</td><td>' + contato + '</td>' +
        '<td style="white-space:nowrap;">' + escapa(formatarDataHora(l.updated_at)) + '<div class="ig-id">' + escapa(igHa(l.updated_at)) + '</div></td>' +
        '<td>' + (estaNaBase ? '<span class="pilula ig-pilula-ok">Já está</span>' : '<button type="button" class="btn btn-pequeno btn-principal" data-enviar>Enviar pra aba Marcas</button>') + '</td>' +
        '<td><button type="button" class="btn btn-pequeno" data-tirar title="Tirar a etiqueta marca">Tirar</button></td></tr>');
      var enviar = tr.querySelector("[data-enviar]");
      if(enviar) enviar.addEventListener("click", function(){ igEnviarParaBaseDeMarcas(l, enviar, area); });
      tr.querySelector("[data-tirar]").addEventListener("click", function(){ igMudarEtiquetaMarca(l, false, area); });
      t.querySelector("tbody").appendChild(tr);
    });
    tabela.appendChild(t);
  }

  document.getElementById("btnMarcarMarca").addEventListener("click", function(){
    var texto = document.getElementById("igCampoNovaMarca").value.trim().replace(/^@/, "").toLowerCase();
    var msg = document.getElementById("igMensagemMarca");
    var lead = res.dados.filter(function(l){ return String(l.username || "").toLowerCase() === texto; })[0];
    if(!texto || !lead){ msg.innerHTML = faixaAviso("Não achei esse @ entre os seus leads. Só quem já entrou numa automação pode ser marcado.", "erro"); return; }
    if(igTemEtiquetaMarca(lead)){ msg.innerHTML = faixaAviso("@" + lead.username + " já é uma marca.", ""); return; }
    igMudarEtiquetaMarca(lead, true, area);
  });
}

async function igMudarEtiquetaMarca(lead, adicionar, area){
  var tags = (lead.tags || []).filter(function(t){ return String(t).toLowerCase() !== IG_ETIQUETA_MARCA; });
  if(adicionar) tags.push(IG_ETIQUETA_MARCA);
  var r = await buscarSeguro(banco.from("ig_leads").update({ tags: tags }).eq("ig_user_id", lead.ig_user_id).select("ig_user_id"));
  if(!r.ok || r.dados.length === 0){
    alert("Não consegui mudar a etiqueta" + (r.mensagem ? ": " + r.mensagem : "") + ". Rode o arquivo instagram.sql de novo no Supabase (ele libera a edição).");
    return;
  }
  igRenderMarcas(area);
}

async function igEnviarParaBaseDeMarcas(lead, botao, area){
  botao.disabled = true;
  var r = await buscarSeguro(banco.from("marcas").insert({
    nome: "@" + lead.username,
    instagram: "@" + lead.username,
    email: lead.email || null,
    telefone: lead.telefone || null,
    situacao: "lead",
    obs: "Veio da automação do Instagram" + (lead.last_keyword ? " (palavra: " + lead.last_keyword + ")" : ""),
    ultimo_contato: new Date().toISOString().slice(0, 10)
  }));
  if(!r.ok){
    botao.disabled = false;
    alert("Não consegui enviar pra aba Marcas: " + (r.mensagem || "erro desconhecido"));
    return;
  }
  igRenderMarcas(area);
}

/* ============================================================================
   PROPOSTAS (controle das propostas de parceria que chegam pelo Instagram)
============================================================================ */
var IG_STATUS_PROPOSTA = [
  { valor: "nova", rotulo: "Nova", cor: "#2b6fff" },
  { valor: "em_conversa", rotulo: "Em conversa", cor: "#ff6a2b" },
  { valor: "fechada", rotulo: "Fechada", cor: "#7ea600" },
  { valor: "recusada", rotulo: "Recusada", cor: "#8a8a8a" }
];
var igFiltroProposta = "todas";

function igStatusProposta(valor){
  return IG_STATUS_PROPOSTA.filter(function(s){ return s.valor === valor; })[0] || IG_STATUS_PROPOSTA[0];
}

async function igRenderPropostas(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando propostas...</p>';
  var res = await buscarSeguro(banco.from("ig_propostas").select("*").order("criado_em", { ascending: false }));
  if(!res.ok){
    area.innerHTML = faixaAviso("Não consegui carregar as propostas. Confira se você rodou o arquivo instagram.sql no Supabase. Detalhe: " + (res.mensagem || ""), "erro");
    return;
  }
  var todas = res.dados;
  var soma = function(lista){ return lista.reduce(function(t, p){ return t + (Number(p.valor) || 0); }, 0); };
  var emAberto = todas.filter(function(p){ return p.status === "nova" || p.status === "em_conversa"; });
  var fechadas = todas.filter(function(p){ return p.status === "fechada"; });

  var html = '<div class="grade-cartoes">' +
    igCartaoMetrica(todas.length, "propostas") +
    igCartaoMetrica(emAberto.length + " · " + formatarDinheiro(soma(emAberto)), "em aberto (nova ou em conversa)") +
    igCartaoMetrica(fechadas.length + " · " + formatarDinheiro(soma(fechadas)), "fechadas") +
  '</div>';
  html += '<div class="barra-acoes"><button class="btn btn-principal" id="btnNovaProposta">' + icone("mais") + ' Nova proposta</button>' +
    '<div class="chips">' + [{ valor: "todas", rotulo: "Todas" }].concat(IG_STATUS_PROPOSTA).map(function(s){
      return '<button type="button" class="chip ' + (igFiltroProposta === s.valor ? "ativo" : "") + '" data-filtro-proposta="' + s.valor + '">' + s.rotulo + '</button>';
    }).join("") + '</div></div>';

  var lista = igFiltroProposta === "todas" ? todas : todas.filter(function(p){ return p.status === igFiltroProposta; });
  if(todas.length === 0){
    html += '<div class="vazio-explicacao">Você ainda não registrou nenhuma proposta. Quando uma marca te mandar uma proposta de parceria pelo Instagram, clique em "Nova proposta" pra guardar o valor, o combinado e em que pé está.</div>';
  } else if(lista.length === 0){
    html += '<div class="vazio-explicacao">Nenhuma proposta nessa situação.</div>';
  } else {
    html += '<div class="painel-branco"><div class="tabela-scroll"><table><thead><tr><th>Marca</th><th>Valor</th><th>Situação</th><th>Chegou em</th><th>Observação</th><th></th></tr></thead><tbody id="igCorpoPropostas"></tbody></table></div></div>';
  }
  area.innerHTML = html;

  document.getElementById("btnNovaProposta").addEventListener("click", function(){ igAbrirFormProposta(null, area); });
  area.querySelectorAll("[data-filtro-proposta]").forEach(function(b){
    b.addEventListener("click", function(){ igFiltroProposta = b.getAttribute("data-filtro-proposta"); igRenderPropostas(area); });
  });

  var corpo = document.getElementById("igCorpoPropostas");
  if(!corpo) return;
  lista.forEach(function(p){
    var st = igStatusProposta(p.status);
    var arroba = p.instagram ? String(p.instagram).replace(/^@/, "") : "";
    var tr = el('<tr class="clicavel"><td><strong>' + escapa(p.marca) + '</strong>' +
      (arroba ? '<div class="ig-id"><a href="https://instagram.com/' + igAttr(arroba) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">@' + escapa(arroba) + '</a></div>' : '') + '</td>' +
      '<td>' + (p.valor !== null && p.valor !== undefined && p.valor !== "" ? escapa(formatarDinheiro(p.valor)) : '<span style="color:#b7ae98;">-</span>') + '</td>' +
      '<td><select class="select-status" style="background:' + st.cor + '22; color:' + st.cor + '">' +
        IG_STATUS_PROPOSTA.map(function(s){ return '<option value="' + s.valor + '" ' + (s.valor === p.status ? "selected" : "") + '>' + s.rotulo + '</option>'; }).join("") + '</select></td>' +
      '<td style="white-space:nowrap;">' + (p.data ? escapa(formatarData(p.data)) : "-") + '</td>' +
      '<td style="max-width:280px; color:#6b6353;">' + escapa(p.observacao || "") + '</td>' +
      '<td><button type="button" class="btn btn-icone btn-perigo" title="Apagar">' + icone("lixeira") + '</button></td></tr>');
    var seletor = tr.querySelector("select");
    seletor.addEventListener("click", function(e){ e.stopPropagation(); });
    seletor.addEventListener("change", async function(e){
      var novo = e.target.value;
      var u = await buscarSeguro(banco.from("ig_propostas").update({ status: novo }).eq("id", p.id).select("id"));
      if(!u.ok || u.dados.length === 0){ alert("Não consegui mudar a situação" + (u.mensagem ? ": " + u.mensagem : "") + "."); e.target.value = p.status; return; }
      igRenderPropostas(area);
    });
    tr.querySelector(".btn-perigo").addEventListener("click", function(e){ e.stopPropagation(); igConfirmarApagarProposta(p, area); });
    tr.addEventListener("click", function(){ igAbrirFormProposta(p, area); });
    corpo.appendChild(tr);
  });
}

function igAbrirFormProposta(proposta, area){
  var editando = !!proposta;
  var p = proposta || {};
  abrirModal(
    '<p class="form-titulo">' + (editando ? "Editar proposta" : "Nova proposta") + '</p>' +
    '<form id="formPropostaIg">' +
      '<div class="campo"><label>Marca</label><input required id="fpgMarca" value="' + igAttr(p.marca || "") + '" placeholder="Nome da marca ou empresa"></div>' +
      '<div class="form-linha">' +
        '<div class="campo"><label>@ no Instagram</label><input id="fpgInstagram" value="' + igAttr(p.instagram || "") + '" placeholder="@marca"></div>' +
        '<div class="campo"><label>Valor (R$)</label><input id="fpgValor" type="number" min="0" step="0.01" value="' + (p.valor !== null && p.valor !== undefined ? igAttr(p.valor) : "") + '" placeholder="Ex: 1500"></div>' +
      '</div>' +
      '<div class="form-linha">' +
        '<div class="campo"><label>Situação</label><select id="fpgStatus">' + IG_STATUS_PROPOSTA.map(function(s){ return '<option value="' + s.valor + '" ' + ((p.status || "nova") === s.valor ? "selected" : "") + '>' + s.rotulo + '</option>'; }).join("") + '</select></div>' +
        '<div class="campo"><label>Chegou em</label><input id="fpgData" type="date" value="' + igAttr(p.data || new Date().toISOString().slice(0, 10)) + '"></div>' +
      '</div>' +
      '<div class="campo"><label>Observação</label><textarea id="fpgObs" placeholder="O que foi combinado, prazo, entregáveis...">' + escapa(p.observacao || "") + '</textarea></div>' +
      '<div class="form-acoes"><button type="button" class="btn" id="btnCancelarFpg">Cancelar</button><button type="submit" class="btn btn-principal">Salvar</button></div>' +
      '<p class="aviso erro oculto" id="fpgErro"></p>' +
    '</form>'
  );
  document.getElementById("btnCancelarFpg").addEventListener("click", fecharModal);
  document.getElementById("formPropostaIg").addEventListener("submit", async function(e){
    e.preventDefault();
    var valorTexto = document.getElementById("fpgValor").value;
    var dados = {
      marca: document.getElementById("fpgMarca").value.trim(),
      instagram: document.getElementById("fpgInstagram").value.trim() || null,
      valor: valorTexto === "" ? null : Number(valorTexto),
      status: document.getElementById("fpgStatus").value,
      data: document.getElementById("fpgData").value || null,
      observacao: document.getElementById("fpgObs").value.trim() || null
    };
    var r = editando
      ? await buscarSeguro(banco.from("ig_propostas").update(dados).eq("id", p.id).select("id"))
      : await buscarSeguro(banco.from("ig_propostas").insert(dados).select("id"));
    if(!r.ok || (editando && r.dados.length === 0)){
      var erro = document.getElementById("fpgErro");
      erro.textContent = "Não consegui salvar" + (r.mensagem ? ": " + r.mensagem : "") + ". Rode o arquivo instagram.sql de novo no Supabase.";
      erro.classList.remove("oculto");
      return;
    }
    fecharModal();
    igRenderPropostas(area);
  });
}

function igConfirmarApagarProposta(p, area){
  abrirModal(
    '<p class="form-titulo">Apagar proposta</p>' +
    '<p style="font-size:.85rem; margin-bottom:18px;">Tem certeza que quer apagar a proposta de "' + escapa(p.marca) + '"? Essa ação não pode ser desfeita.</p>' +
    '<div class="form-acoes"><button class="btn" id="btnCancelarApagarPg">Cancelar</button><button class="btn btn-perigo" id="btnConfirmarApagarPg">Apagar</button></div>'
  );
  document.getElementById("btnCancelarApagarPg").addEventListener("click", fecharModal);
  document.getElementById("btnConfirmarApagarPg").addEventListener("click", async function(){
    await buscarSeguro(banco.from("ig_propostas").delete().eq("id", p.id));
    fecharModal();
    igRenderPropostas(area);
  });
}

/* ============================================================================
   SORTEIO (sorteia ganhadores entre quem comentou num post)
   Os comentários são lidos na hora, só pra sortear: não vão pro banco.
============================================================================ */
var igSorteio = { postId: null, postLegenda: "", comentarios: null, meuUsuario: null, truncado: false, vencedores: null };
var IG_CHAVE_HISTORICO_SORTEIO = "igHistoricoSorteios";

// Um número aleatório justo (sem viés) de 0 até maximo - 1, usando o sorteador do navegador.
function igNumeroAleatorio(maximo){
  var limite = Math.floor(4294967296 / maximo) * maximo;
  var caixa = new Uint32Array(1);
  do { crypto.getRandomValues(caixa); } while(caixa[0] >= limite);
  return caixa[0] % maximo;
}

function igEmbaralhar(lista){
  var copia = lista.slice();
  for(var i = copia.length - 1; i > 0; i--){
    var j = igNumeroAleatorio(i + 1);
    var troca = copia[i]; copia[i] = copia[j]; copia[j] = troca;
  }
  return copia;
}

function igNormalizarTexto(t){
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Quem pode ganhar: uma pessoa vale uma vez só, mesmo que tenha comentado várias.
function igParticipantesDoSorteio(opcoes){
  var excluidos = {};
  String(opcoes.excluir || "").split(/[,\s]+/).forEach(function(x){ var n = x.replace(/^@/, "").toLowerCase(); if(n) excluidos[n] = true; });
  if(igSorteio.meuUsuario) excluidos[igSorteio.meuUsuario.toLowerCase()] = true;
  var palavra = igNormalizarTexto(opcoes.palavra).trim();
  var vistos = {}, lista = [];
  (igSorteio.comentarios || []).forEach(function(c){
    var nome = String(c.username || "").trim();
    var chave = nome.toLowerCase();
    if(!nome || excluidos[chave] || vistos[chave]) return;
    if(palavra && igNormalizarTexto(c.texto).indexOf(palavra) === -1) return;
    vistos[chave] = true;
    lista.push(c);
  });
  return lista;
}

function igLerOpcoesSorteio(){
  var num = function(id, min, max, padrao){
    var v = parseInt(document.getElementById(id).value, 10);
    return isNaN(v) ? padrao : Math.max(min, Math.min(max, v));
  };
  return {
    ganhadores: num("igSorteioGanhadores", 1, 20, 1),
    suplentes: num("igSorteioSuplentes", 0, 10, 2),
    palavra: document.getElementById("igSorteioPalavra").value,
    excluir: document.getElementById("igSorteioExcluir").value
  };
}

async function igRenderSorteio(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando seus posts...</p>';
  var dados = await igCarregarPosts();

  var html = '<div class="painel-branco"><p class="painel-titulo">1. Escolha o post do sorteio</p>';
  if(!dados.conectado){
    html += '<p style="font-size:.84rem; color:#6b6353;">Conecte o Instagram pra escolher um post' + (dados.motivo ? " (" + escapa(dados.motivo) + ")" : "") + '. Passo a passo em INSTAGRAM-LEIA-ME.md.</p></div>';
    area.innerHTML = html;
    return;
  }
  html += '<div class="ig-posts" id="igPostsSorteio"></div></div>' +
    '<div class="painel-branco" id="igBlocoOpcoesSorteio"><p class="painel-titulo">2. Regras do sorteio</p>' +
      '<div class="form-linha"><div class="campo"><label for="igSorteioGanhadores">Quantos ganhadores</label><input id="igSorteioGanhadores" type="number" min="1" max="20" value="1"></div>' +
      '<div class="campo"><label for="igSorteioSuplentes">Quantos suplentes</label><input id="igSorteioSuplentes" type="number" min="0" max="10" value="2"></div></div>' +
      '<div class="campo"><label for="igSorteioPalavra">O comentário precisa ter a palavra (opcional)</label><input id="igSorteioPalavra" placeholder="Ex: eu quero"></div>' +
      '<div class="campo"><label for="igSorteioExcluir">Não incluir estes @ (opcional, separe por vírgula)</label><input id="igSorteioExcluir" placeholder="Ex: @amiga, @funcionario"></div>' +
      '<p class="ig-ajuda">Cada pessoa vale uma vez só, mesmo que tenha comentado várias vezes, e a sua própria conta fica de fora. O sorteio é feito aqui no seu navegador, de forma aleatória e justa.</p>' +
    '</div>' +
    '<div class="painel-branco"><p class="painel-titulo">3. Sortear</p>' +
      '<div class="barra-acoes"><button class="btn" id="btnBuscarParticipantes">Buscar quem comentou</button>' +
      '<button class="btn btn-principal" id="btnSortear" disabled>Sortear</button></div>' +
      '<p id="igResumoParticipantes" class="ig-ajuda"></p>' +
      '<div id="igPalcoSorteio"></div></div>' +
    '<div id="igHistoricoSorteio"></div>';
  area.innerHTML = html;

  var grade = document.getElementById("igPostsSorteio");
  if(dados.posts.length === 0) grade.innerHTML = '<p class="ig-ajuda">Nenhum post encontrado na sua conta.</p>';
  dados.posts.forEach(function(p){
    var b = el('<button type="button" class="ig-post ' + (igSorteio.postId === p.id ? "marcado" : "") + '" title="' + igAttr(p.legenda || "Post sem legenda") + '">' +
      (p.miniatura ? '<img src="' + igAttr(p.miniatura) + '" alt="" loading="lazy">' : '<span class="ig-sem-imagem">' + escapa(p.tipo || "Post") + '</span>') +
      '<span class="ig-marca"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg></span>' +
      '<span class="ig-legenda">' + escapa((p.legenda || "").slice(0, 60)) + '</span></button>');
    b.addEventListener("click", function(){
      grade.querySelectorAll(".ig-post").forEach(function(x){ x.classList.remove("marcado"); });
      b.classList.add("marcado");
      igSorteio = { postId: p.id, postLegenda: p.legenda || "", comentarios: null, meuUsuario: null, truncado: false, vencedores: null };
      document.getElementById("btnSortear").disabled = true;
      document.getElementById("igResumoParticipantes").textContent = "";
      document.getElementById("igPalcoSorteio").innerHTML = "";
    });
    grade.appendChild(b);
  });

  document.getElementById("btnBuscarParticipantes").addEventListener("click", igBuscarParticipantes);
  document.getElementById("btnSortear").addEventListener("click", igExecutarSorteio);
  igDesenharHistoricoSorteio();
}

async function igBuscarParticipantes(){
  var resumo = document.getElementById("igResumoParticipantes");
  if(!igSorteio.postId){ resumo.textContent = "Escolha um post primeiro."; return; }
  var botao = document.getElementById("btnBuscarParticipantes");
  botao.disabled = true;
  resumo.textContent = "Lendo os comentários do post...";
  var r = await igChamarFuncao("ig-analise", { acao: "comentarios", media_id: igSorteio.postId });
  botao.disabled = false;
  if(!r.ok || r.dados.conectado === false){
    resumo.innerHTML = '<span style="color:#8f1d20;">' + escapa(!r.ok ? igTextoFuncaoIndisponivel("ig-analise", r.mensagem) : (r.dados.motivo || "Não consegui ler os comentários.")) + '</span>';
    return;
  }
  igSorteio.comentarios = r.dados.comentarios || [];
  igSorteio.meuUsuario = r.dados.meu_usuario || null;
  igSorteio.truncado = !!r.dados.truncado;
  igSorteio.vencedores = null;
  document.getElementById("igPalcoSorteio").innerHTML = "";
  igAtualizarResumoParticipantes();
  ["igSorteioPalavra", "igSorteioExcluir"].forEach(function(id){
    document.getElementById(id).oninput = igAtualizarResumoParticipantes;
  });
}

function igAtualizarResumoParticipantes(){
  var resumo = document.getElementById("igResumoParticipantes");
  var botao = document.getElementById("btnSortear");
  if(!resumo || !igSorteio.comentarios) return;
  var pessoas = igParticipantesDoSorteio(igLerOpcoesSorteio());
  var totalPessoas = {};
  igSorteio.comentarios.forEach(function(c){ totalPessoas[String(c.username).toLowerCase()] = true; });
  resumo.innerHTML = '<strong>' + igFormatarNumero(igSorteio.comentarios.length) + '</strong> comentários de <strong>' + igFormatarNumero(Object.keys(totalPessoas).length) +
    '</strong> pessoas. Participando do sorteio: <strong>' + igFormatarNumero(pessoas.length) + '</strong>.' +
    (igSorteio.truncado ? ' (O post tem mais comentários; li os primeiros 5000.)' : '');
  botao.disabled = pessoas.length === 0;
}

function igExecutarSorteio(){
  var opcoes = igLerOpcoesSorteio();
  var pessoas = igParticipantesDoSorteio(opcoes);
  var palco = document.getElementById("igPalcoSorteio");
  if(pessoas.length === 0){ palco.innerHTML = faixaAviso("Ninguém está participando com essas regras.", "erro"); return; }
  var total = Math.min(pessoas.length, opcoes.ganhadores + opcoes.suplentes);
  var sorteadas = igEmbaralhar(pessoas).slice(0, total);
  var ganhadoras = sorteadas.slice(0, Math.min(opcoes.ganhadores, total));
  var suplentes = sorteadas.slice(ganhadoras.length);

  var botao = document.getElementById("btnSortear");
  botao.disabled = true;
  // um efeito de "roleta": passa nomes aleatórios por uns 2 segundos e depois revela
  palco.innerHTML = '<div class="ig-roleta" id="igRoleta">...</div>';
  var roleta = document.getElementById("igRoleta");
  var giro = setInterval(function(){ roleta.textContent = "@" + pessoas[igNumeroAleatorio(pessoas.length)].username; }, 70);
  setTimeout(function(){
    clearInterval(giro);
    igSorteio.vencedores = { ganhadoras: ganhadoras, suplentes: suplentes };
    var linha = function(c, rotulo){
      return '<div class="ig-vencedor"><span class="ig-vencedor-rotulo">' + rotulo + '</span>' +
        '<a href="https://instagram.com/' + igAttr(c.username) + '" target="_blank" rel="noopener"><strong>@' + escapa(c.username) + '</strong></a>' +
        '<span class="ig-vencedor-texto">' + escapa((c.texto || "").slice(0, 120)) + '</span></div>';
    };
    palco.innerHTML = '<div class="ig-resultado">' +
      '<p class="painel-titulo">Resultado do sorteio</p>' +
      ganhadoras.map(function(c, i){ return linha(c, ganhadoras.length === 1 ? "Ganhador(a)" : (i + 1) + "º lugar"); }).join("") +
      (suplentes.length ? '<p class="ig-ajuda" style="margin:12px 0 4px;">Suplentes (na ordem):</p>' + suplentes.map(function(c, i){ return linha(c, "Suplente " + (i + 1)); }).join("") : "") +
      '<div class="barra-acoes" style="margin-top:14px;"><button class="btn" id="btnCopiarSorteio">Copiar resultado</button><button class="btn btn-principal" id="btnSortearDeNovo">Sortear de novo</button></div>' +
      '<p class="ig-ajuda">' + igFormatarNumero(pessoas.length) + ' pessoas participaram. Sorteio feito em ' + escapa(formatarDataHora(new Date().toISOString())) + '.</p></div>';
    document.getElementById("btnSortearDeNovo").addEventListener("click", igExecutarSorteio);
    document.getElementById("btnCopiarSorteio").addEventListener("click", function(){ igCopiarResultadoSorteio(pessoas.length); });
    botao.disabled = false;
    igGuardarSorteioNoHistorico(pessoas.length, ganhadoras, suplentes);
    igDesenharHistoricoSorteio();
  }, 2200);
}

function igTextoResultadoSorteio(participantes){
  var v = igSorteio.vencedores;
  if(!v) return "";
  return "Sorteio do post" + (igSorteio.postLegenda ? ' "' + igSorteio.postLegenda.slice(0, 60) + '"' : "") + " em " + formatarDataHora(new Date().toISOString()) + " (" + participantes + " participantes)\n" +
    v.ganhadoras.map(function(c, i){ return (v.ganhadoras.length === 1 ? "Ganhador(a): " : (i + 1) + "º: ") + "@" + c.username; }).join("\n") +
    (v.suplentes.length ? "\nSuplentes: " + v.suplentes.map(function(c){ return "@" + c.username; }).join(", ") : "");
}

async function igCopiarResultadoSorteio(participantes){
  var texto = igTextoResultadoSorteio(participantes);
  try{
    await navigator.clipboard.writeText(texto);
    document.getElementById("btnCopiarSorteio").textContent = "Copiado!";
  }catch(erro){
    window.prompt("Copie o resultado (Ctrl+C):", texto);
  }
}

// O histórico fica só neste navegador (são @ de outras pessoas, não vão pro banco).
function igLerHistoricoSorteio(){
  try{ return JSON.parse(localStorage.getItem(IG_CHAVE_HISTORICO_SORTEIO) || "[]"); }catch(erro){ return []; }
}
function igGuardarSorteioNoHistorico(participantes, ganhadoras, suplentes){
  var lista = igLerHistoricoSorteio();
  lista.unshift({
    quando: new Date().toISOString(), post: igSorteio.postLegenda, participantes: participantes,
    ganhadoras: ganhadoras.map(function(c){ return c.username; }), suplentes: suplentes.map(function(c){ return c.username; })
  });
  try{ localStorage.setItem(IG_CHAVE_HISTORICO_SORTEIO, JSON.stringify(lista.slice(0, 10))); }catch(erro){}
}
function igDesenharHistoricoSorteio(){
  var alvo = document.getElementById("igHistoricoSorteio");
  if(!alvo) return;
  var lista = igLerHistoricoSorteio();
  if(lista.length === 0){ alvo.innerHTML = ""; return; }
  alvo.innerHTML = '<div class="painel-branco"><p class="painel-titulo">Sorteios anteriores (guardados só neste navegador)</p>' +
    lista.map(function(s){
      return '<div class="ig-historico-linha"><strong>' + escapa(formatarDataHora(s.quando)) + '</strong> · ' + escapa((s.post || "post").slice(0, 50)) +
        '<div class="ig-ajuda" style="margin:2px 0 0;">' + s.participantes + ' participantes. Ganhou: ' + s.ganhadoras.map(function(u){ return "@" + escapa(u); }).join(", ") +
        (s.suplentes.length ? '. Suplentes: ' + s.suplentes.map(function(u){ return "@" + escapa(u); }).join(", ") : "") + '</div></div>';
    }).join("") + '</div>';
}
