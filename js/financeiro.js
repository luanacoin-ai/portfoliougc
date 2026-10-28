/* ============================================================================
   ABA FINANCEIRO, PARTE 2: a tela
   Visão geral (números e gráficos), Lançamentos, Contas do mês e Importar
   (extrato ou fatura, com revisão antes de salvar).

   Carregado DEPOIS do financeiro-leitura.js (que lê os arquivos) e usa o que já
   existe no painel: banco, buscarSeguro, escapa, icone, faixaAviso, irParaAba,
   abrirModal, fecharModal, formatarData, baixarCSV.

   Os dados ficam nas tabelas fin_perfis, fin_lancamentos e fin_contas
   (arquivo financeiro.sql), trancadas pro seu e-mail.
============================================================================ */
"use strict";

var FIN_NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

var finPerfis = [];
var finPerfilId = null;
var finSubaba = "visao";                 // visao | lancamentos | contas | importar
var finModo = "mensal";                  // mensal | anual
var finMes = finHojeISO().slice(0, 7);   // "AAAA-MM": o mês (ou o ano) que está na tela
var finLinhas = null;                    // todos os lançamentos do perfil (guardados na memória)
var finLinhasDoPerfil = null;
var finContas = [];
var finFiltro = { tipo: "todos", categoria: "", busca: "", limite: 150 };
var finImp = null;                       // a importação que está sendo revisada

