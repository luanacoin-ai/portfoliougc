/* ============================================================================
   ABA PRECIFICAÇÃO (grupo Financeiro)
   Quanto cobrar por trabalho e quando vale a pena aceitar uma oferta.

   Conta do preço de tabela:
     custo do mês   = custos fixos + (equipamento / vida útil) + renda desejada
     base           = custo do mês / trabalhos por mês + gasto direto
     preço          = base x (1 + lucro%) / (1 - imposto%)

   "Salvar cálculo" guarda os números na tabela fin_precificacao (arquivo
   precificacao.sql). Enquanto a tabela não existir, guarda só neste navegador.

   Usa o que já existe no painel: banco, buscarSeguro, escapa, faixaAviso.
============================================================================ */
"use strict";

var PREC_PADRAO = {
  custos_fixos: 0, equipamento: 0, vida_util: 24, gasto_direto: 0,
  renda: 0, capacidade: 20, lucro: 20, imposto: 6, agenda: 70, oferta: null
};
var PREC_CHAVE_LOCAL = "painel_precificacao";
var prec = null;          // os números na tela
var precIdBanco = null;   // id da linha no Supabase (se a tabela existir)
var precTemTabela = false;

function precNum(v){
  if(v === null || v === undefined || v === "") return 0;
  var n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}
function precMoeda(v){
  return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function precMostrarNum(v){
  if(v === null || v === undefined || v === "") return "";
  return String(v).replace(".", ",");
}

/* ---------- a conta ---------- */
function precCalcular(d){
  var capacidade = Math.max(1, Math.round(precNum(d.capacidade)));
  var vida = Math.max(1, precNum(d.vida_util));
  var imposto = Math.min(90, Math.max(0, precNum(d.imposto))) / 100;
  var lucro = Math.max(0, precNum(d.lucro)) / 100;
  var fixosMes = precNum(d.custos_fixos) + precNum(d.equipamento) / vida;
  var direto = precNum(d.gasto_direto);
  var custoMes = fixosMes + precNum(d.renda);
  var base = custoMes / capacidade + direto;
  var preco = base * (1 + lucro) / (1 - imposto);

  // custo direto com o imposto que sai em cima dele: abaixo disso você paga pra trabalhar
  var custoDireto = direto / (1 - imposto);

  // quanto sobra de cada trabalho pra pagar os fixos, e em quantos trabalhos eles se pagam
  var sobraPorTrabalho = preco * (1 - imposto) - direto;
  var trabalhosPraFixos = fixosMes > 0 && sobraPorTrabalho > 0 ? Math.ceil(fixosMes / sobraPorTrabalho) : 0;

  // mínimo de hoje: depende de quão cheia está a agenda
  var a = Math.min(100, Math.max(0, precNum(d.agenda)));
  var fator, faixa, frase;
  if(a < 40){
    fator = 0.5 + 0.5 * (a / 40);
    faixa = "vazia";
    frase = "Agenda com espaço. Dá pra negociar um pouco, mas nunca abaixo do custo direto.";
  }else if(a <= 80){
    fator = 1;
    faixa = "equilibrada";
    frase = "Agenda equilibrada. Cobre seu preço de tabela.";
  }else{
    fator = 1 + 0.3 * ((a - 80) / 20);
    faixa = "cheia";
    frase = "Agenda cheia. Só vale aceitar acima do preço de tabela.";
  }
  var minimo = Math.max(custoDireto, custoDireto + (preco - custoDireto) * fator);

  return {
    preco: preco, custoDireto: custoDireto, minimo: minimo, agenda: a, faixa: faixa, frase: frase,
    trabalhosPraFixos: trabalhosPraFixos, capacidade: capacidade, fixosMes: fixosMes
  };
}

/* ---------- carregar e salvar ---------- */
async function precCarregar(){
  var dados = Object.assign({}, PREC_PADRAO);
  try{
    var local = JSON.parse(localStorage.getItem(PREC_CHAVE_LOCAL) || "null");
    if(local) dados = Object.assign(dados, local);
  }catch(e){}

  var r = await buscarSeguro(banco.from("fin_precificacao").select("*").order("atualizado_em", { ascending: false }).limit(1));
  precTemTabela = r.ok;
  if(r.ok && r.dados.length){
    var linha = r.dados[0];
    precIdBanco = linha.id;
    Object.keys(PREC_PADRAO).forEach(function(k){
      if(linha[k] !== null && linha[k] !== undefined) dados[k] = Number(linha[k]);
    });
  }
  return dados;
}

async function precSalvar(){
  var dados = {};
  Object.keys(PREC_PADRAO).forEach(function(k){
    dados[k] = k === "oferta" ? (prec.oferta === null || prec.oferta === "" ? null : precNum(prec.oferta)) : precNum(prec[k]);
  });
  try{ localStorage.setItem(PREC_CHAVE_LOCAL, JSON.stringify(dados)); }catch(e){}

  if(!precTemTabela) return { ok: true, soLocal: true };
  dados.atualizado_em = new Date().toISOString();
  var r = precIdBanco
    ? await buscarSeguro(banco.from("fin_precificacao").update(dados).eq("id", precIdBanco).select())
    : await buscarSeguro(banco.from("fin_precificacao").insert(dados).select());
  if(r.ok && r.dados[0]) precIdBanco = r.dados[0].id;
  return r;
}

/* ---------- ícones da aba ---------- */
var PREC_ICONES = {
  etiqueta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  balanca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z"/></svg>',
  mao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/></svg>',
  escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  salvar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
};

/* ---------- a tela ---------- */
function precCampoDinheiro(id, rotulo, ajuda, valor, placeholder){
  return '<div class="prec-campo">' +
    '<label for="prec_' + id + '">' + rotulo + '</label>' +
    '<div class="prec-input"><span>R$</span><input id="prec_' + id + '" data-k="' + id + '" inputmode="decimal" placeholder="' + (placeholder || "0") + '" value="' + escapa(precMostrarNum(valor)) + '"></div>' +
    (ajuda ? '<small>' + ajuda + '</small>' : '') +
  '</div>';
}
function precCampoNumero(id, rotulo, ajuda, valor, sufixo){
  return '<div class="prec-campo">' +
    '<label for="prec_' + id + '">' + rotulo + '</label>' +
    '<div class="prec-input">' + '<input id="prec_' + id + '" data-k="' + id + '" inputmode="decimal" value="' + escapa(precMostrarNum(valor)) + '">' + (sufixo ? '<span>' + sufixo + '</span>' : '') + '</div>' +
    (ajuda ? '<small>' + ajuda + '</small>' : '') +
  '</div>';
}

async function abaPrecificacao(painel){
  prec = await precCarregar();

  painel.innerHTML =
    '<div class="fin-topo"><div class="fin-titulo"><span class="fin-assina">quanto vale o seu trabalho</span><strong>Quanto cobrar e quando aceitar um trabalho</strong></div></div>' +
    (precTemTabela ? '' : faixaAviso("Por enquanto o cálculo fica salvo só neste navegador. Pra guardar no Supabase (e ver em qualquer aparelho), rode o arquivo precificacao.sql no SQL Editor.", "")) +
    '<div class="prec-grade">' +
      '<section class="prec-card">' +
        '<h3 class="prec-card-titulo">Seus números</h3>' +
        precCampoDinheiro("custos_fixos", "Custos fixos mensais", "Internet, assinaturas, MEI, parte do aluguel. É o que você paga todo mês, com ou sem trabalho.", prec.custos_fixos) +
        '<div class="prec-duas">' +
          precCampoDinheiro("equipamento", "Equipamento", "", prec.equipamento) +
          precCampoNumero("vida_util", "Vida útil (meses)", "", prec.vida_util) +
        '</div>' +
        precCampoDinheiro("gasto_direto", "Gasto direto por trabalho", "Só o que sai do bolso a cada trabalho: deslocamento, objetos de cena, música ou imagem paga, taxa de pagamento. Não inclui custo fixo.", prec.gasto_direto) +
        precCampoDinheiro("renda", "Renda mensal desejada", "Quanto você quer levar pra casa por mês.", prec.renda) +
        precCampoNumero("capacidade", "Trabalhos por mês (capacidade)", "Quantos vídeos você consegue entregar por mês no seu limite realista.", prec.capacidade) +
        '<button type="button" class="prec-avancado-btn" aria-expanded="false" id="precAvancadoBtn">' + PREC_ICONES.seta + '<span>Avançado</span></button>' +
        '<div class="prec-avancado" id="precAvancado" hidden>' +
          '<div class="prec-duas">' +
            precCampoNumero("lucro", "Margem de lucro", "Uma sobra pra reserva e pra crescer.", prec.lucro, "%") +
            precCampoNumero("imposto", "Impostos e taxas", "Nota fiscal e taxas sobre o valor recebido.", prec.imposto, "%") +
          '</div>' +
        '</div>' +
      '</section>' +

      '<div class="prec-coluna">' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo com-icone">' + PREC_ICONES.etiqueta + 'Seu preço de tabela</h3>' +
          '<div class="prec-destaque">' +
            '<span class="prec-destaque-rotulo">Cobre seus custos, sua renda e seu lucro</span>' +
            '<strong id="precPreco">R$ 0,00</strong>' +
            '<span class="prec-destaque-sub">por trabalho</span>' +
          '</div>' +
          '<div class="prec-nota">' + PREC_ICONES.balanca + '<span id="precNotaFixos"></span></div>' +
        '</section>' +

        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo com-icone">' + PREC_ICONES.mao + 'Vale a pena aceitar este trabalho?</h3>' +
          '<div class="prec-agenda-topo"><label for="precAgenda">Quão cheia está sua agenda?</label><strong id="precAgendaNum">70%</strong></div>' +
          '<input type="range" min="0" max="100" step="5" id="precAgenda" class="prec-range" value="' + escapa(prec.agenda) + '">' +
          '<p class="prec-agenda-frase" id="precAgendaFrase"></p>' +
          '<div class="prec-mini-duas">' +
            '<div class="prec-mini"><span class="prec-mini-icone perigo">' + PREC_ICONES.escudo + '</span><div><small>Custo direto (nunca abaixo)</small><b id="precCustoDireto">R$ 0,00</b></div></div>' +
            '<div class="prec-mini"><span class="prec-mini-icone atencao">' + PREC_ICONES.mao + '</span><div><small>Mínimo para aceitar hoje</small><b id="precMinimo">R$ 0,00</b></div></div>' +
          '</div>' +
          '<div class="prec-regua">' +
            '<div class="prec-regua-barra"><i class="prec-regua-min" id="precReguaMin"><span>mínimo hoje</span></i><i class="prec-regua-ponto" id="precReguaPonto"></i></div>' +
            '<div class="prec-regua-rotulos"><span id="precReguaEsq">R$ 0,00</span><span id="precReguaDir">R$ 0,00</span></div>' +
          '</div>' +
          '<div class="prec-campo" style="margin-top:18px">' +
            '<label for="prec_oferta">Me ofereceram</label>' +
            '<div class="prec-input"><span>R$</span><input id="prec_oferta" data-k="oferta" inputmode="decimal" placeholder="Digite o valor da oferta" value="' + escapa(precMostrarNum(prec.oferta)) + '"></div>' +
          '</div>' +
          '<div class="prec-veredito oculto" id="precVeredito"></div>' +
        '</section>' +

        '<button type="button" class="prec-salvar" id="precSalvar">' + PREC_ICONES.salvar + '<span>Salvar cálculo</span></button>' +
        '<p class="prec-salvo oculto" id="precSalvo"></p>' +
      '</div>' +
    '</div>';

  // abre o "Avançado" sozinho se você já mexeu nesses números
  var btnAv = painel.querySelector("#precAvancadoBtn");
  var caixaAv = painel.querySelector("#precAvancado");
  function abrirAvancado(abrir){
    caixaAv.hidden = !abrir;
    btnAv.setAttribute("aria-expanded", abrir ? "true" : "false");
  }
  btnAv.addEventListener("click", function(){ abrirAvancado(caixaAv.hidden); });
  if(precNum(prec.lucro) !== PREC_PADRAO.lucro || precNum(prec.imposto) !== PREC_PADRAO.imposto) abrirAvancado(true);

  painel.querySelectorAll("input[data-k]").forEach(function(inp){
    inp.addEventListener("input", function(){
      prec[inp.dataset.k] = inp.value.trim() === "" ? (inp.dataset.k === "oferta" ? null : 0) : inp.value;
      precAtualizar(painel);
    });
  });
  var faixa = painel.querySelector("#precAgenda");
  faixa.addEventListener("input", function(){ prec.agenda = Number(faixa.value); precAtualizar(painel); });

  var btnSalvar = painel.querySelector("#precSalvar");
  btnSalvar.addEventListener("click", async function(){
    var aviso = painel.querySelector("#precSalvo");
    btnSalvar.disabled = true;
    var r = await precSalvar();
    btnSalvar.disabled = false;
    aviso.classList.remove("oculto", "erro");
    if(!r.ok){
      aviso.classList.add("erro");
      aviso.textContent = "Não consegui salvar no Supabase: " + r.mensagem + ". Ficou salvo neste navegador.";
    }else{
      aviso.textContent = r.soLocal ? "Cálculo salvo neste navegador." : "Cálculo salvo.";
    }
  });

  precAtualizar(painel);
}

function precAtualizar(painel){
  var c = precCalcular(prec);
  var $ = function(id){ return painel.querySelector("#" + id); };

  $("precPreco").textContent = precMoeda(c.preco);

  var nota;
  if(c.preco <= 0) nota = "Preencha seus números ao lado pra ver o seu preço por trabalho.";
  else if(c.fixosMes <= 0) nota = "Você não tem custo fixo cadastrado: cada trabalho já vai direto pra sua renda e seu lucro.";
  else if(c.trabalhosPraFixos <= 1) nota = "A esse preço, seus custos fixos saem cobertos logo no primeiro trabalho do mês.";
  else if(c.trabalhosPraFixos <= Math.max(2, Math.round(c.capacidade * 0.3))) nota = "A esse preço, seus custos fixos já saem cobertos logo nos primeiros " + c.trabalhosPraFixos + " trabalhos do mês.";
  else nota = "A esse preço, você precisa de " + c.trabalhosPraFixos + " trabalhos só pra pagar os custos fixos do mês.";
  $("precNotaFixos").textContent = nota;

  $("precAgendaNum").textContent = c.agenda + "%";
  $("precAgenda").style.setProperty("--p", c.agenda + "%");
  $("precAgendaFrase").textContent = c.frase;
  $("precCustoDireto").textContent = precMoeda(c.custoDireto);
  $("precMinimo").textContent = precMoeda(c.minimo);

  // régua: do custo direto até um pouco acima do preço de tabela
  var esq = c.custoDireto;
  var dir = Math.max(c.preco * 1.3, c.minimo * 1.1, esq);
  var largura = dir - esq;
  function pos(v){ return largura > 0 ? Math.min(100, Math.max(0, (v - esq) / largura * 100)) : 0; }
  $("precReguaEsq").textContent = precMoeda(esq);
  $("precReguaDir").textContent = precMoeda(dir);
  var posMin = pos(c.minimo);
  $("precReguaMin").style.left = posMin + "%";
  // nas pontas da régua o texto "mínimo hoje" encosta pro lado de dentro
  $("precReguaMin").firstChild.style.transform = posMin < 12 ? "translateX(-6px)" : posMin > 88 ? "translateX(calc(-100% + 6px))" : "translateX(-50%)";

  var oferta = prec.oferta === null || prec.oferta === "" ? null : precNum(prec.oferta);
  var ponto = $("precReguaPonto");
  var ver = $("precVeredito");
  ponto.style.left = pos(oferta === null ? esq : oferta) + "%";
  ponto.classList.toggle("vazio", oferta === null);

  if(oferta === null || c.preco <= 0){
    ver.classList.add("oculto");
    return;
  }
  var tipo, texto;
  if(oferta < c.custoDireto){
    tipo = "ruim";
    texto = "<b>Recuse.</b> Esse valor não paga nem o custo direto do trabalho: você pagaria pra trabalhar.";
  }else if(oferta < c.minimo){
    tipo = "atencao";
    texto = "<b>Abaixo do mínimo de hoje.</b> Faça uma contraproposta de " + precMoeda(Math.max(c.minimo, c.preco)) + " ou aceite só se o trabalho trouxer algo a mais (portfólio, marca dos sonhos, contrato longo).";
  }else if(oferta < c.preco){
    tipo = "ok";
    texto = "<b>Dá pra aceitar.</b> Está acima do mínimo de hoje, mas " + precMoeda(c.preco - oferta) + " abaixo da sua tabela.";
  }else{
    tipo = "otimo";
    texto = "<b>Aceite!</b> A oferta cobre o seu preço de tabela" + (oferta > c.preco ? " e ainda sobra " + precMoeda(oferta - c.preco) : "") + ".";
  }
  ver.className = "prec-veredito " + tipo;
  ver.innerHTML = texto;
}