/* ============================================================================
   PEQUENOS AJUDANTES
============================================================================ */
function finAttr(texto){ return escapa(texto).replace(/"/g, "&quot;"); }

function finMoeda(valor){
  var n = Number(valor || 0);
  var texto = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-" : "") + "R$ " + texto;
}

// "R$ 6 mil", "R$ 850": pra os números pequenos nos eixos dos gráficos
function finMoedaCurta(valor){
  var n = Math.abs(Number(valor || 0));
  if(n >= 1000000) return "R$ " + (n / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if(n >= 1000) return "R$ " + (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return "R$ " + Math.round(n);
}

function finSomarMes(ym, n){
  var ano = +ym.slice(0, 4), mes = +ym.slice(5, 7) - 1 + n;
  ano += Math.floor(mes / 12);
  mes = ((mes % 12) + 12) % 12;
  return ano + "-" + finDoisDigitos(mes + 1);
}
function finNomeMes(ym){ return FIN_NOMES_MES[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4); }
function finMesAbrev(ym){ return FIN_NOMES_MES[+ym.slice(5, 7) - 1].slice(0, 3) + "/" + ym.slice(2, 4); }
function finUltimoDiaDoMes(ym){ return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); }

function finPerfilAtual(){
  for(var i = 0; i < finPerfis.length; i++) if(finPerfis[i].id === finPerfilId) return finPerfis[i];
  return finPerfis[0] || null;
}

function finDataCurta(dataISO){ return dataISO.slice(8, 10) + "/" + dataISO.slice(5, 7); }

function finOpcoes(lista, atual){
  return lista.map(function(c){ return '<option value="' + finAttr(c) + '"' + (c === atual ? " selected" : "") + '>' + escapa(c) + '</option>'; }).join("");
}

/* ============================================================================
   CARREGAR OS DADOS
============================================================================ */
async function finCarregarPerfis(){
  var r = await buscarSeguro(banco.from("fin_perfis").select("*").order("ordem"));
  if(!r.ok) return { ok: false, mensagem: r.mensagem };
  if(r.dados.length === 0){
    var criou = await buscarSeguro(banco.from("fin_perfis").insert([{ nome: "Pessoal", ordem: 1 }, { nome: "Profissional", ordem: 2 }]));
    if(!criou.ok) return { ok: false, mensagem: criou.mensagem };
    r = await buscarSeguro(banco.from("fin_perfis").select("*").order("ordem"));
    if(!r.ok) return { ok: false, mensagem: r.mensagem };
  }
  finPerfis = r.dados;
  var guardado = null;
  try{ guardado = localStorage.getItem("finPerfilAtual"); }catch(erro){}
  var existe = finPerfis.some(function(p){ return p.id === (finPerfilId || guardado); });
  finPerfilId = existe ? (finPerfilId || guardado) : finPerfis[0].id;
  return { ok: true };
}

function finGuardarPerfil(id){
  finPerfilId = id;
  finLinhas = null;
  try{ localStorage.setItem("finPerfilAtual", id); }catch(erro){}
}

// O Supabase devolve no máximo 1000 linhas por pedido: busca de 1000 em 1000.
async function finCarregarPaginas(fabrica, maxPaginas){
  var tudo = [];
  for(var p = 0; p < maxPaginas; p++){
    var r = await buscarSeguro(fabrica().range(p * 1000, p * 1000 + 999));
    if(!r.ok) return { ok: false, mensagem: r.mensagem, dados: tudo };
    tudo = tudo.concat(r.dados);
    if(r.dados.length < 1000) return { ok: true, dados: tudo };
  }
  return { ok: true, dados: tudo };
}

async function finCarregarLinhas(){
  if(finLinhas && finLinhasDoPerfil === finPerfilId) return { ok: true };
  var perfil = finPerfilId;
  var r = await finCarregarPaginas(function(){
    // a ordem fixa (data e depois id) evita linhas repetidas ou faltando entre uma página de 1000 e outra
    return banco.from("fin_lancamentos").select("*").eq("perfil_id", perfil).order("data", { ascending: false }).order("id");
  }, 30);
  if(!r.ok) return { ok: false, mensagem: r.mensagem };
  r.dados.forEach(function(l){ l.valor = Number(l.valor); });
  finLinhas = r.dados;
  finLinhasDoPerfil = perfil;
  return { ok: true };
}

async function finCarregarContas(){
  var r = await buscarSeguro(banco.from("fin_contas").select("*").eq("perfil_id", finPerfilId).order("dia_vencimento"));
  finContas = r.ok ? r.dados.map(function(c){ c.valor = Number(c.valor); return c; }) : [];
  return r;
}

/* ============================================================================
   CONTAS (SOMAS) DO PAINEL
============================================================================ */
function finSomar(linhas, tipo, pago){
  var total = 0;
  linhas.forEach(function(l){
    if(l.tipo === tipo && (pago === undefined || !!l.pago === pago)) total += l.valor;
  });
  return total;
}

// O que está na tela: o mês escolhido, ou o ano inteiro.
function finNoPeriodo(linhas){
  var chave = finModo === "anual" ? finMes.slice(0, 4) : finMes;
  return linhas.filter(function(l){ return l.data.slice(0, chave.length) === chave; });
}

// Quanto tem na conta agora: saldo inicial + o que entrou e saiu (só o que já foi pago, até hoje).
function finSaldoAgora(linhas, perfil){
  var hoje = finHojeISO();
  var saldo = Number(perfil ? perfil.saldo_inicial : 0);
  linhas.forEach(function(l){
    if(!l.pago || l.data > hoje) return;
    saldo += l.tipo === "receita" ? l.valor : -l.valor;
  });
  return saldo;
}

function finPorCategoria(linhas, tipo){
  var mapa = {};
  linhas.forEach(function(l){
    if(l.tipo !== tipo || !l.pago) return;
    mapa[l.categoria] = (mapa[l.categoria] || 0) + l.valor;
  });
  return Object.keys(mapa).map(function(c){ return { rotulo: c, valor: mapa[c], cor: finCor(c) }; })
    .sort(function(a, b){ return b.valor - a.valor; });
}

// Os últimos "n" meses até "ymFim": receitas, despesas e lucro de cada um.
function finSerieMeses(linhas, ymFim, n){
  var meses = [];
  for(var i = n - 1; i >= 0; i--) meses.push(finSomarMes(ymFim, -i));
  var mapa = {};
  meses.forEach(function(ym){ mapa[ym] = { ym: ym, rotulo: finMesAbrev(ym), receitas: 0, despesas: 0 }; });
  linhas.forEach(function(l){
    var item = mapa[l.data.slice(0, 7)];
    if(!item || !l.pago) return;
    if(l.tipo === "receita") item.receitas += l.valor; else item.despesas += l.valor;
  });
  return meses.map(function(ym){ var it = mapa[ym]; it.lucro = it.receitas - it.despesas; return it; });
}

// Conta fixa paga no mês = existe um lançamento pago ligado a ela naquele mês.
function finLancamentoDaConta(conta, ym){
  var achou = null;
  (finLinhas || []).forEach(function(l){
    if(l.conta_id === conta.id && l.data.slice(0, 7) === ym) achou = l;
  });
  return achou;
}

function finVencimentoDaConta(conta, ym){
  return ym + "-" + finDoisDigitos(Math.min(conta.dia_vencimento, finUltimoDiaDoMes(ym)));
}

// "pago", "atrasada" ou "aberta" (ainda vai vencer)
function finSituacaoDaConta(conta, ym){
  var lanc = finLancamentoDaConta(conta, ym);
  if(lanc && lanc.pago) return "pago";
  return finVencimentoDaConta(conta, ym) < finHojeISO() ? "atrasada" : "aberta";
}

/* ============================================================================
   GRÁFICOS (SVG simples, sem biblioteca)
============================================================================ */
function finEscalaMax(max){
  if(!(max > 0)) return 100;
  var exp = Math.pow(10, Math.floor(Math.log10(max)));
  var f = max / exp;
  var bonito = f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 2.5 ? 2.5 : (f <= 5 ? 5 : 10)));
  return bonito * exp;
}

// Curva suave passando pelos pontos (sem passar do teto nem do chão do gráfico).
function finCaminhoSuave(pts, yMin, yMax){
  if(pts.length < 2) return "";
  var limitar = function(y){ return Math.max(yMin, Math.min(yMax, y)); };
  var d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
  for(var i = 0; i < pts.length - 1; i++){
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = limitar(p1[1] + (p2[1] - p0[1]) / 6);
    var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = limitar(p2[1] - (p3[1] - p1[1]) / 6);
    d += " C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
  }
  return d;
}

function finSvgLinhas(serie){
  var W = 620, H = 230, pl = 56, pr = 30, pt = 14, pb = 30;
  var maior = 0;
  serie.forEach(function(s){ maior = Math.max(maior, s.receitas, s.despesas); });
  var max = finEscalaMax(maior);
  var alto = H - pt - pb, largo = W - pl - pr;
  var x = function(i){ return pl + (serie.length === 1 ? largo / 2 : largo * i / (serie.length - 1)); };
  var y = function(v){ return pt + alto * (1 - v / max); };
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fin-svg" role="img" aria-label="Receitas e despesas por mês">';
  for(var g = 0; g <= 4; g++){
    var gy = pt + alto * (1 - g / 4);
    svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + gy + '" y2="' + gy + '" stroke="#EADFCB" stroke-width="1"/>' +
      '<text x="' + (pl - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="#725A50">' + finMoedaCurta(max * g / 4) + '</text>';
  }
  var linhas = [
    { chave: "receitas", cor: "#6E7F52", rotulo: "Receitas" },
    { chave: "despesas", cor: "#B5543C", rotulo: "Despesas" }
  ];
  linhas.forEach(function(l){
    var pts = serie.map(function(s, i){ return [x(i), y(s[l.chave])]; });
    if(pts.length > 1){
      var caminho = finCaminhoSuave(pts, pt, pt + alto);
      svg += '<path d="' + caminho + ' L' + x(serie.length - 1).toFixed(1) + ',' + (pt + alto) + ' L' + x(0).toFixed(1) + ',' + (pt + alto) + ' Z" fill="' + l.cor + '" opacity=".08"/>' +
        '<path d="' + caminho + '" fill="none" stroke="' + l.cor + '" stroke-width="2.4" stroke-linecap="round"/>';
    }
    serie.forEach(function(s, i){
      svg += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(s[l.chave]).toFixed(1) + '" r="3.4" fill="#FCF8F0" stroke="' + l.cor + '" stroke-width="2">' +
        '<title>' + s.rotulo + ': ' + l.rotulo + ' ' + finMoeda(s[l.chave]) + '</title></circle>';
    });
  });
  serie.forEach(function(s, i){
    svg += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#725A50">' + s.rotulo + '</text>';
  });
  return svg + '</svg>';
}

function finSvgBarras(serie){
  var W = 560, H = 220, pl = 56, pr = 10, pt = 14, pb = 30;
  var maior = 0;
  serie.forEach(function(s){ maior = Math.max(maior, s.receitas, s.despesas, Math.max(0, s.lucro)); });
  var max = finEscalaMax(maior);
  var alto = H - pt - pb, largo = W - pl - pr;
  var grupo = largo / serie.length, barra = Math.min(16, grupo * 0.24);
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fin-svg" role="img" aria-label="Comparativo mensal">';
  for(var g = 0; g <= 4; g++){
    var gy = pt + alto * (1 - g / 4);
    svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + gy + '" y2="' + gy + '" stroke="#EADFCB" stroke-width="1"/>' +
      '<text x="' + (pl - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="#725A50">' + finMoedaCurta(max * g / 4) + '</text>';
  }
  serie.forEach(function(s, i){
    var cx = pl + grupo * i + grupo / 2;
    [{ v: s.receitas, cor: "#6E7F52", n: "Receitas" }, { v: s.despesas, cor: "#B5543C", n: "Despesas" }, { v: s.lucro, cor: "#C98A55", n: "Lucro" }].forEach(function(b, k){
      var h = Math.max(0, b.v) / max * alto;
      var bx = cx + (k - 1) * (barra + 3) - barra / 2;
      svg += '<rect x="' + bx.toFixed(1) + '" y="' + (pt + alto - h).toFixed(1) + '" width="' + barra.toFixed(1) + '" height="' + Math.max(h, b.v ? 1.5 : 0).toFixed(1) + '" rx="3" fill="' + (b.v < 0 ? "#B3382C" : b.cor) + '">' +
        '<title>' + s.rotulo + ': ' + b.n + ' ' + finMoeda(b.v) + '</title></rect>';
    });
    svg += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#725A50">' + s.rotulo + '</text>';
  });
  return svg + '</svg>';
}

// Rosca: itens = [{rotulo, valor, cor}]. Mostra no máximo 5 fatias e junta o resto em "Outras".
function finHtmlRosca(itens, vazioTexto){
  var total = itens.reduce(function(t, i){ return t + i.valor; }, 0);
  if(total <= 0) return '<p class="vazio-explicacao">' + escapa(vazioTexto) + '</p>';
  var fatias = itens.slice(0, 5);
  var resto = itens.slice(5).reduce(function(t, i){ return t + i.valor; }, 0);
  if(resto > 0) fatias.push({ rotulo: "Outras", valor: resto, cor: "#CDBFAA" });
  var R = 52, C = 2 * Math.PI * R, acumulado = 0;
  var svg = '<svg viewBox="0 0 140 140" class="fin-rosca" role="img" aria-label="Divisão por categoria">' +
    '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#EFE3D0" stroke-width="22"/>';
  fatias.forEach(function(f){
    var comp = f.valor / total * C;
    svg += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + f.cor + '" stroke-width="22" stroke-dasharray="' + comp.toFixed(2) + ' ' + (C - comp).toFixed(2) + '" stroke-dashoffset="' + (-acumulado).toFixed(2) + '" transform="rotate(-90 70 70)">' +
      '<title>' + escapa(f.rotulo) + ': ' + finMoeda(f.valor) + '</title></circle>';
    acumulado += comp;
  });
  svg += '<text x="70" y="66" text-anchor="middle" font-size="9" fill="#725A50">total</text>' +
    '<text x="70" y="82" text-anchor="middle" font-size="13" font-weight="600" fill="#4A2E26">' + finMoedaCurta(total) + '</text></svg>';
  var legenda = '<ul class="fin-legenda">' + fatias.map(function(f){
    return '<li><i style="background:' + f.cor + '"></i><span>' + escapa(f.rotulo) + '</span><b>' + Math.round(f.valor / total * 100) + '%</b></li>';
  }).join("") + '</ul>';
  return '<div class="fin-rosca-linha">' + svg + legenda + '</div>';
}

/* ============================================================================
   A ABA
============================================================================ */
function finHtmlPrecisaDoBanco(mensagem){
  return '<div class="painel-branco"><p class="painel-titulo">Falta preparar o banco de dados do Financeiro</p>' +
    '<p style="font-size:.84rem; margin-bottom:10px;">As tabelas do Financeiro ainda não existem no seu Supabase. É um passo só, e você faz uma vez:</p>' +
    '<ol class="fin-passos"><li>Abra o arquivo <strong>financeiro.sql</strong> (está na pasta do seu site).</li>' +
    '<li>No Supabase, abra o <strong>SQL Editor</strong> e clique em <strong>New query</strong>.</li>' +
    '<li>Cole o texto inteiro do arquivo e clique em <strong>Run</strong>.</li>' +
    '<li>Volte aqui e recarregue a página (Ctrl+F5).</li></ol>' +
    (mensagem ? '<p class="ig-ajuda">Detalhe técnico: ' + escapa(mensagem) + '</p>' : '') + '</div>';
}

async function abaFinanceiro(painel){
  var base = await finCarregarPerfis();
  if(!base.ok){ painel.innerHTML = finHtmlPrecisaDoBanco(base.mensagem); return; }

  var subabas = [
    { chave: "visao", rotulo: "Visão geral" },
    { chave: "lancamentos", rotulo: "Lançamentos" },
    { chave: "contas", rotulo: "Contas do mês" },
    { chave: "importar", rotulo: "Importar" }
  ];
  var anoAtual = +finHojeISO().slice(0, 4);
  var anos = [];
  for(var a = anoAtual - 4; a <= anoAtual + 1; a++) anos.push(String(a));
  if(anos.indexOf(finMes.slice(0, 4)) < 0) anos.push(finMes.slice(0, 4));
  anos.sort();

  var opcoesPerfil = finPerfis.map(function(p){
    return '<option value="' + finAttr(p.id) + '"' + (p.id === finPerfilId ? " selected" : "") + '>' + escapa(p.nome) + '</option>';
  }).join("") + '<option value="__novo__">+ Novo perfil financeiro</option><option value="__gerenciar__">Gerenciar perfis financeiros</option>';
  var opcoesMes = FIN_NOMES_MES.map(function(nome, i){
    return '<option value="' + finDoisDigitos(i + 1) + '"' + (i + 1 === +finMes.slice(5, 7) ? " selected" : "") + '>' + nome + '</option>';
  }).join("");
  var opcoesAno = anos.map(function(ano){ return '<option value="' + ano + '"' + (ano === finMes.slice(0, 4) ? " selected" : "") + '>' + ano + '</option>'; }).join("");

  painel.innerHTML =
    '<div class="fin-topo">' +
      '<div class="fin-titulo"><span class="fin-assina">olá, Lu</span><strong>Meu Dashboard Financeiro</strong></div>' +
      '<div class="fin-acoes-topo">' +
        '<button type="button" class="btn" id="finBtnImportar">' + icone("baixar") + ' Importar extrato ou fatura</button>' +
        '<button type="button" class="btn btn-principal" id="finBtnNovo">' + icone("mais") + ' Novo lançamento</button>' +
      '</div>' +
    '</div>' +
    '<div class="fin-controles">' +
      '<select id="finSelPerfil" class="btn fin-sel" aria-label="Perfil financeiro">' + opcoesPerfil + '</select>' +
      '<div class="fin-mes">' +
        '<button type="button" class="btn btn-icone" id="finMesAnt" aria-label="Mês anterior">&#8249;</button>' +
        (finModo === "mensal" ? '<select id="finSelMes" class="btn fin-sel" aria-label="Mês">' + opcoesMes + '</select>' : '') +
        '<select id="finSelAno" class="btn fin-sel" aria-label="Ano">' + opcoesAno + '</select>' +
        '<button type="button" class="btn btn-icone" id="finMesProx" aria-label="Próximo mês">&#8250;</button>' +
      '</div>' +
      '<div class="chips" id="finChipsModo">' +
        '<button type="button" class="chip ' + (finModo === "mensal" ? "ativo" : "") + '" data-modo="mensal">Mensal</button>' +
        '<button type="button" class="chip ' + (finModo === "anual" ? "ativo" : "") + '" data-modo="anual">Anual</button>' +
      '</div>' +
    '</div>' +
    '<div class="subtabs">' + subabas.map(function(s){
      return '<button type="button" class="subtab-btn ' + (finSubaba === s.chave ? "ativo" : "") + '" data-fin-sub="' + s.chave + '">' + s.rotulo + '</button>';
    }).join("") + '</div>' +
    '<div id="finConteudo"><p class="vazio-explicacao">Carregando...</p></div>';

  painel.querySelectorAll("[data-fin-sub]").forEach(function(b){
    b.addEventListener("click", function(){ finSubaba = b.getAttribute("data-fin-sub"); irParaAba("financeiro"); });
  });
  document.getElementById("finBtnImportar").addEventListener("click", function(){ finSubaba = "importar"; irParaAba("financeiro"); });
  document.getElementById("finBtnNovo").addEventListener("click", function(){ finAbrirFormLancamento(null); });
  document.getElementById("finSelPerfil").addEventListener("change", function(e){
    var v = e.target.value;
    if(v === "__novo__"){ e.target.value = finPerfilId; finAbrirNovoPerfil(); return; }
    if(v === "__gerenciar__"){ e.target.value = finPerfilId; finAbrirGerenciarPerfis(); return; }
    finGuardarPerfil(v);
    irParaAba("financeiro");
  });
  var mudarMes = function(novo){ finMes = novo; irParaAba("financeiro"); };
  document.getElementById("finMesAnt").addEventListener("click", function(){ mudarMes(finSomarMes(finMes, finModo === "anual" ? -12 : -1)); });
  document.getElementById("finMesProx").addEventListener("click", function(){ mudarMes(finSomarMes(finMes, finModo === "anual" ? 12 : 1)); });
  document.getElementById("finSelAno").addEventListener("change", function(e){ mudarMes(e.target.value + "-" + finMes.slice(5, 7)); });
  var selMes = document.getElementById("finSelMes");
  if(selMes) selMes.addEventListener("change", function(e){ mudarMes(finMes.slice(0, 4) + "-" + e.target.value); });
  document.querySelectorAll("#finChipsModo .chip").forEach(function(c){
    c.addEventListener("click", function(){ finModo = c.getAttribute("data-modo"); irParaAba("financeiro"); });
  });

  var area = document.getElementById("finConteudo");
  var carga = await finCarregarLinhas();
  if(!carga.ok){ area.innerHTML = faixaAviso("Não consegui carregar os lançamentos: " + carga.mensagem, "erro"); return; }
  await finCarregarContas();
  if(finSubaba === "lancamentos") finDesenharLancamentos(area);
  else if(finSubaba === "contas") finDesenharContas(area);
  else if(finSubaba === "importar") finDesenharImportar(area);
  else finDesenharVisao(area);
}

/* ============================================================================
   VISÃO GERAL
============================================================================ */
function finCartaoKpi(rotulo, numero, sub, classe){
  return '<div class="fin-kpi ' + (classe || "") + '"><p class="fin-kpi-rotulo">' + rotulo + '</p><p class="fin-kpi-num">' + numero + '</p><div class="fin-kpi-sub">' + sub + '</div></div>';
}

function finDesenharVisao(area){
  var perfil = finPerfilAtual();
  var periodo = finNoPeriodo(finLinhas);
  var anual = finModo === "anual";
  var rotuloPeriodo = anual ? finMes.slice(0, 4) : finNomeMes(finMes);

  var receitas = finSomar(periodo, "receita", true);
  var receitasAbertas = finSomar(periodo, "receita", false);
  var despesas = finSomar(periodo, "despesa", true);
  var despesasAbertas = finSomar(periodo, "despesa", false);
  // contas fixas ainda não pagas também são "a pagar" (só no modo mensal)
  var contasAPagar = 0;
  if(!anual){
    finContas.forEach(function(c){ if(c.ativa && finSituacaoDaConta(c, finMes) !== "pago") contasAPagar += c.valor; });
  }
  var aPagar = despesasAbertas + contasAPagar;
  var lucro = receitas - despesas;
  var saldo = finSaldoAgora(finLinhas, perfil);
  var meta = Number(perfil.meta_mensal || 0) * (anual ? 12 : 1);
  var pctMeta = meta > 0 ? Math.round(receitas / meta * 100) : 0;

  var kpis = '<div class="fin-kpis">' +
    finCartaoKpi("Saldo em conta agora", finMoeda(saldo), "com base nos lançamentos pagos", "saldo") +
    finCartaoKpi("Receitas", finMoeda(receitas), receitasAbertas > 0 ? '<span class="aberto">+ ' + finMoeda(receitasAbertas) + ' a receber</span>' : "Tudo recebido") +
    finCartaoKpi("Despesas", finMoeda(despesas), aPagar > 0 ? '<span class="aberto">+ ' + finMoeda(aPagar) + ' a pagar</span>' : "Tudo pago") +
    finCartaoKpi("Lucro", finMoeda(lucro), lucro >= 0 ? '<span class="positivo">Resultado positivo</span>' : '<span class="negativo">Resultado negativo</span>') +
    finCartaoKpi(anual ? "Meta do ano" : "Meta do mês", meta > 0 ? finMoeda(meta) : "-",
      meta > 0
        ? '<div class="fin-barra-meta"><i style="width:' + Math.min(100, pctMeta) + '%"></i></div><span>' + pctMeta + '% da meta</span>'
        : '<button type="button" class="fin-link" id="finDefinirMeta">Definir minha meta</button>') +
  '</div>';

  var serie = anual
    ? finSerieMeses(finLinhas, finMes.slice(0, 4) + "-12", 12)
    : finSerieMeses(finLinhas, finMes, 12);
  var serieBarras = anual ? serie : serie.slice(-6);

  var graficos = '<div class="fin-duas">' +
    '<div class="painel-branco fin-card"><p class="fin-card-titulo">Receitas x Despesas <span>' + (anual ? "mês a mês" : "últimos 12 meses") + '</span></p>' +
      '<div class="fin-legenda-linhas"><span class="rec">Receitas</span><span class="des">Despesas</span></div>' +
      '<div class="fin-scroll">' + finSvgLinhas(serie) + '</div></div>' +
    '<div class="painel-branco fin-card"><p class="fin-card-titulo">Despesas por categoria <span>' + escapa(rotuloPeriodo) + '</span></p>' +
      finHtmlRosca(finPorCategoria(periodo, "despesa"), "Sem despesas nesse período.") + '</div>' +
    '<div class="painel-branco fin-card"><p class="fin-card-titulo">Comparativo mensal <span>receita, despesa e lucro</span></p>' +
      '<div class="fin-legenda-linhas"><span class="rec">Receitas</span><span class="des">Despesas</span><span class="luc">Lucro</span></div>' +
      '<div class="fin-scroll">' + finSvgBarras(serieBarras) + '</div></div>' +
    '<div class="painel-branco fin-card"><p class="fin-card-titulo">Entradas por categoria <span>' + escapa(rotuloPeriodo) + '</span></p>' +
      finHtmlRosca(finPorCategoria(periodo, "receita"), "Sem receitas nesse período.") + '</div>' +
  '</div>';

  var cartaoContas = "";
  if(!anual){
    var ativas = finContas.filter(function(c){ return c.ativa; });
    cartaoContas = '<div class="painel-branco fin-card"><p class="fin-card-titulo">Contas do mês <span>' + escapa(finNomeMes(finMes)) + '</span></p>' +
      (ativas.length === 0
        ? '<p class="vazio-explicacao">Cadastre suas contas fixas (aluguel, internet, cartão) e acompanhe o que já foi pago.</p>'
        : '<ul class="fin-contas-mini">' + ativas.slice(0, 8).map(function(c){
            var sit = finSituacaoDaConta(c, finMes);
            var pilula = sit === "pago" ? '<span class="pilula fin-pilula-pago">Pago</span>'
              : (sit === "atrasada" ? '<span class="pilula fin-pilula-atrasada">Atrasada</span>' : '<span class="pilula fin-pilula-aberta">Dia ' + c.dia_vencimento + '</span>');
            return '<li><span>' + escapa(c.nome) + '</span>' + pilula + '</li>';
          }).join("") + '</ul>') +
      '<button type="button" class="fin-link" data-fin-ir="contas">Ver e marcar como pagas</button></div>';
  }

  area.innerHTML = kpis + graficos + cartaoContas;
  var botaoMeta = document.getElementById("finDefinirMeta");
  if(botaoMeta) botaoMeta.addEventListener("click", finAbrirGerenciarPerfis);
  area.querySelectorAll("[data-fin-ir]").forEach(function(b){
    b.addEventListener("click", function(){ finSubaba = b.getAttribute("data-fin-ir"); irParaAba("financeiro"); });
  });
}

/* ============================================================================
   LANÇAMENTOS
============================================================================ */
function finPilulaCategoria(categoria){
  var cor = finCor(categoria);
  return '<span class="pilula fin-cat" style="background:' + cor + '26; color:' + finCorTexto(cor) + '"><i style="background:' + cor + '"></i>' + escapa(categoria) + '</span>';
}

// um tom mais fechado da cor, pra o texto ter boa leitura sobre o fundo suave
function finCorTexto(cor){
  var mapa = { "#B5543C": "#7A3A2A", "#8A9A6E": "#4F5E38", "#C98A55": "#7A4A1E", "#8A6F63": "#5E4A44", "#C9807B": "#8A3A36", "#6E7F52": "#4F5E38",
    "#D9B36C": "#6B4E1C", "#9A4430": "#7A3A2A", "#E8B4B0": "#8A3A36", "#5E6E45": "#4F5E38", "#7A6458": "#4A2E26", "#D49A3C": "#6B4E1C",
    "#A08E82": "#5E4A44", "#4A2E26": "#4A2E26", "#CDBFAA": "#5E4A44" };
  return mapa[cor.toUpperCase()] || "#4A2E26";
}

function finFiltrarLinhas(){
  var base = finNoPeriodo(finLinhas);
  var busca = finNormalizar(finFiltro.busca);
  return base.filter(function(l){
    if(finFiltro.tipo === "receita" && l.tipo !== "receita") return false;
    if(finFiltro.tipo === "despesa" && l.tipo !== "despesa") return false;
    if(finFiltro.tipo === "abertos" && l.pago) return false;
    if(finFiltro.categoria && l.categoria !== finFiltro.categoria) return false;
    if(busca && finNormalizar(l.descricao + " " + l.categoria).indexOf(busca) < 0) return false;
    return true;
  });
}

function finDesenharLancamentos(area){
  var periodo = finNoPeriodo(finLinhas);
  var todasCategorias = FIN_CATEGORIAS_DESPESA.concat(FIN_CATEGORIAS_RECEITA.filter(function(c){ return FIN_CATEGORIAS_DESPESA.indexOf(c) < 0; }));
  // categorias antigas que ainda estão em lançamentos (ex: "Mercado", que virou "Internet") continuam no filtro
  finLinhas.forEach(function(l){ if(todasCategorias.indexOf(l.categoria) < 0) todasCategorias.push(l.categoria); });
  var chips = [{ v: "todos", r: "Todos" }, { v: "receita", r: "Entradas" }, { v: "despesa", r: "Saídas" }, { v: "abertos", r: "A pagar ou receber" }];

  area.innerHTML =
    '<div class="grade-cartoes">' +
      '<div class="cartao"><div class="numero">' + periodo.length + '</div><div class="rotulo">lançamentos no período</div></div>' +
      '<div class="cartao"><div class="numero" style="font-size:1.15rem">' + finMoeda(finSomar(periodo, "receita", true)) + '</div><div class="rotulo">entradas pagas</div></div>' +
      '<div class="cartao"><div class="numero" style="font-size:1.15rem">' + finMoeda(finSomar(periodo, "despesa", true)) + '</div><div class="rotulo">saídas pagas</div></div>' +
    '</div>' +
    '<div class="barra-acoes">' +
      '<div class="campo-busca">' + icone("busca") + '<input id="finBusca" placeholder="Buscar descrição ou categoria" value="' + finAttr(finFiltro.busca) + '"></div>' +
      '<div class="chips" id="finChipsTipo">' + chips.map(function(c){
        return '<button type="button" class="chip ' + (finFiltro.tipo === c.v ? "ativo" : "") + '" data-tipo="' + c.v + '">' + c.r + '</button>';
      }).join("") + '</div>' +
      '<select class="btn fin-sel" id="finSelCategoria" aria-label="Categoria"><option value="">Todas as categorias</option>' + finOpcoes(todasCategorias, finFiltro.categoria) + '</select>' +
      '<button type="button" class="btn" id="finBtnCsv">' + icone("baixar") + ' Baixar CSV</button>' +
    '</div>' +
    '<div class="painel-branco"><div class="tabela-scroll" id="finTabela"></div></div>';

  document.getElementById("finBusca").addEventListener("input", function(e){ finFiltro.busca = e.target.value; finFiltro.limite = 150; finDesenharTabela(); });
  document.getElementById("finSelCategoria").addEventListener("change", function(e){ finFiltro.categoria = e.target.value; finFiltro.limite = 150; finDesenharTabela(); });
  document.querySelectorAll("#finChipsTipo .chip").forEach(function(c){
    c.addEventListener("click", function(){
      finFiltro.tipo = c.getAttribute("data-tipo"); finFiltro.limite = 150;
      document.querySelectorAll("#finChipsTipo .chip").forEach(function(o){ o.classList.toggle("ativo", o === c); });
      finDesenharTabela();
    });
  });
  document.getElementById("finBtnCsv").addEventListener("click", function(){
    baixarCSV("financeiro-" + finMes + ".csv", ["Data", "Descrição", "Categoria", "Tipo", "Valor", "Situação", "Parcela"],
      finFiltrarLinhas().map(function(l){
        return [formatarData(l.data), l.descricao, l.categoria, l.tipo === "receita" ? "Entrada" : "Saída", l.valor.toFixed(2).replace(".", ","), l.pago ? "Pago" : "Em aberto", l.parcela || ""];
      }));
  });
  finDesenharTabela();
}

function finDesenharTabela(){
  var alvo = document.getElementById("finTabela");
  if(!alvo) return;
  var todas = finFiltrarLinhas();
  if(finLinhas.length === 0){
    alvo.innerHTML = '<div class="vazio-explicacao">Você ainda não tem lançamentos. Clique em "Novo lançamento" ou em "Importar extrato ou fatura".</div>';
    return;
  }
  if(todas.length === 0){
    alvo.innerHTML = '<div class="vazio-explicacao">Nenhum lançamento nesse período com esse filtro.</div>';
    return;
  }
  var linhas = todas.slice(0, finFiltro.limite);
  alvo.innerHTML = '<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
    linhas.map(function(l){
      var sinal = l.tipo === "receita" ? "+" : "-";
      return '<tr data-id="' + finAttr(l.id) + '">' +
        '<td>' + finDataCurta(l.data) + '</td>' +
        '<td>' + escapa(l.descricao || "(sem descrição)") + (l.parcela ? ' <span class="etiqueta fin-parcela">parcela ' + escapa(l.parcela) + '</span>' : "") + '</td>' +
        '<td>' + finPilulaCategoria(l.categoria) + '</td>' +
        '<td style="text-align:right; white-space:nowrap;"><strong class="' + (l.tipo === "receita" ? "fin-entrada" : "fin-saida") + '">' + sinal + ' ' + finMoeda(l.valor) + '</strong></td>' +
        '<td><button type="button" class="pilula fin-situacao ' + (l.pago ? "fin-pilula-pago" : "fin-pilula-aberta") + '" data-alternar="' + finAttr(l.id) + '" title="Clique pra trocar">' +
          (l.pago ? (l.tipo === "receita" ? "Recebido" : "Pago") : (l.tipo === "receita" ? "A receber" : "A pagar")) + '</button></td>' +
        '<td><div class="acoes-linha"><button type="button" class="btn btn-icone" data-editar="' + finAttr(l.id) + '" aria-label="Editar">' + icone("editar") + '</button>' +
        '<button type="button" class="btn btn-icone btn-perigo" data-apagar="' + finAttr(l.id) + '" aria-label="Apagar">' + icone("lixeira") + '</button></div></td></tr>';
    }).join("") + '</tbody></table>' +
    (todas.length > linhas.length ? '<p style="text-align:center; margin-top:12px;"><button type="button" class="btn" id="finMaisLinhas">Mostrar mais (' + (todas.length - linhas.length) + ' restantes)</button></p>' : "");

  var achar = function(id){ return finLinhas.filter(function(l){ return l.id === id; })[0]; };
  alvo.querySelectorAll("[data-editar]").forEach(function(b){ b.addEventListener("click", function(){ finAbrirFormLancamento(achar(b.getAttribute("data-editar"))); }); });
  alvo.querySelectorAll("[data-apagar]").forEach(function(b){
    b.addEventListener("click", async function(){
      var l = achar(b.getAttribute("data-apagar"));
      if(!window.confirm('Apagar "' + (l.descricao || "este lançamento") + '" (' + finMoeda(l.valor) + ')?')) return;
      var r = await buscarSeguro(banco.from("fin_lancamentos").delete().eq("id", l.id));
      if(!r.ok){ alert("Não consegui apagar: " + r.mensagem); return; }
      finLinhas = null; irParaAba("financeiro");
    });
  });
  alvo.querySelectorAll("[data-alternar]").forEach(function(b){
    b.addEventListener("click", async function(){
      var l = achar(b.getAttribute("data-alternar"));
      var r = await buscarSeguro(banco.from("fin_lancamentos").update({ pago: !l.pago }).eq("id", l.id));
      if(!r.ok){ alert("Não consegui atualizar: " + r.mensagem); return; }
      finLinhas = null; irParaAba("financeiro");
    });
  });
  var mais = document.getElementById("finMaisLinhas");
  if(mais) mais.addEventListener("click", function(){ finFiltro.limite += 150; finDesenharTabela(); });
}

function finAbrirFormLancamento(lanc){
  var editando = !!lanc;
  var tipoInicial = editando ? lanc.tipo : "despesa";
  var hoje = finHojeISO();
  var dataInicial = editando ? lanc.data : (finMes === hoje.slice(0, 7) || finModo === "anual" ? hoje : finMes + "-01");
  abrirModal(
    '<p class="form-titulo">' + (editando ? "Editar lançamento" : "Novo lançamento") + '</p>' +
    '<form id="finForm">' +
      '<div class="chips fin-tipo-chips" id="finChipsTipoForm">' +
        '<button type="button" class="chip ' + (tipoInicial === "despesa" ? "ativo" : "") + '" data-tipo-form="despesa">Saída</button>' +
        '<button type="button" class="chip ' + (tipoInicial === "receita" ? "ativo" : "") + '" data-tipo-form="receita">Entrada</button>' +
      '</div>' +
      '<div class="campo"><label>Descrição</label><input id="finFDesc" required value="' + (editando ? finAttr(lanc.descricao) : "") + '" placeholder="Ex: Supermercado, Publi Marca X"></div>' +
      '<div class="form-linha">' +
        '<div class="campo"><label>Valor (R$)</label><input id="finFValor" required inputmode="decimal" value="' + (editando ? String(lanc.valor.toFixed(2)).replace(".", ",") : "") + '" placeholder="0,00"></div>' +
        '<div class="campo"><label>Data</label><input type="date" id="finFData" required value="' + dataInicial + '"></div>' +
      '</div>' +
      '<div class="form-linha">' +
        '<div class="campo"><label>Categoria</label><select id="finFCat"></select></div>' +
        '<div class="campo"><label>Parcela (opcional)</label><input id="finFParcela" placeholder="Ex: 2/6" value="' + (editando && lanc.parcela ? finAttr(lanc.parcela) : "") + '"></div>' +
      '</div>' +
      '<div class="campo campo-check"><input type="checkbox" id="finFPago" ' + (!editando || lanc.pago ? "checked" : "") + '><label for="finFPago" id="finFPagoRotulo">Já foi pago</label></div>' +
      '<div class="form-acoes">' +
        (editando ? '<button type="button" class="btn btn-perigo" id="finFApagar">Apagar</button>' : '<span></span>') +
        '<button type="submit" class="btn btn-principal">Salvar</button>' +
      '</div>' +
      '<p class="aviso erro oculto" id="finFErro"></p>' +
    '</form>', true);

  var tipo = tipoInicial;
  var catAtual = editando ? lanc.categoria : null;
  var redesenhar = function(){
    var lista = tipo === "receita" ? FIN_CATEGORIAS_RECEITA : FIN_CATEGORIAS_DESPESA;
    // uma categoria antiga que não está mais na lista continua aparecendo, pra não se perder ao editar
    if(catAtual && lista.indexOf(catAtual) < 0) lista = lista.concat([catAtual]);
    var escolha = catAtual || lista[0];
    document.getElementById("finFCat").innerHTML = finOpcoes(lista, escolha);
    document.getElementById("finFPagoRotulo").textContent = tipo === "receita" ? "Já recebi" : "Já foi pago";
  };
  redesenhar();
  document.querySelectorAll("#finChipsTipoForm .chip").forEach(function(c){
    c.addEventListener("click", function(){
      tipo = c.getAttribute("data-tipo-form");
      catAtual = null;
      document.querySelectorAll("#finChipsTipoForm .chip").forEach(function(o){ o.classList.toggle("ativo", o === c); });
      redesenhar();
    });
  });
  // ao digitar a descrição, sugere a categoria (só em lançamento novo)
  if(!editando){
    document.getElementById("finFDesc").addEventListener("blur", function(e){
      var sug = finCategorizar(e.target.value, tipo);
      var sel = document.getElementById("finFCat");
      if(sel.selectedIndex === 0 || sel.value === "Outros") sel.value = sug;
    });
  }
  if(editando){
    document.getElementById("finFApagar").addEventListener("click", async function(){
      if(!window.confirm("Apagar este lançamento?")) return;
      await buscarSeguro(banco.from("fin_lancamentos").delete().eq("id", lanc.id));
      fecharModal(); finLinhas = null; irParaAba("financeiro");
    });
  }
  document.getElementById("finForm").addEventListener("submit", async function(e){
    e.preventDefault();
    var erro = document.getElementById("finFErro");
    var valor = finParseValor(document.getElementById("finFValor").value);
    if(isNaN(valor) || valor <= 0){ erro.textContent = "Digite um valor maior que zero. Ex: 230,40"; erro.classList.remove("oculto"); return; }
    var dados = {
      perfil_id: finPerfilId,
      tipo: tipo,
      descricao: document.getElementById("finFDesc").value.trim(),
      valor: Math.abs(valor),
      data: document.getElementById("finFData").value,
      categoria: document.getElementById("finFCat").value,
      parcela: document.getElementById("finFParcela").value.trim() || null,
      pago: document.getElementById("finFPago").checked
    };
    var r = editando
      ? await buscarSeguro(banco.from("fin_lancamentos").update(dados).eq("id", lanc.id))
      : await buscarSeguro(banco.from("fin_lancamentos").insert(dados));
    if(!r.ok){ erro.textContent = "Não consegui salvar: " + r.mensagem; erro.classList.remove("oculto"); return; }
    fecharModal();
    if(!editando) finMes = dados.data.slice(0, 7);
    finLinhas = null;
    finSubaba = "lancamentos";
    irParaAba("financeiro");
  });
}

/* ============================================================================
   CONTAS DO MÊS
============================================================================ */
function finDesenharContas(area){
  if(finModo === "anual"){
    area.innerHTML = '<div class="painel-branco"><p style="font-size:.84rem;">As contas do mês são vistas mês a mês. Troque "Anual" por "Mensal" lá em cima.</p></div>';
    return;
  }
  var ativas = finContas.filter(function(c){ return c.ativa; });
  var pagas = 0, abertas = 0;
  ativas.forEach(function(c){ if(finSituacaoDaConta(c, finMes) === "pago") pagas += c.valor; else abertas += c.valor; });

  area.innerHTML =
    '<div class="grade-cartoes">' +
      '<div class="cartao"><div class="numero" style="font-size:1.15rem">' + finMoeda(abertas) + '</div><div class="rotulo">ainda a pagar em ' + escapa(finNomeMes(finMes)) + '</div></div>' +
      '<div class="cartao"><div class="numero" style="font-size:1.15rem">' + finMoeda(pagas) + '</div><div class="rotulo">já pago</div></div>' +
    '</div>' +
    '<div class="barra-acoes"><button type="button" class="btn btn-principal" id="finNovaConta">' + icone("mais") + ' Nova conta fixa</button>' +
      '<span class="ig-ajuda" style="margin:0;">Conta fixa é a que se repete todo mês: aluguel, internet, mensalidades.</span></div>' +
    '<div class="painel-branco" id="finListaContas"></div>';
  document.getElementById("finNovaConta").addEventListener("click", function(){ finAbrirFormConta(null); });

  var alvo = document.getElementById("finListaContas");
  if(finContas.length === 0){
    alvo.innerHTML = '<div class="vazio-explicacao">Você ainda não cadastrou contas fixas. Clique em "Nova conta fixa".</div>';
    return;
  }
  alvo.innerHTML = '<table><thead><tr><th>Conta</th><th>Vencimento</th><th>Categoria</th><th style="text-align:right">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
    finContas.map(function(c){
      var sit = c.ativa ? finSituacaoDaConta(c, finMes) : "pausada";
      var pilula = sit === "pago" ? '<span class="pilula fin-pilula-pago">Pago</span>'
        : (sit === "atrasada" ? '<span class="pilula fin-pilula-atrasada">Atrasada</span>'
        : (sit === "pausada" ? '<span class="pilula fin-pilula-neutra">Pausada</span>' : '<span class="pilula fin-pilula-aberta">Em aberto</span>'));
      var botao = !c.ativa ? "" : (sit === "pago"
        ? '<button type="button" class="btn btn-pequeno" data-desfazer="' + finAttr(c.id) + '">Desfazer</button>'
        : '<button type="button" class="btn btn-pequeno btn-principal" data-pagar="' + finAttr(c.id) + '">Marcar como paga</button>');
      return '<tr><td><strong>' + escapa(c.nome) + '</strong></td><td>dia ' + c.dia_vencimento + '</td><td>' + finPilulaCategoria(c.categoria) + '</td>' +
        '<td style="text-align:right; white-space:nowrap;">' + finMoeda(c.valor) + '</td><td>' + pilula + '</td>' +
        '<td><div class="acoes-linha">' + botao + '<button type="button" class="btn btn-icone" data-editar-conta="' + finAttr(c.id) + '" aria-label="Editar">' + icone("editar") + '</button></div></td></tr>';
    }).join("") + '</tbody></table>';

  var achar = function(id){ return finContas.filter(function(c){ return c.id === id; })[0]; };
  alvo.querySelectorAll("[data-editar-conta]").forEach(function(b){ b.addEventListener("click", function(){ finAbrirFormConta(achar(b.getAttribute("data-editar-conta"))); }); });
  alvo.querySelectorAll("[data-pagar]").forEach(function(b){
    b.addEventListener("click", async function(){
      var c = achar(b.getAttribute("data-pagar"));
      var hoje = finHojeISO();
      var data = finMes === hoje.slice(0, 7) ? hoje : finVencimentoDaConta(c, finMes);
      var existente = finLancamentoDaConta(c, finMes);
      var r = existente
        ? await buscarSeguro(banco.from("fin_lancamentos").update({ pago: true, data: data }).eq("id", existente.id))
        : await buscarSeguro(banco.from("fin_lancamentos").insert({
            perfil_id: finPerfilId, conta_id: c.id, data: data, descricao: c.nome, valor: c.valor, tipo: "despesa",
            categoria: c.categoria, pago: true, origem: "manual"
          }));
      if(!r.ok){ alert("Não consegui marcar como paga: " + r.mensagem); return; }
      finLinhas = null; irParaAba("financeiro");
    });
  });
  alvo.querySelectorAll("[data-desfazer]").forEach(function(b){
    b.addEventListener("click", async function(){
      var c = achar(b.getAttribute("data-desfazer"));
      var existente = finLancamentoDaConta(c, finMes);
      if(existente) await buscarSeguro(banco.from("fin_lancamentos").delete().eq("id", existente.id));
      finLinhas = null; irParaAba("financeiro");
    });
  });
}

function finAbrirFormConta(conta){
  var editando = !!conta;
  abrirModal(
    '<p class="form-titulo">' + (editando ? "Editar conta fixa" : "Nova conta fixa") + '</p>' +
    '<form id="finFormConta">' +
      '<div class="campo"><label>Nome da conta</label><input id="finCNome" required value="' + (editando ? finAttr(conta.nome) : "") + '" placeholder="Ex: Aluguel, Internet, Cartão"></div>' +
      '<div class="form-linha">' +
        '<div class="campo"><label>Valor (R$)</label><input id="finCValor" required inputmode="decimal" value="' + (editando ? String(conta.valor.toFixed(2)).replace(".", ",") : "") + '" placeholder="0,00"></div>' +
        '<div class="campo"><label>Vence todo dia</label><input type="number" min="1" max="31" id="finCDia" required value="' + (editando ? conta.dia_vencimento : 10) + '"></div>' +
      '</div>' +
      '<div class="campo"><label>Categoria</label><select id="finCCat">' + finOpcoes(FIN_CATEGORIAS_DESPESA, editando ? conta.categoria : "Casa") + '</select></div>' +
      '<div class="campo campo-check"><input type="checkbox" id="finCAtiva" ' + (!editando || conta.ativa ? "checked" : "") + '><label for="finCAtiva">Conta ativa (desmarque pra pausar)</label></div>' +
      '<div class="form-acoes">' + (editando ? '<button type="button" class="btn btn-perigo" id="finCApagar">Apagar</button>' : '<span></span>') +
      '<button type="submit" class="btn btn-principal">Salvar</button></div>' +
      '<p class="aviso erro oculto" id="finCErro"></p>' +
    '</form>', true);
  // numa conta nova, o nome sugere a categoria (ex: "Internet" ou "Claro" -> Internet)
  if(!editando){
    document.getElementById("finCNome").addEventListener("blur", function(e){
      var sugestao = finCategorizar(e.target.value, "despesa");
      var sel = document.getElementById("finCCat");
      if(sugestao !== "Outros" && sel.value === "Casa") sel.value = sugestao;
    });
  }
  if(editando){
    document.getElementById("finCApagar").addEventListener("click", async function(){
      if(!window.confirm('Apagar a conta "' + conta.nome + '"? Os pagamentos que você já marcou continuam nos lançamentos.')) return;
      await buscarSeguro(banco.from("fin_contas").delete().eq("id", conta.id));
      fecharModal(); irParaAba("financeiro");
    });
  }
  document.getElementById("finFormConta").addEventListener("submit", async function(e){
    e.preventDefault();
    var erro = document.getElementById("finCErro");
    var valor = finParseValor(document.getElementById("finCValor").value);
    if(isNaN(valor) || valor < 0){ erro.textContent = "Digite o valor da conta. Ex: 1800,00"; erro.classList.remove("oculto"); return; }
    var dados = {
      perfil_id: finPerfilId,
      nome: document.getElementById("finCNome").value.trim(),
      valor: Math.abs(valor),
      dia_vencimento: Math.max(1, Math.min(31, Number(document.getElementById("finCDia").value || 1))),
      categoria: document.getElementById("finCCat").value,
      ativa: document.getElementById("finCAtiva").checked
    };
    var r = editando
      ? await buscarSeguro(banco.from("fin_contas").update(dados).eq("id", conta.id))
      : await buscarSeguro(banco.from("fin_contas").insert(dados));
    if(!r.ok){ erro.textContent = "Não consegui salvar: " + r.mensagem; erro.classList.remove("oculto"); return; }
    fecharModal(); finSubaba = "contas"; irParaAba("financeiro");
  });
}

/* ============================================================================
   PERFIS FINANCEIROS (Pessoal, Profissional...)
============================================================================ */
function finAbrirNovoPerfil(){
  abrirModal(
    '<p class="form-titulo">Novo perfil financeiro</p>' +
    '<p style="font-size:.82rem; margin-bottom:12px;">Cada perfil tem os seus próprios lançamentos, contas e meta. Serve pra separar a vida pessoal do negócio.</p>' +
    '<form id="finFormPerfil"><div class="campo"><label>Nome do perfil</label><input id="finPNome" required placeholder="Ex: Casa, Empresa, Viagem"></div>' +
    '<div class="form-acoes"><span></span><button type="submit" class="btn btn-principal">Criar</button></div><p class="aviso erro oculto" id="finPErro"></p></form>');
  document.getElementById("finFormPerfil").addEventListener("submit", async function(e){
    e.preventDefault();
    var nome = document.getElementById("finPNome").value.trim();
    var r = await buscarSeguro(banco.from("fin_perfis").insert({ nome: nome, ordem: finPerfis.length + 1 }));
    if(!r.ok){ var er = document.getElementById("finPErro"); er.textContent = "Não consegui criar: " + r.mensagem; er.classList.remove("oculto"); return; }
    var lista = await buscarSeguro(banco.from("fin_perfis").select("*").order("ordem"));
    var novo = lista.ok ? lista.dados.filter(function(p){ return p.nome === nome; }).pop() : null;
    fecharModal();
    if(novo) finGuardarPerfil(novo.id);
    irParaAba("financeiro");
  });
}

function finAbrirGerenciarPerfis(){
  var linhas = finPerfis.map(function(p){
    return '<div class="fin-perfil-form" data-perfil="' + finAttr(p.id) + '">' +
      '<div class="campo"><label>Nome</label><input data-campo="nome" value="' + finAttr(p.nome) + '"></div>' +
      '<div class="form-linha">' +
        '<div class="campo"><label>Saldo inicial (R$)</label><input data-campo="saldo_inicial" inputmode="decimal" value="' + String(Number(p.saldo_inicial).toFixed(2)).replace(".", ",") + '"></div>' +
        '<div class="campo"><label>Meta de receita por mês (R$)</label><input data-campo="meta_mensal" inputmode="decimal" value="' + String(Number(p.meta_mensal).toFixed(2)).replace(".", ",") + '"></div>' +
      '</div>' +
      (finPerfis.length > 1 ? '<button type="button" class="btn btn-pequeno btn-perigo" data-apagar-perfil="' + finAttr(p.id) + '">Apagar este perfil</button>' : "") +
    '</div>';
  }).join("");
  abrirModal(
    '<p class="form-titulo">Gerenciar perfis financeiros</p>' +
    '<p class="ig-ajuda" style="margin:0 0 12px;">Saldo inicial é quanto você tinha na conta ANTES do primeiro lançamento que você registrar aqui. O "saldo em conta agora" soma os lançamentos pagos em cima dele.</p>' +
    '<form id="finFormGerenciar">' + linhas +
      '<div class="form-acoes"><span></span><button type="submit" class="btn btn-principal">Salvar</button></div>' +
      '<p class="aviso erro oculto" id="finGErro"></p></form>', true);

  document.querySelectorAll("[data-apagar-perfil]").forEach(function(b){
    b.addEventListener("click", async function(){
      var id = b.getAttribute("data-apagar-perfil");
      var p = finPerfis.filter(function(x){ return x.id === id; })[0];
      if(!window.confirm('Apagar o perfil "' + p.nome + '" e TODOS os lançamentos e contas dele? Isso não dá pra desfazer.')) return;
      var r = await buscarSeguro(banco.from("fin_perfis").delete().eq("id", id));
      if(!r.ok){ alert("Não consegui apagar: " + r.mensagem); return; }
      if(finPerfilId === id) finPerfilId = null;
      finLinhas = null; fecharModal(); irParaAba("financeiro");
    });
  });
  document.getElementById("finFormGerenciar").addEventListener("submit", async function(e){
    e.preventDefault();
    var erro = document.getElementById("finGErro");
    var forms = document.querySelectorAll("[data-perfil]");
    for(var i = 0; i < forms.length; i++){
      var f = forms[i];
      var pegar = function(campo){ return f.querySelector('[data-campo="' + campo + '"]').value; };
      var saldo = finParseValor(pegar("saldo_inicial") || "0"), meta = finParseValor(pegar("meta_mensal") || "0");
      if(isNaN(saldo) || isNaN(meta)){ erro.textContent = "Confira os valores: use só números, como 1500,00."; erro.classList.remove("oculto"); return; }
      var r = await buscarSeguro(banco.from("fin_perfis").update({ nome: pegar("nome").trim() || "Perfil", saldo_inicial: saldo, meta_mensal: Math.max(0, meta) }).eq("id", f.getAttribute("data-perfil")));
      if(!r.ok){ erro.textContent = "Não consegui salvar: " + r.mensagem; erro.classList.remove("oculto"); return; }
    }
    fecharModal(); irParaAba("financeiro");
  });
}

/* ============================================================================
   IMPORTAR EXTRATO OU FATURA (com revisão antes de salvar)
============================================================================ */
function finDesenharImportar(area){
  if(finImp){ finDesenharRevisao(area); return; }
  // importações já feitas (pra poder desfazer uma inteira)
  var lotes = {};
  finLinhas.forEach(function(l){
    if(!l.lote) return;
    if(!lotes[l.lote]) lotes[l.lote] = { lote: l.lote, arquivo: l.arquivo, origem: l.origem, qtd: 0 };
    lotes[l.lote].qtd++;
  });
  var lista = Object.keys(lotes).map(function(k){ return lotes[k]; }).sort(function(a, b){ return a.lote < b.lote ? 1 : -1; }).slice(0, 8);

  area.innerHTML =
    '<div class="fin-importar-intro"><h2>Chega de lançar <em>gasto por gasto.</em></h2>' +
    '<p>Importe o extrato ou a fatura e só revise. Em menos de 1 minuto, o mês inteiro está organizado.</p></div>' +
    '<div class="fin-escolhas">' +
      '<button type="button" class="fin-escolha" data-importar="extrato"><span class="fin-escolha-icone">' + icone("banco") + '</span><span><strong>Extrato bancário</strong>' +
        '<small>Suba o extrato e o painel organiza tudo por categoria. Você só confere e confirma.</small></span></button>' +
      '<button type="button" class="fin-escolha" data-importar="fatura"><span class="fin-escolha-icone">' + icone("cartao") + '</span><span><strong>Fatura do cartão</strong>' +
        '<small>A fatura fechou? Importe e cada compra é categorizada, parcelas incluídas.</small></span></button>' +
    '</div>' +
    '<p class="fin-formatos">Funciona com <strong>PDF</strong>, <strong>CSV</strong> e <strong>OFX</strong> (o arquivo que o app do seu banco deixa baixar). Se o PDF for uma foto (escaneado), use o CSV ou o OFX.</p>' +
    '<div class="fin-nota-segura">' + icone("cadeado") +
      '<span>Você mesma importa o arquivo. Nunca pedimos login, senha ou acesso ao seu banco. O arquivo é lido aqui no seu navegador, e só o que você confirmar vai pro seu banco de dados.</span></div>' +
    (lista.length ? '<div class="painel-branco" style="margin-top:18px;"><p class="painel-titulo">Importações recentes</p><table><tbody>' + lista.map(function(l){
      return '<tr><td>' + escapa(l.arquivo || "arquivo") + '</td><td>' + (l.origem === "fatura" ? "Fatura" : "Extrato") + '</td><td>' + l.qtd + ' lançamentos</td>' +
        '<td style="text-align:right;"><button type="button" class="btn btn-pequeno btn-perigo" data-desfazer-lote="' + finAttr(l.lote) + '">Desfazer esta importação</button></td></tr>';
    }).join("") + '</tbody></table></div>' : "");

  area.querySelectorAll("[data-importar]").forEach(function(b){
    b.addEventListener("click", function(){ finEscolherArquivo(b.getAttribute("data-importar")); });
  });
  area.querySelectorAll("[data-desfazer-lote]").forEach(function(b){
    b.addEventListener("click", async function(){
      if(!window.confirm("Apagar todos os lançamentos dessa importação? Os que você lançou à mão não são afetados.")) return;
      var r = await buscarSeguro(banco.from("fin_lancamentos").delete().eq("lote", b.getAttribute("data-desfazer-lote")).eq("perfil_id", finPerfilId));
      if(!r.ok){ alert("Não consegui desfazer: " + r.mensagem); return; }
      finLinhas = null; irParaAba("financeiro");
    });
  });
}

function finEscolherArquivo(tipo){
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.csv,.ofx,.txt,application/pdf,text/csv";
  input.addEventListener("change", function(){
    if(input.files && input.files[0]) finLerArquivoEscolhido(input.files[0], tipo);
  });
  input.click();
}

async function finTextoDoArquivo(arquivo){
  var buffer = await arquivo.arrayBuffer();
  try{ return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch(erro){ return new TextDecoder("windows-1252").decode(buffer); }   // extratos antigos vêm em ISO-8859-1
}

var FIN_PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
var FIN_PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

function finGarantirPdfJs(){
  return new Promise(function(resolve, reject){
    if(window.pdfjsLib){ resolve(window.pdfjsLib); return; }
    var s = document.createElement("script");
    s.src = FIN_PDFJS;
    s.onload = function(){
      if(!window.pdfjsLib){ reject(new Error("o leitor de PDF não carregou")); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = FIN_PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };
    s.onerror = function(){ reject(new Error("não consegui baixar o leitor de PDF (confira a internet)")); };
    document.head.appendChild(s);
  });
}

// Lê o PDF e devolve as linhas de texto (agrupando pelo lugar da página).
async function finLinhasDoPDF(arquivo, aoProgredir){
  var pdfjs = await finGarantirPdfJs();
  var doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  var linhas = [];
  for(var n = 1; n <= doc.numPages; n++){
    var pagina = await doc.getPage(n);
    var conteudo = await pagina.getTextContent();
    var porY = [];
    conteudo.items.forEach(function(it){
      if(!it.str || !it.str.trim()) return;
      var y = Math.round(it.transform[5]);
      var grupo = null;
      for(var i = 0; i < porY.length; i++){ if(Math.abs(porY[i].y - y) <= 3){ grupo = porY[i]; break; } }
      if(!grupo){ grupo = { y: y, itens: [] }; porY.push(grupo); }
      grupo.itens.push({ x: it.transform[4], largura: it.width || 0, altura: it.height || 8, texto: it.str });
    });
    porY.sort(function(a, b){ return b.y - a.y; });
    porY.forEach(function(g){
      g.itens.sort(function(a, b){ return a.x - b.x; });
      // Alguns PDFs cortam uma palavra no meio ("P" + "ARCELA"): só põe espaço entre dois pedaços
      // quando existe um vão de verdade entre eles.
      var texto = "", fimAnterior = null;
      g.itens.forEach(function(i){
        if(fimAnterior !== null && i.x - fimAnterior > Math.max(1, i.altura * 0.15) && !/\s$/.test(texto) && !/^\s/.test(i.texto)) texto += " ";
        texto += i.texto;
        fimAnterior = i.x + i.largura;
      });
      linhas.push(texto);
    });
    if(aoProgredir) aoProgredir(n / doc.numPages);
  }
  return linhas;
}

async function finLerArquivoEscolhido(arquivo, tipo){
  var area = document.getElementById("finConteudo");
  if(!area) return;
  finImp = { tipo: tipo, arquivo: arquivo.name, itens: [], lendo: true, progresso: 0.08, erro: null };
  finDesenharRevisao(area);
  var barra = function(p){
    finImp.progresso = p;
    var el2 = document.getElementById("finBarraLeitura");
    if(el2) el2.style.width = Math.round(p * 100) + "%";
  };
  try{
    var resultado;
    if(/\.pdf$/i.test(arquivo.name) || arquivo.type === "application/pdf"){
      var linhas = await finLinhasDoPDF(arquivo, function(p){ barra(0.1 + p * 0.8); });
      resultado = finLerLinhasPDF(linhas, tipo);
    } else {
      barra(0.4);
      resultado = finLerTexto(await finTextoDoArquivo(arquivo), arquivo.name, tipo);
    }
    barra(1);
    finImp.itens = resultado.itens;
    finImp.erro = resultado.erro;
  }catch(erro){
    console.error(erro);
    finImp.erro = "Não consegui ler esse arquivo: " + (erro && erro.message ? erro.message : "erro desconhecido") + ".";
  }
  // marca o que já foi importado antes (mesma chave) pra não duplicar
  var existentes = {};
  finLinhas.forEach(function(l){ if(l.chave) existentes[l.chave] = true; });
  finImp.itens.forEach(function(it, i){
    it.id = i;
    if(existentes[it.chave]){ it.duplicada = true; it.marcada = false; }
  });
  finImp.lendo = false;
  var alvo = document.getElementById("finConteudo");
  if(alvo && finImp) finDesenharRevisao(alvo);
}

function finResumoRevisao(){
  var marcadas = finImp.itens.filter(function(i){ return i.marcada; });
  var entra = 0, sai = 0;
  marcadas.forEach(function(i){ if(i.tipo === "receita") entra += i.valor; else sai += i.valor; });
  return { qtd: marcadas.length, entra: entra, sai: sai };
}

function finDesenharRevisao(area){
  var imp = finImp;
  if(!imp){ finDesenharImportar(area); return; }
  var cabecalho = '<div class="fin-rev-topo"><h3>Revisar lançamentos</h3><span class="fin-rev-arquivo">' + escapa(imp.arquivo) + '</span></div>';

  if(imp.lendo){
    area.innerHTML = '<div class="painel-branco fin-revisao">' + cabecalho +
      '<div class="fin-lendo"><span>' + icone("roteiros") + '</span><strong>Lendo ' + (imp.tipo === "fatura" ? "a fatura" : "o extrato") + '</strong>' +
      '<div class="fin-lendo-barra"><i id="finBarraLeitura" style="width:' + Math.round(imp.progresso * 100) + '%"></i></div></div></div>';
    return;
  }
  if(imp.erro && imp.itens.length === 0){
    area.innerHTML = '<div class="painel-branco fin-revisao">' + cabecalho + faixaAviso(imp.erro, "erro") +
      '<div class="form-acoes"><button type="button" class="btn" id="finRevVoltar">Escolher outro arquivo</button><span></span></div></div>';
    document.getElementById("finRevVoltar").addEventListener("click", function(){ finImp = null; finDesenharImportar(area); });
    return;
  }

  var perfil = finPerfilAtual();
  var resumo = finResumoRevisao();
  var duplicadas = imp.itens.filter(function(i){ return i.duplicada; }).length;
  area.innerHTML = '<div class="painel-branco fin-revisao">' + cabecalho +
    '<p class="ig-ajuda" style="margin:0 0 10px;">Perfil: <strong>' + escapa(perfil.nome) + '</strong>. Desmarque o que não quiser, troque a categoria e, se uma entrada estiver como saída (ou o contrário), clique na etiqueta Entrada/Saída.' +
    (duplicadas ? ' <strong>' + duplicadas + ' já foram importados antes</strong> e vieram desmarcados.' : '') + '</p>' +
    '<div class="barra-acoes"><button type="button" class="btn btn-pequeno" id="finRevTodas">Marcar todas</button><button type="button" class="btn btn-pequeno" id="finRevNenhuma">Desmarcar todas</button>' +
      '<button type="button" class="btn btn-pequeno" id="finRevInverter">Trocar entradas por saídas</button></div>' +
    '<div class="tabela-scroll"><table class="fin-rev-tabela"><thead><tr><th></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th style="text-align:right">Valor</th></tr></thead><tbody>' +
    imp.itens.map(function(i){
      var lista = i.tipo === "receita" ? FIN_CATEGORIAS_RECEITA : FIN_CATEGORIAS_DESPESA;
      return '<tr class="' + (i.marcada ? "" : "fin-rev-off") + '" data-i="' + i.id + '">' +
        '<td><input type="checkbox" data-marcar="' + i.id + '" ' + (i.marcada ? "checked" : "") + ' aria-label="Importar este lançamento"></td>' +
        '<td>' + finDataCurta(i.data) + '</td>' +
        '<td>' + escapa(i.descricao) + (i.parcela ? ' <span class="etiqueta fin-parcela">parcela ' + escapa(i.parcela) + '</span>' : "") +
          (i.duplicada ? ' <span class="etiqueta fin-dup">já importado</span>' : "") +
          (i.aviso ? '<div class="ig-ajuda" style="margin:2px 0 0;">' + escapa(i.aviso) + '</div>' : "") + '</td>' +
        '<td><select class="fin-sel-cat" data-cat="' + i.id + '">' + finOpcoes(lista, i.categoria) + '</select></td>' +
        '<td><button type="button" class="pilula fin-tipo-pilula ' + (i.tipo === "receita" ? "fin-pilula-pago" : "fin-pilula-aberta") + '" data-tipo-linha="' + i.id + '" title="Clique pra trocar">' + (i.tipo === "receita" ? "Entrada" : "Saída") + '</button></td>' +
        '<td style="text-align:right; white-space:nowrap;"><strong class="' + (i.tipo === "receita" ? "fin-entrada" : "fin-saida") + '">' + (i.tipo === "receita" ? "+" : "-") + ' ' + finMoeda(i.valor) + '</strong></td></tr>';
    }).join("") + '</tbody></table></div>' +
    '<div class="fin-rev-rodape"><div id="finRevResumo"></div>' +
      '<div class="fin-rev-botoes"><button type="button" class="btn" id="finRevCancelar">Cancelar</button>' +
      '<button type="button" class="btn btn-principal" id="finRevConfirmar"></button></div></div>' +
    '<p class="aviso erro oculto" id="finRevErro"></p></div>';

  var atualizarResumo = function(){
    var r = finResumoRevisao();
    document.getElementById("finRevResumo").innerHTML = '<strong>' + r.qtd + '</strong> selecionados &nbsp;|&nbsp; entradas <strong class="fin-entrada">' + finMoeda(r.entra) + '</strong> &nbsp;|&nbsp; saídas <strong class="fin-saida">' + finMoeda(r.sai) + '</strong>';
    var botao = document.getElementById("finRevConfirmar");
    botao.textContent = "Mês organizado! Eu confirmo";
    botao.disabled = r.qtd === 0;
  };
  atualizarResumo();

  var achar = function(id){ return imp.itens[Number(id)]; };
  area.querySelectorAll("[data-marcar]").forEach(function(c){
    c.addEventListener("change", function(){
      var item = achar(c.getAttribute("data-marcar"));
      item.marcada = c.checked;
      c.closest("tr").classList.toggle("fin-rev-off", !c.checked);
      atualizarResumo();
    });
  });
  area.querySelectorAll("[data-cat]").forEach(function(s){ s.addEventListener("change", function(){ achar(s.getAttribute("data-cat")).categoria = s.value; }); });
  area.querySelectorAll("[data-tipo-linha]").forEach(function(b){
    b.addEventListener("click", function(){
      var item = achar(b.getAttribute("data-tipo-linha"));
      item.tipo = item.tipo === "receita" ? "despesa" : "receita";
      item.categoria = finCategorizar(item.descricao, item.tipo);
      finDesenharRevisao(area);
    });
  });
  document.getElementById("finRevTodas").addEventListener("click", function(){ imp.itens.forEach(function(i){ i.marcada = true; }); finDesenharRevisao(area); });
  document.getElementById("finRevNenhuma").addEventListener("click", function(){ imp.itens.forEach(function(i){ i.marcada = false; }); finDesenharRevisao(area); });
  document.getElementById("finRevInverter").addEventListener("click", function(){
    imp.itens.forEach(function(i){ i.tipo = i.tipo === "receita" ? "despesa" : "receita"; i.categoria = finCategorizar(i.descricao, i.tipo); });
    finDesenharRevisao(area);
  });
  document.getElementById("finRevCancelar").addEventListener("click", function(){ finImp = null; finDesenharImportar(area); });
  document.getElementById("finRevConfirmar").addEventListener("click", finConfirmarImportacao);
}

async function finConfirmarImportacao(){
  var imp = finImp;
  if(!imp) return;
  var escolhidas = imp.itens.filter(function(i){ return i.marcada; });
  if(!escolhidas.length) return;
  var botao = document.getElementById("finRevConfirmar");
  var erro = document.getElementById("finRevErro");
  botao.disabled = true;
  botao.textContent = "Salvando...";
  var lote = new Date().toISOString().slice(0, 19) + " " + imp.arquivo;
  var linhas = escolhidas.map(function(i){
    return {
      perfil_id: finPerfilId, data: i.data, descricao: i.descricao, valor: i.valor, tipo: i.tipo, categoria: i.categoria,
      pago: true, origem: imp.tipo, parcela: i.parcela || null, arquivo: imp.arquivo, lote: lote, chave: i.chave
    };
  });
  for(var p = 0; p < linhas.length; p += 200){
    var r = await buscarSeguro(banco.from("fin_lancamentos").insert(linhas.slice(p, p + 200)));
    if(!r.ok){
      erro.textContent = "Não consegui salvar" + (p > 0 ? " (" + p + " lançamentos já tinham sido salvos; use 'Desfazer esta importação' se quiser recomeçar)" : "") + ": " + r.mensagem;
      erro.classList.remove("oculto");
      botao.disabled = false;
      botao.textContent = "Tentar de novo";
      return;
    }
  }
  // vai pro mês mais recente do que foi importado
  var maisRecente = escolhidas.reduce(function(m, i){ return i.data > m ? i.data : m; }, "0000-00-00");
  finMes = maisRecente.slice(0, 7);
  finModo = "mensal";
  finImp = null;
  finLinhas = null;
  finSubaba = "visao";
  irParaAba("financeiro");
}
