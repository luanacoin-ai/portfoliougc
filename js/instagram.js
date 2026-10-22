/* ============================================================================
   ABA: INSTAGRAM (automação de DM, estilo ManyChat, e análises do perfil)
   Sete sub-abas (as mesmas do modelo que você mandou):
     Visão geral: o token com contagem regressiva, a saúde da conexão, os
       números do dia e os últimos envios.                  (instagram-analises.js)
     Automações: a lista (com a foto do post de cada uma), e o editor com a
       prévia ao vivo (celular).                            (este arquivo)
     Leads: a planilha de todo mundo que entrou nas automações, com busca,
       filtros, etiquetas, CSV e a lixeira de pedido de exclusão. (este arquivo)
     Análises: seguidores, novos seguidores, alcance por dia, interações e
       melhores posts, com filtro de dias.                  (instagram-analises.js)
     Marcas: as marcas que chegaram pelo Instagram.         (instagram-analises.js)
     Propostas: o controle das propostas de parceria.       (instagram-analises.js)
     Sorteio: sorteia ganhadores entre quem comentou num post. (instagram-analises.js)

   Como funciona por trás: quando alguém comenta a palavra escolhida num post,
   o Instagram avisa a função "instagram-webhook" no Supabase, que manda a DM.
   Este arquivo cria e edita as automações (tabela ig_automations) e mostra os
   resultados. Passo a passo de configuração: INSTAGRAM-LEIA-ME.md.

   Este arquivo é carregado DEPOIS do script principal, então pode usar tudo
   que já existe lá: banco, buscarSeguro, escapa, el, icone, faixaAviso,
   irParaAba, abrirModal, fecharModal, guardaFecharModal, modalBox,
   formatarDataHora, baixarCSV.
============================================================================ */
"use strict";

var IG_EMOJIS = ["🫶", "👀", "😍", "🥰", "😂", "😮", "🔥", "✨", "💌", "👉", "🙌", "💕"];
var IG_LIMITE_BOTAO = 20;            // o Instagram corta o título do botão em 20 letras
var IG_LIMITE_MSG_COM_BOTAO = 640;   // mensagem com botão anexado: até 640 letras
var IG_LIMITE_MSG = 900;             // mensagem sem botão (o teto real são 1000 bytes)
var IG_MAX_BOTOES = 3;               // botões anexados na mesma mensagem: no máximo 3
var IG_MAX_ARQUIVO_BYTES = 25 * 1024 * 1024;

var igSubabaAtual = "visao";
var igPostsCache = null;             // { conectado, posts, motivo }, vindo da função ig-media
var igAssets = [];                   // a biblioteca de arquivos (tabela ig_assets)
var igEd = null;                     // o estado do editor que está aberto
var igEdSujo = false;                // o editor tem alterações não salvas?

/* ============================================================================
   A ABA
============================================================================ */
async function abaInstagram(painel){
  var subabas = [
    { chave: "visao", rotulo: "Visão geral" },
    { chave: "automacoes", rotulo: "Automações" },
    { chave: "leads", rotulo: "Leads" },
    { chave: "analises", rotulo: "Análises" },
    { chave: "marcas", rotulo: "Marcas" },
    { chave: "propostas", rotulo: "Propostas" },
    { chave: "sorteio", rotulo: "Sorteio" }
  ];
  painel.innerHTML =
    '<div class="ig-topo">' +
      '<div class="ig-topo-titulo"><strong>Automação do Instagram</strong>' +
        '<span>Responde comentários por DM, guarda os leads e mostra como o seu perfil está indo.</span></div>' +
      '<div class="ig-pills" id="igPills"></div>' +
    '</div>' +
    '<div class="subtabs">' + subabas.map(function(sub){
      return '<button type="button" class="subtab-btn ' + (igSubabaAtual === sub.chave ? "ativo" : "") + '" data-ig-sub="' + sub.chave + '">' + sub.rotulo + '</button>';
    }).join("") + '</div><div id="igConteudo"></div>';

  painel.querySelectorAll("[data-ig-sub]").forEach(function(botao){
    botao.addEventListener("click", function(){
      igSubabaAtual = botao.getAttribute("data-ig-sub");
      irParaAba("instagram");
    });
  });

  // O topo (token e entregas) é preenchido em segundo plano, sem travar a aba.
  if(typeof igCarregarPills === "function") igCarregarPills();

  var area = document.getElementById("igConteudo");
  var telas = {
    visao: "igRenderVisaoGeral", analises: "igRenderAnalises", marcas: "igRenderMarcas",
    propostas: "igRenderPropostas", sorteio: "igRenderSorteio"
  };
  if(igSubabaAtual === "leads") await igRenderInteracoes(area);
  else if(igSubabaAtual === "automacoes") await igRenderAutomacoes(area);
  else if(telas[igSubabaAtual] && typeof window[telas[igSubabaAtual]] === "function") await window[telas[igSubabaAtual]](area);
  else area.innerHTML = faixaAviso("Não consegui carregar esta tela. Recarregue a página com Ctrl+F5.", "erro");
}

/* ---------- pequenos ajudantes ---------- */
// Como escapa(), mas também protege as aspas, pra poder usar dentro de value="..." e title="...".
function igAttr(texto){
  return escapa(texto).replace(/"/g, "&quot;");
}

function igPillStatus(status){
  var mapa = {
    ok: { classe: "ig-pilula-ok", rotulo: "Enviado" },
    erro: { classe: "ig-pilula-erro", rotulo: "Erro" },
    na_fila: { classe: "ig-pilula-fila", rotulo: "Na fila" },
    pulado: { classe: "ig-pilula-pulado", rotulo: "Pulado" }
  };
  var m = mapa[status] || { classe: "ig-pilula-pulado", rotulo: status || "-" };
  return '<span class="pilula ' + m.classe + '">' + m.rotulo + '</span>';
}

function igDataCurta(textoISO){
  var d = new Date(textoISO);
  return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2);
}

function igTextoFuncaoIndisponivel(nomeFuncao, mensagem){
  return "Não consegui falar com a função " + nomeFuncao + " no Supabase. Ela já foi publicada? Passo a passo em INSTAGRAM-LEIA-ME.md." +
    (mensagem ? " (" + mensagem + ")" : "");
}

/* ============================================================================
   GRÁFICOS E PEQUENOS AJUDANTES (usados pelas várias sub-abas)
============================================================================ */
function igGraficoBarras(pontos, classeCor){
  if(!pontos || pontos.length === 0){
    return '<p class="vazio-explicacao">Sem dados nos últimos dias.</p>';
  }
  var maior = 1;
  pontos.forEach(function(p){ if(p.valor > maior) maior = p.valor; });
  // Com muitos dias, mostra a data só de vez em quando (senão as datas se embolam).
  var passo = pontos.length > 16 ? Math.ceil(pontos.length / 10) : 1;
  var html = '<div class="grafico-barras' + (pontos.length > 40 ? " fino" : "") + '">';
  pontos.forEach(function(p, i){
    var altura = Math.round((p.valor / maior) * 90) + 4;
    html += '<div class="barra-dia"><span class="dica">' + igDataCurta(p.dia) + ": " + igFormatarNumero(p.valor) + '</span>' +
      '<div class="barra ' + (classeCor || "") + '" style="height:' + altura + 'px"></div>' +
      '<div class="rotulo-dia">' + (i % passo === 0 ? igDataCurta(p.dia) : "&nbsp;") + '</div></div>';
  });
  return html + '</div>';
}

function igSoma(pontos){
  return (pontos || []).reduce(function(total, p){ return total + (p.valor || 0); }, 0);
}

function igUltimosDiasISO(quantidade){
  var dias = [];
  var hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  for(var i = quantidade - 1; i >= 0; i--){
    var d = new Date(hoje.getTime() - i * 86400000);
    dias.push(d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2));
  }
  return dias;
}

// Mostra se o Instagram está mesmo avisando o sistema sobre comentários e mensagens.
// Sem a "assinatura de webhooks" da conta, o app pode estar publicado e mesmo assim
// nenhum comentário chega, e o sistema fica em silêncio.
function igCartaoConexao(ig){
  var precisa = [
    { campo: "comments", rotulo: "comentários" },
    { campo: "messages", rotulo: "mensagens" },
    { campo: "messaging_postbacks", rotulo: "toques nos botões" }
  ];
  var wh = ig.webhooks || {};
  var titulo = "Conexão com o Instagram";
  var linhaConta = ig.username ? 'Conta ligada: <strong>@' + escapa(ig.username) + '</strong>. ' : "";

  if(!wh.consultou){
    return '<div class="painel-branco"><p class="painel-titulo">' + titulo + '</p>' +
      '<p style="font-size:.82rem;">' + linhaConta + 'Não consegui conferir se o Instagram está avisando o sistema' + (wh.erro ? " (" + escapa(wh.erro) + ")" : "") + '. Se você publicou a função ig-insights agora, tente recarregar.</p></div>';
  }
  var faltando = precisa.filter(function(p){ return (wh.campos || []).indexOf(p.campo) === -1; });
  if(faltando.length === 0){
    return '<div class="painel-branco"><p class="painel-titulo">' + titulo + '</p>' +
      '<p style="font-size:.82rem;">' + linhaConta + '<span class="pilula ig-pilula-ok">Tudo certo</span> O Instagram está avisando o sistema sobre comentários, mensagens e toques nos botões.</p></div>';
  }
  return '<div class="aviso erro"><strong>' + titulo + ':</strong> ' + linhaConta +
    'O Instagram <strong>não está avisando</strong> o sistema sobre: ' + faltando.map(function(p){ return escapa(p.rotulo); }).join(", ") + '. ' +
    'Sem isso, ninguém recebe DM. Ligue a assinatura de webhooks da sua conta no app do Meta e cadastre os campos <code>comments</code>, <code>messages</code> e <code>messaging_postbacks</code> (INSTAGRAM-LEIA-ME.md, Passo 6).</div>';
}

function igCartaoMetrica(numero, rotulo){
  return '<div class="cartao"><div class="numero">' + numero + '</div><div class="rotulo">' + rotulo + '</div></div>';
}

function igFormatarNumero(n){
  if(n === null || n === undefined) return "-";
  return Number(n).toLocaleString("pt-BR");
}

// Conta linhas sem trazer as linhas (usa o "count" do Supabase). Devolve null se falhar.
async function igContar(consulta){
  try{
    var r = await consulta;
    if(r.error) throw r.error;
    return typeof r.count === "number" ? r.count : null;
  }catch(erro){
    console.error(erro);
    return null;
  }
}

// Chama uma função do Supabase que devolve JSON. Nunca lança erro.
async function igChamarFuncao(nome, corpo){
  try{
    var r = await banco.functions.invoke(nome, { body: corpo || {} });
    if(r.error) return { ok: false, mensagem: r.error.message || "erro ao chamar a função" };
    if(r.data && r.data.erro) return { ok: false, mensagem: r.data.erro };
    return { ok: true, dados: r.data || {} };
  }catch(erro){
    return { ok: false, mensagem: erro && erro.message ? erro.message : "erro desconhecido" };
  }
}

/* ============================================================================
   SUB-ABA: LEADS (a planilha de todo mundo que entrou nas automações)
   Cada linha é uma pessoa. Dá pra buscar, filtrar, ordenar clicando no título
   da coluna, editar as etiquetas, baixar a lista (pedido de acesso ou
   portabilidade) e apagar os dados de uma pessoa (pedido de exclusão, LGPD).
   A política de privacidade promete apagar tudo em até 15 dias depois do
   pedido, e os contatos sem interação há 12 meses são apagados sozinhos.
============================================================================ */
var igFiltroInter = { busca: "", origem: "", automacao: "", etiqueta: "", soComContato: false };
var igOrdemInter = { chave: "ultima", asc: false };
var IG_PAGINA_INTER = 100;           // quantas linhas aparecem por vez
var igLinhasInter = IG_PAGINA_INTER;

function igRotuloOrigem(origem){
  return { comment: "Comentário", dm: "Mensagem direta", story_reply: "Resposta a story" }[origem] || (origem || "-");
}

// "há 3 dias", "há 2 horas": pra bater o olho e saber há quanto tempo foi.
function igHa(textoISO){
  if(!textoISO) return "";
  var minutos = Math.floor((Date.now() - new Date(textoISO).getTime()) / 60000);
  if(minutos < 1) return "agora";
  if(minutos < 60) return "há " + minutos + " min";
  var horas = Math.floor(minutos / 60);
  if(horas < 24) return "há " + horas + (horas === 1 ? " hora" : " horas");
  var dias = Math.floor(horas / 24);
  if(dias < 60) return "há " + dias + (dias === 1 ? " dia" : " dias");
  var meses = Math.floor(dias / 30);
  return "há " + meses + (meses === 1 ? " mês" : " meses");
}

// O Supabase devolve no máximo 1000 linhas por pedido, então busca de 1000 em 1000.
async function igCarregarTodasAsLinhas(fabricaDeConsulta, maximoDePaginas){
  var tudo = [];
  for(var p = 0; p < maximoDePaginas; p++){
    var r = await buscarSeguro(fabricaDeConsulta().range(p * 1000, p * 1000 + 999));
    if(!r.ok) return { ok: false, mensagem: r.mensagem, dados: tudo };
    tudo = tudo.concat(r.dados);
    if(r.dados.length < 1000) return { ok: true, dados: tudo, truncado: false };
  }
  return { ok: true, dados: tudo, truncado: true };
}

// As colunas da planilha. "valor" é o que vale na hora de ordenar.
var IG_COLUNAS_INTER = [
  { chave: "pessoa", rotulo: "Pessoa", valor: function(p){ return (p.username || "").toLowerCase() || p.ig_user_id; } },
  { chave: "origem", rotulo: "Origem", valor: function(p){ return igRotuloOrigem(p.last_source); } },
  { chave: "palavra", rotulo: "Palavra", valor: function(p){ return (p.last_keyword || "").toLowerCase(); } },
  { chave: "automacao", rotulo: "Automação", valor: function(p){ return (p.automacaoNome || "").toLowerCase(); } },
  { chave: "contato", rotulo: "Contato", valor: function(p){ return (p.email || p.telefone || "").toLowerCase(); } },
  { chave: "etiquetas", rotulo: "Etiquetas", valor: function(p){ return (p.tags || []).join(",").toLowerCase(); } },
  { chave: "interacoes", rotulo: "Interações", numerico: true, valor: function(p){ return p.interacoes; } },
  { chave: "enviadas", rotulo: "DMs enviadas", numerico: true, valor: function(p){ return p.enviadas; } },
  { chave: "link", rotulo: "Link enviado", numerico: true, valor: function(p){ return p.link_sent ? 1 : 0; } },
  { chave: "etapa", rotulo: "Etapa", numerico: true, valor: function(p){ return Number(p.flow_step) || 0; } },
  { chave: "primeira", rotulo: "Primeira vez", valor: function(p){ return p.created_at || ""; } },
  { chave: "ultima", rotulo: "Última vez", valor: function(p){ return p.updated_at || ""; } }
];

async function igRenderInteracoes(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando leads...</p>';

  var resultados = await Promise.all([
    igCarregarTodasAsLinhas(function(){ return banco.from("ig_leads").select("*").order("ig_user_id"); }, 5),
    igCarregarTodasAsLinhas(function(){ return banco.from("ig_deliveries").select("ig_user_id, status, tipo, motivo, ts").order("id"); }, 10),
    buscarSeguro(banco.from("ig_automations").select("id, nome, keyword, match_any"))
  ]);
  var resLeads = resultados[0], resEntregas = resultados[1], resAutomacoes = resultados[2];
  if(!resLeads.ok){
    area.innerHTML = faixaAviso("Não consegui carregar os leads. Confira se você rodou o arquivo instagram.sql no Supabase. Detalhe: " + (resLeads.mensagem || ""), "erro");
    return;
  }

  // Quantas vezes cada pessoa interagiu: cada comentário, toque em botão ou mensagem
  // que o sistema tratou vira uma linha em ig_deliveries. Não conta o que o robô fez
  // sozinho depois (envio pela fila, passo com atraso) nem os arquivos.
  var porPessoa = {};
  (resEntregas.dados || []).forEach(function(d){
    if(d.tipo === "asset" || d.motivo === "Enviado pela fila" || d.motivo === "Passo com atraso") return;
    var a = porPessoa[d.ig_user_id] || (porPessoa[d.ig_user_id] = { interacoes: 0, enviadas: 0 });
    a.interacoes++;
    if(d.status === "ok") a.enviadas++;
  });
  var nomesAutomacao = {};
  (resAutomacoes.dados || []).forEach(function(a){ nomesAutomacao[a.id] = a.nome || a.keyword || "Sem nome"; });

  var pessoas = resLeads.dados.map(function(l){
    var a = porPessoa[l.ig_user_id] || { interacoes: 0, enviadas: 0 };
    return Object.assign({}, l, { interacoes: a.interacoes, enviadas: a.enviadas, automacaoNome: nomesAutomacao[l.automation_id] || "" });
  });

  var etiquetasExistentes = [];
  pessoas.forEach(function(p){ (p.tags || []).forEach(function(t){ if(etiquetasExistentes.indexOf(t) === -1) etiquetasExistentes.push(t); }); });
  etiquetasExistentes.sort();
  var automacoesExistentes = [];
  pessoas.forEach(function(p){ if(p.automacaoNome && automacoesExistentes.indexOf(p.automacaoNome) === -1) automacoesExistentes.push(p.automacaoNome); });
  automacoesExistentes.sort();

  var f = igFiltroInter;
  var opcoes = function(lista, atual){
    return lista.map(function(v){ return '<option value="' + igAttr(v) + '" ' + (atual === v ? "selected" : "") + '>' + escapa(v) + '</option>'; }).join("");
  };
  area.innerHTML =
    '<div class="barra-acoes">' +
      '<div class="campo-busca">' + icone("busca") + '<input id="igBuscaInter" placeholder="Buscar por @, e-mail, telefone ou palavra" value="' + igAttr(f.busca) + '"></div>' +
      '<select id="igFiltroOrigem" class="btn"><option value="">Todas as origens</option>' +
        opcoes(["Comentário", "Mensagem direta", "Resposta a story"], f.origem) + '</select>' +
      '<select id="igFiltroAutomacao" class="btn"><option value="">Todas as automações</option>' + opcoes(automacoesExistentes, f.automacao) + '</select>' +
      '<select id="igFiltroEtiqueta" class="btn"><option value="">Todas as etiquetas</option>' + opcoes(etiquetasExistentes, f.etiqueta) + '</select>' +
      '<label class="linha-interruptor" style="font-size:.76rem;"><span class="interruptor"><input type="checkbox" id="igFiltroContato" ' + (f.soComContato ? "checked" : "") + '><span class="trilho"></span></span> Só com e-mail ou telefone</label>' +
      '<button class="btn" id="btnBaixarInter">' + icone("baixar") + ' Baixar planilha (CSV)</button>' +
    '</div>' +
    '<p id="igResumoInter" style="font-size:.78rem; font-weight:600; margin-bottom:6px;"></p>' +
    '<p style="font-size:.72rem; color:#725A50; margin-bottom:12px;">' +
      'Clique no título de uma coluna pra ordenar. Clique nas etiquetas de uma pessoa pra editar. ' +
      '"Interações" conta cada comentário, toque em botão ou mensagem da pessoa. ' +
      'O Instagram só informa o @ (não o nome da pessoa). ' +
      'Quem fica 12 meses sem interagir é apagado sozinho. Pra atender um pedido de exclusão, use a lixeira da linha: ela apaga o contato, o histórico, a fila e o e-mail ou telefone da pessoa.' +
      (resLeads.truncado ? ' Mostrando só as primeiras 5000 pessoas.' : '') +
      (resEntregas.ok === false ? ' Atenção: não consegui ler o histórico de envios, então as contagens podem estar zeradas.' : '') +
      (resEntregas.truncado ? ' A contagem de interações considera os 10 mil envios mais antigos.' : '') +
    '</p>' +
    '<div class="painel-branco ig-planilha"><div class="tabela-scroll" id="igAreaInter"></div></div>';

  var redesenhar = function(){ igDesenharPlanilha(pessoas); };
  var ligar = function(id, evento, aplicar){
    document.getElementById(id).addEventListener(evento, function(e){ aplicar(e.target); igLinhasInter = IG_PAGINA_INTER; redesenhar(); });
  };
  ligar("igBuscaInter", "input", function(el){ f.busca = el.value; });
  ligar("igFiltroOrigem", "change", function(el){ f.origem = el.value; });
  ligar("igFiltroAutomacao", "change", function(el){ f.automacao = el.value; });
  ligar("igFiltroEtiqueta", "change", function(el){ f.etiqueta = el.value; });
  ligar("igFiltroContato", "change", function(el){ f.soComContato = el.checked; });

  document.getElementById("btnBaixarInter").addEventListener("click", function(){
    var lista = igOrdenarPessoas(igFiltrarPessoas(pessoas));
    if(lista.length === 0){ alert("Nenhuma pessoa pra baixar."); return; }
    baixarCSV("leads-instagram.csv",
      ["@", "ID no Instagram", "Origem", "Palavra", "Automação", "E-mail", "Telefone", "Etiquetas", "Interações", "DMs enviadas", "Link enviado", "Etapa da conversa", "Primeira vez", "Última vez"],
      lista.map(function(p){
        return [p.username ? "@" + p.username : "", p.ig_user_id, igRotuloOrigem(p.last_source), p.last_keyword || "", p.automacaoNome || "",
          p.email || "", p.telefone || "", (p.tags || []).join(", "), p.interacoes, p.enviadas, p.link_sent ? "Sim" : "Não",
          p.flow_step ? "Mensagem " + p.flow_step : "", p.created_at || "", p.updated_at || ""];
      }));
  });
  redesenhar();
}

function igFiltrarPessoas(lista){
  var f = igFiltroInter;
  var t = String(f.busca || "").trim().toLowerCase().replace(/^@/, "");
  return lista.filter(function(p){
    if(f.origem && igRotuloOrigem(p.last_source) !== f.origem) return false;
    if(f.automacao && p.automacaoNome !== f.automacao) return false;
    if(f.etiqueta && (p.tags || []).indexOf(f.etiqueta) === -1) return false;
    if(f.soComContato && !p.email && !p.telefone) return false;
    if(!t) return true;
    var alvo = [p.username, p.email, p.telefone, p.ig_user_id, p.last_keyword].join(" ").toLowerCase();
    return alvo.indexOf(t) !== -1;
  });
}

function igOrdenarPessoas(lista){
  var coluna = IG_COLUNAS_INTER.filter(function(c){ return c.chave === igOrdemInter.chave; })[0] || IG_COLUNAS_INTER[IG_COLUNAS_INTER.length - 1];
  var sentido = igOrdemInter.asc ? 1 : -1;
  return lista.slice().sort(function(a, b){
    var va = coluna.valor(a), vb = coluna.valor(b);
    if(va === vb) return 0;
    if(coluna.numerico) return (va - vb) * sentido;
    return (va > vb ? 1 : -1) * sentido;
  });
}

function igDesenharPlanilha(pessoas){
  var area = document.getElementById("igAreaInter");
  var resumo = document.getElementById("igResumoInter");
  if(!area) return;

  if(pessoas.length === 0){
    resumo.textContent = "";
    area.innerHTML = '<p class="vazio-explicacao">Nenhum lead ainda. Quem comentar a palavra de uma automação ligada aparece aqui, com origem, palavra, contato e histórico de interações.</p>';
    return;
  }
  var filtradas = igOrdenarPessoas(igFiltrarPessoas(pessoas));
  var totalInteracoes = filtradas.reduce(function(soma, p){ return soma + p.interacoes; }, 0);
  resumo.textContent = filtradas.length + (filtradas.length === 1 ? " lead" : " leads") +
    (filtradas.length !== pessoas.length ? " (de " + pessoas.length + ")" : "") + " · " + totalInteracoes + (totalInteracoes === 1 ? " interação" : " interações");
  if(filtradas.length === 0){
    area.innerHTML = '<p class="vazio-explicacao">Nenhum lead encontrado com esses filtros.</p>';
    return;
  }

  var cabecalho = IG_COLUNAS_INTER.map(function(c){
    var ativa = igOrdemInter.chave === c.chave;
    return '<th class="ordenavel ' + (ativa ? "ativa" : "") + '" data-ordem="' + c.chave + '" scope="col" title="Ordenar por ' + igAttr(c.rotulo) + '">' + escapa(c.rotulo) +
      '<span class="seta">' + (ativa ? (igOrdemInter.asc ? "▲" : "▼") : "↕") + '</span></th>';
  }).join("");
  var tabela = el('<table><thead><tr>' + cabecalho + '<th scope="col"></th></tr></thead><tbody></tbody></table>');
  tabela.querySelectorAll("th[data-ordem]").forEach(function(th){
    th.addEventListener("click", function(){
      var chave = th.getAttribute("data-ordem");
      var colunaNumerica = IG_COLUNAS_INTER.filter(function(c){ return c.chave === chave; })[0].numerico;
      if(igOrdemInter.chave === chave) igOrdemInter.asc = !igOrdemInter.asc;
      else { igOrdemInter.chave = chave; igOrdemInter.asc = !(colunaNumerica || chave === "primeira" || chave === "ultima"); }
      igDesenharPlanilha(pessoas);
    });
  });

  var corpo = tabela.querySelector("tbody");
  filtradas.slice(0, igLinhasInter).forEach(function(p){
    var arroba = p.username ? "@" + p.username : "(sem @)";
    var pessoa = p.username
      ? '<a href="https://instagram.com/' + igAttr(p.username) + '" target="_blank" rel="noopener"><strong>' + escapa(arroba) + '</strong></a>'
      : '<strong>' + escapa(arroba) + '</strong>';
    var contato = [p.email, p.telefone].filter(Boolean).map(escapa).join("<br>") || '<span style="color:#7C645A;">-</span>';
    var etiquetas = (p.tags || []).map(function(t){ return '<span class="pilula" style="background:#EFE3D0; margin:1px 3px 1px 0;">' + escapa(t) + '</span>'; }).join("") ||
      '<span style="color:#7C645A;">+ etiqueta</span>';

    var tr = el('<tr>' +
      '<td>' + pessoa + '<div class="ig-id">ID ' + escapa(p.ig_user_id) + '</div></td>' +
      '<td>' + escapa(igRotuloOrigem(p.last_source)) + '</td>' +
      '<td>' + escapa(p.last_keyword || "-") + '</td>' +
      '<td>' + escapa(p.automacaoNome || "-") + '</td>' +
      '<td>' + contato + '</td>' +
      '<td><button type="button" class="ig-celula-etiquetas" title="Editar etiquetas">' + etiquetas + '</button></td>' +
      '<td class="ig-num-cel"><strong>' + p.interacoes + '</strong></td>' +
      '<td class="ig-num-cel">' + p.enviadas + '</td>' +
      '<td>' + (p.link_sent ? "Sim" : "Não") + '</td>' +
      '<td>' + (p.flow_step ? "Mensagem " + escapa(p.flow_step) : "-") + '</td>' +
      '<td style="white-space:nowrap;">' + escapa(formatarDataHora(p.created_at)) + '</td>' +
      '<td style="white-space:nowrap;">' + escapa(formatarDataHora(p.updated_at)) + '<div class="ig-id">' + escapa(igHa(p.updated_at)) + '</div></td>' +
      '<td><button type="button" class="btn btn-icone btn-perigo" title="Apagar todos os dados desta pessoa">' + icone("lixeira") + '</button></td>' +
    '</tr>');
    tr.querySelector(".ig-celula-etiquetas").addEventListener("click", function(){ igEditarEtiquetas(p, pessoas); });
    tr.querySelector(".btn-perigo").addEventListener("click", function(){ igConfirmarApagarPessoa(p); });
    corpo.appendChild(tr);
  });

  area.innerHTML = "";
  area.appendChild(tabela);
  if(filtradas.length > igLinhasInter){
    var mais = el('<div style="text-align:center; padding:12px;"><button type="button" class="btn">Mostrar mais ' + Math.min(IG_PAGINA_INTER, filtradas.length - igLinhasInter) + ' (de ' + (filtradas.length - igLinhasInter) + ' restantes)</button></div>');
    mais.querySelector("button").addEventListener("click", function(){ igLinhasInter += IG_PAGINA_INTER; igDesenharPlanilha(pessoas); });
    area.appendChild(mais);
  }
}

/* ---------- etiquetas de uma pessoa ---------- */
function igEditarEtiquetas(pessoa, todas){
  var arroba = pessoa.username ? "@" + pessoa.username : "esta pessoa";
  var existentes = [];
  todas.forEach(function(p){ (p.tags || []).forEach(function(t){ if(existentes.indexOf(t) === -1) existentes.push(t); }); });
  existentes.sort();

  abrirModal(
    '<p class="form-titulo">Etiquetas de ' + escapa(arroba) + '</p>' +
    '<div class="campo"><label for="igCampoEtiquetas">Etiquetas (separe por vírgula)</label>' +
      '<input id="igCampoEtiquetas" placeholder="Ex: quente, cliente, pediu orçamento" value="' + igAttr((pessoa.tags || []).join(", ")) + '"></div>' +
    (existentes.length ? '<p class="ig-ajuda" style="margin:-6px 0 6px;">Já usadas (clique pra adicionar):</p><div id="igSugestoesEtiquetas" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;"></div>' : '') +
    '<div class="form-acoes"><button type="button" class="btn" id="btnCancelarEtiquetas">Cancelar</button><button type="button" class="btn btn-principal" id="btnSalvarEtiquetas">Salvar</button></div>' +
    '<p class="aviso erro oculto" id="igErroEtiquetas" style="margin-top:12px;"></p>'
  );
  var campo = document.getElementById("igCampoEtiquetas");
  var lerCampo = function(){
    var vistas = {}, lista = [];
    campo.value.split(",").forEach(function(t){
      var limpa = t.trim();
      if(limpa && !vistas[limpa.toLowerCase()]){ vistas[limpa.toLowerCase()] = true; lista.push(limpa.slice(0, 30)); }
    });
    return lista;
  };
  var caixaSugestoes = document.getElementById("igSugestoesEtiquetas");
  if(caixaSugestoes) existentes.forEach(function(t){
    var b = el('<button type="button" class="chip">' + escapa(t) + '</button>');
    b.addEventListener("click", function(){
      var atuais = lerCampo();
      if(atuais.map(function(x){ return x.toLowerCase(); }).indexOf(t.toLowerCase()) === -1) atuais.push(t);
      campo.value = atuais.join(", ");
    });
    caixaSugestoes.appendChild(b);
  });

  document.getElementById("btnCancelarEtiquetas").addEventListener("click", fecharModal);
  document.getElementById("btnSalvarEtiquetas").addEventListener("click", async function(e){
    var botao = e.currentTarget;
    var areaErro = document.getElementById("igErroEtiquetas");
    var novas = lerCampo();
    botao.disabled = true;
    areaErro.classList.add("oculto");
    // ".select()" devolve a linha alterada: se vier vazio, o banco não deixou editar.
    var r = await buscarSeguro(banco.from("ig_leads").update({ tags: novas }).eq("ig_user_id", pessoa.ig_user_id).select("ig_user_id"));
    if(!r.ok || r.dados.length === 0){
      areaErro.textContent = "Não consegui salvar as etiquetas" + (r.mensagem ? ": " + r.mensagem : "") + ". Rode o arquivo instagram.sql de novo no Supabase (ele libera a edição) e tente outra vez.";
      areaErro.classList.remove("oculto");
      botao.disabled = false;
      return;
    }
    pessoa.tags = novas;
    fecharModal();
    igDesenharPlanilha(todas);
  });
}

function igConfirmarApagarPessoa(lead){
  var arroba = lead.username ? "@" + lead.username : "esta pessoa";
  abrirModal(
    '<p class="form-titulo">Apagar os dados de ' + escapa(arroba) + '</p>' +
    '<p style="font-size:.85rem; margin-bottom:10px;">Isso apaga <strong>tudo</strong> que o sistema guardou dessa pessoa: o contato, o histórico de envios, a fila, os passos agendados e o e-mail ou telefone que ela tenha enviado. Essa ação não pode ser desfeita.</p>' +
    '<p class="ig-ajuda" style="margin-bottom:16px;">As mensagens que ficam dentro do Instagram não são afetadas: elas pertencem à plataforma da Meta.</p>' +
    '<div class="form-acoes"><button class="btn" id="btnCancelarApagarPessoa">Cancelar</button><button class="btn btn-perigo" id="btnConfirmarApagarPessoa">Apagar tudo</button></div>' +
    '<p class="aviso erro oculto" id="igErroApagarPessoa" style="margin-top:12px;"></p>'
  );
  document.getElementById("btnCancelarApagarPessoa").addEventListener("click", fecharModal);
  document.getElementById("btnConfirmarApagarPessoa").addEventListener("click", async function(e){
    var botao = e.currentTarget;
    var areaErro = document.getElementById("igErroApagarPessoa");
    botao.disabled = true;
    areaErro.classList.add("oculto");

    // Primeiro apaga o que depende do contato (passos agendados, fila, histórico de envios)
    // e confere. O contato em si só é apagado DEPOIS, se tudo isso deu certo: assim, se algo
    // falhar, ele continua na lista pra você tentar de novo (sem sobrar dados soltos).
    var dependentes = ["ig_scheduled", "ig_send_queue", "ig_deliveries"];
    var problemas = [];
    var apagarEConferir = async function(tabela){
      var r = await buscarSeguro(banco.from(tabela).delete().eq("ig_user_id", lead.ig_user_id));
      if(!r.ok) problemas.push(tabela + ": " + (r.mensagem || "erro"));
      var sobrou = await igContar(banco.from(tabela).select("ig_user_id", { count: "exact", head: true }).eq("ig_user_id", lead.ig_user_id));
      if(sobrou) problemas.push("ainda restam " + sobrou + " registro(s) em " + tabela);
    };
    for(var i = 0; i < dependentes.length; i++) await apagarEConferir(dependentes[i]);
    if(problemas.length === 0) await apagarEConferir("ig_leads");

    if(problemas.length > 0){
      areaErro.textContent = "Não consegui apagar tudo: " + problemas.join("; ") + ". Rode o arquivo instagram.sql de novo no Supabase (ele libera a exclusão) e tente outra vez.";
      areaErro.classList.remove("oculto");
      botao.disabled = false;
      return;
    }
    fecharModal();
    irParaAba("instagram");
  });
}

/* ============================================================================
   SUB-ABA: AUTOMAÇÕES (a lista)
============================================================================ */
async function igRenderAutomacoes(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando automações...</p>';

  var resAut = await buscarSeguro(banco.from("ig_automations").select("*").order("created_at", { ascending: false }));
  if(!resAut.ok){
    area.innerHTML = faixaAviso("Não consegui carregar as automações. Confira se você rodou o arquivo instagram.sql no SQL Editor do Supabase (passo a passo em INSTAGRAM-LEIA-ME.md). Detalhe: " + (resAut.mensagem || ""), "erro");
    return;
  }
  var automacoes = resAut.dados;

  var html = "";
  html += '<div id="igAvisoFreio"></div>';
  html += '<div class="barra-acoes">' +
    '<button class="btn btn-principal" id="btnNovaAutomacaoIg">' + icone("mais") + ' Nova automação</button>' +
    '<span style="font-size:.76rem; color:#725A50;">Quando alguém comenta a palavra escolhida num post, a pessoa recebe uma DM automática.</span>' +
  '</div>';

  if(automacoes.length === 0){
    html += '<div class="vazio-explicacao">Você ainda não criou nenhuma automação. Clique em "Nova automação" para criar a primeira. O editor mostra, ao lado, uma prévia de como a DM chega no celular da pessoa.</div>';
  } else {
    html += '<div class="painel-branco"><div class="tabela-scroll"><table><thead><tr>' +
      '<th>Automação</th><th>Palavras</th><th>Ativa</th><th></th>' +
      '</tr></thead><tbody id="igCorpoLista"></tbody></table></div></div>';
  }

  html += '<div class="painel-branco"><p class="painel-titulo">Últimos envios</p><div id="igUltimosEnvios"><p class="vazio-explicacao">Carregando...</p></div></div>';
  area.innerHTML = html;

  document.getElementById("btnNovaAutomacaoIg").addEventListener("click", function(){ igAbrirEditor(null); });

  var corpo = document.getElementById("igCorpoLista");
  if(corpo){
    automacoes.forEach(function(a){ corpo.appendChild(igLinhaAutomacao(a)); });
  }

  igCarregarAvisoFreio();
  igCarregarUltimosEnvios();
  if(corpo) igPreencherFotosDosPosts(corpo);
}

// Troca o desenho de reserva pela foto do post vinculado a cada automação. A foto vem
// do Instagram na hora (os endereços das imagens vencem depois de uns dias, por isso
// não são guardados no banco). Se o Instagram não estiver ligado, fica o desenho.
async function igPreencherFotosDosPosts(corpo){
  var marcadores = Array.prototype.slice.call(corpo.querySelectorAll(".ig-thumb"));
  var todosOsIds = [];
  marcadores.forEach(function(m){
    (m.getAttribute("data-ig-posts") || "").split(",").filter(Boolean).forEach(function(id){ if(todosOsIds.indexOf(id) === -1) todosOsIds.push(id); });
  });
  if(todosOsIds.length === 0) return;

  var dados = await igCarregarPosts();
  var mapa = {};
  (dados.posts || []).forEach(function(p){ mapa[p.id] = p; });

  // Post antigo, que já saiu da lista dos 50 mais recentes: busca pelo número.
  var faltam = todosOsIds.filter(function(id){ return !mapa[id]; });
  if(dados.conectado && faltam.length > 0){
    var extra = await igChamarFuncao("ig-media", { ids: faltam });
    if(extra.ok) (extra.dados.posts || []).forEach(function(p){ mapa[p.id] = p; });
  }

  marcadores.forEach(function(marcador){
    if(!document.body.contains(marcador)) return;                  // a tela mudou enquanto carregava
    var ids = (marcador.getAttribute("data-ig-posts") || "").split(",").filter(Boolean);
    if(ids.length === 0) return;
    var achados = ids.map(function(id){ return mapa[id]; }).filter(function(p){ return p && p.miniatura; });
    if(achados.length === 0){
      marcador.title = dados.conectado
        ? "Não achei a foto deste post (ele pode ter sido apagado)."
        : "Conecte o Instagram pra ver a foto do post (INSTAGRAM-LEIA-ME.md).";
      return;
    }
    marcador.innerHTML = '<img src="' + igAttr(achados[0].miniatura) + '" alt="" loading="lazy">' +
      (ids.length > 1 ? '<span class="ig-thumb-mais">+' + (ids.length - 1) + '</span>' : "");
    marcador.title = ids.length === 1
      ? (achados[0].legenda || "Post sem legenda")
      : ids.length + " posts: " + achados.map(function(p){ return p.legenda || "sem legenda"; }).join(" | ");
    marcador.classList.add("com-foto");
  });
}

function igLinhaAutomacao(a){
  var palavras = a.match_any
    ? '<span class="pilula" style="background:#F6E3DA; color:#9A4430;">Qualquer comentário</span>'
    : String(a.keyword || "").split(",").map(function(p){ return p.trim(); }).filter(Boolean).map(function(p){
        return '<span class="pilula" style="background:#EFE3D0; margin:0 4px 4px 0;">' + escapa(p) + '</span>';
      }).join("");
  var qtdPosts = (a.media_ids || []).length;
  var nome = a.nome && a.nome.trim() ? a.nome : "Automação sem nome";

  var tr = el(
    '<tr class="clicavel">' +
      '<td><div class="ig-auto-nome">' +
        '<span class="ig-thumb" data-ig-posts="' + igAttr((a.media_ids || []).join(",")) + '" title="' + igAttr(qtdPosts === 0 ? "Vale para todos os posts" : "Carregando a foto do post...") + '">' + icone("instagram") + '</span>' +
        '<div><strong>' + escapa(nome) + '</strong><div class="ig-auto-sub">' + (qtdPosts === 0 ? "Todos os posts" : qtdPosts + (qtdPosts === 1 ? " post" : " posts")) + '</div></div>' +
      '</div></td>' +
      '<td>' + (palavras || "-") + '</td>' +
      '<td><label class="interruptor" title="Ligar ou desligar"><input type="checkbox" ' + (a.active ? "checked" : "") + '><span class="trilho"></span></label></td>' +
      '<td><div class="acoes-linha">' +
        '<button class="btn btn-icone" data-acao="editar" title="Editar">' + icone("editar") + '</button>' +
        '<button class="btn btn-icone btn-perigo" data-acao="apagar" title="Apagar">' + icone("lixeira") + '</button>' +
      '</div></td>' +
    '</tr>'
  );

  var chave = tr.querySelector(".interruptor input");
  tr.querySelector(".interruptor").addEventListener("click", function(e){ e.stopPropagation(); });
  chave.addEventListener("change", async function(){
    var novo = chave.checked;
    var r = await buscarSeguro(banco.from("ig_automations").update({ active: novo, updated_at: new Date().toISOString() }).eq("id", a.id));
    if(!r.ok){
      chave.checked = !novo;
      alert("Não consegui " + (novo ? "ligar" : "desligar") + " a automação: " + (r.mensagem || ""));
    } else {
      a.active = novo;
    }
  });
  tr.querySelector('[data-acao="editar"]').addEventListener("click", function(e){ e.stopPropagation(); igAbrirEditor(a); });
  tr.querySelector('[data-acao="apagar"]').addEventListener("click", function(e){ e.stopPropagation(); igConfirmarApagar(a); });
  tr.addEventListener("click", function(){ igAbrirEditor(a); });
  return tr;
}

function igConfirmarApagar(a){
  abrirModal(
    '<p class="form-titulo">Apagar automação</p>' +
    '<p style="font-size:.85rem; margin-bottom:18px;">Tem certeza que quer apagar "' + escapa(a.nome || "Automação sem nome") + '"? Quem já está no meio dessa conversa deixa de receber as próximas mensagens. Essa ação não pode ser desfeita.</p>' +
    '<div class="form-acoes"><button class="btn" id="btnCancelarApagarIg">Cancelar</button><button class="btn btn-perigo" id="btnConfirmarApagarIg">Apagar</button></div>'
  );
  document.getElementById("btnCancelarApagarIg").addEventListener("click", fecharModal);
  document.getElementById("btnConfirmarApagarIg").addEventListener("click", async function(e){
    e.currentTarget.disabled = true;
    var r = await buscarSeguro(banco.from("ig_automations").delete().eq("id", a.id));
    fecharModal();
    if(!r.ok) alert("Não consegui apagar: " + (r.mensagem || ""));
    irParaAba("instagram");
  });
}

// O freio de envio: avisa se está pausado ou se tem gente esperando na fila.
async function igCarregarAvisoFreio(){
  var area = document.getElementById("igAvisoFreio");
  if(!area) return;
  var resFreio = await buscarSeguro(banco.from("ig_send_budget").select("*").eq("id", "private_reply").limit(1));
  var pendentes = await igContar(banco.from("ig_send_queue").select("id", { count: "exact", head: true }).eq("status", "pendente"));
  area = document.getElementById("igAvisoFreio");
  if(!area) return;

  var freio = resFreio.ok && resFreio.dados.length > 0 ? resFreio.dados[0] : null;
  var pausado = freio && freio.paused_until && new Date(freio.paused_until).getTime() > Date.now();
  var html = "";
  if(pausado){
    html += '<div class="aviso erro" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">' +
      '<span>Os envios estão <strong>pausados por segurança</strong> até ' + escapa(formatarDataHora(freio.paused_until)) + ' (o Instagram recusou várias mensagens seguidas). Veja o motivo em "Últimos envios". Se já resolveu o problema, pode destravar.</span>' +
      '<button class="btn btn-pequeno" id="btnDestravarIg">Destravar envios agora</button></div>';
  }
  if(pendentes && pendentes > 0){
    html += faixaAviso(pendentes + (pendentes === 1 ? " pessoa está" : " pessoas estão") + " na fila de envio (o freio segura pra não passar do limite do Instagram). O robô manda a cada minuto.", "");
  }
  area.innerHTML = html;

  var botao = document.getElementById("btnDestravarIg");
  if(botao){
    botao.addEventListener("click", async function(){
      botao.disabled = true;
      var r = await buscarSeguro(banco.from("ig_send_budget").update({ paused_until: null, err_streak: 0 }).eq("id", "private_reply"));
      if(!r.ok) alert("Não consegui destravar: " + (r.mensagem || ""));
      irParaAba("instagram");
    });
  }
}

async function igCarregarUltimosEnvios(){
  var area = document.getElementById("igUltimosEnvios");
  if(!area) return;
  var res = await buscarSeguro(banco.from("ig_deliveries").select("*").order("ts", { ascending: false }).limit(15));
  area = document.getElementById("igUltimosEnvios");
  if(!area) return;
  if(!res.ok){
    area.innerHTML = faixaAviso("Não consegui ler o histórico de envios: " + (res.mensagem || ""), "erro");
    return;
  }
  if(res.dados.length === 0){
    area.innerHTML = '<p class="vazio-explicacao">Nenhum envio ainda. Quando alguém comentar a palavra de uma automação ligada, o resultado aparece aqui (enviado, erro, na fila ou pulado).</p>';
    return;
  }

  // Troca o número do Instagram pelo @ da pessoa, quando a gente já sabe.
  var ids = res.dados.map(function(d){ return d.ig_user_id; }).filter(Boolean);
  var resLeads = ids.length > 0 ? await buscarSeguro(banco.from("ig_leads").select("ig_user_id, username").in("ig_user_id", ids)) : { ok: true, dados: [] };
  var nomes = {};
  (resLeads.dados || []).forEach(function(l){ if(l.username) nomes[l.ig_user_id] = "@" + l.username; });

  area.innerHTML = '<div class="tabela-scroll"><table><thead><tr><th>Quando</th><th>Pessoa</th><th>Situação</th><th>Detalhe</th></tr></thead><tbody>' +
    res.dados.map(function(d){
      return '<tr><td style="white-space:nowrap;">' + escapa(formatarDataHora(d.ts)) + '</td>' +
        '<td>' + escapa(nomes[d.ig_user_id] || d.ig_user_id || "-") + '</td>' +
        '<td>' + igPillStatus(d.status) + '</td>' +
        '<td style="color:#6F554B;">' + escapa(d.motivo || "") + '</td></tr>';
    }).join("") + '</tbody></table></div>';
}

/* ============================================================================
   O EDITOR DE AUTOMAÇÃO
============================================================================ */

/* ---------- o estado do editor ---------- */
function igEstadoVazio(){
  return {
    id: null, nome: "", ativa: true,
    palavras: [], qualquer: false, posts: [],
    respostaPublica: "", variantes: [],
    mensagem: "", comBotao: true, textoBotao: "Quero receber",
    acao: "link",                // "link" ou "conversa"
    link: "",
    arquivos: [],                // ids de ig_assets anexados na Mensagem 1
    sequencia: [],               // Mensagem 2, 3, ... (cada uma: uid, mensagem, arquivos, botoes)
    proximoUid: 2
  };
}

function igBotaoVazio(destino, paraUid){
  return { nome: "", destino: destino || "encerrar", paraUid: paraUid || null, link: "" };
}

// Lê uma automação salva e monta o estado do editor.
function igAutomacaoParaEstado(a){
  var e = igEstadoVazio();
  e.id = a.id;
  e.nome = a.nome || "";
  e.ativa = a.active !== false;
  e.palavras = String(a.keyword || "").split(",").map(function(p){ return p.trim(); }).filter(Boolean);
  e.qualquer = !!a.match_any;
  e.posts = (a.media_ids || []).slice();
  e.respostaPublica = a.public_reply || "";
  e.variantes = (a.public_reply_variants || []).slice();

  var passos = (a.flow && a.flow.steps) || [];
  var p1 = passos[0];
  if(p1){
    e.mensagem = p1.message || "";
    var botao1 = (p1.buttons || [])[0];
    e.comBotao = !!botao1;
    if(botao1){
      e.textoBotao = botao1.title || "";
      if(botao1.url){ e.acao = "link"; e.link = botao1.url; }
      else { e.acao = "conversa"; }
    }
    e.arquivos = ((p1.assets && p1.assets.length) ? p1.assets : (a.asset_ids || [])).slice();
  }

  var maiorUid = 1;
  passos.slice(1).forEach(function(p){
    var uid = Number(p.id);
    if(!isFinite(uid) || uid <= maiorUid) uid = maiorUid + 1;
    maiorUid = uid;
    e.sequencia.push({
      uid: uid,
      mensagem: p.message || "",
      arquivos: (p.assets || []).slice(),
      botoes: (p.buttons || []).map(function(b){
        if(b.url) return { nome: b.title || "", destino: "link", paraUid: null, link: b.url };
        if(b.next !== undefined && b.next !== null && b.next !== "") return { nome: b.title || "", destino: "mensagem", paraUid: Number(b.next), link: "" };
        return { nome: b.title || "", destino: "encerrar", paraUid: null, link: "" };
      })
    });
  });
  // Os "next" guardam o id do passo; como a sequência começa no id 2, ids e uids batem.
  e.proximoUid = maiorUid + 1;
  return e;
}

function igParecelink(texto){
  return /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(String(texto || ""));
}

function igNormalizarLink(texto){
  var t = String(texto || "").trim();
  if(!t) return "";
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

function igLinkValido(texto){
  try{
    var u = new URL(igNormalizarLink(texto));
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.indexOf(".") !== -1;
  }catch(e){
    return false;
  }
}

// Transforma o estado do editor na conversa ("flow") que o servidor entende.
// Mensagem 1 é sempre o primeiro passo (id 1); as da sequência são 2, 3, ...
function igEstadoParaFluxo(e){
  var idDe = {};
  e.sequencia.forEach(function(m, i){ idDe[m.uid] = i + 2; });

  var botoes1 = [];
  if(e.comBotao){
    var titulo = e.textoBotao.trim();
    if(e.acao === "link") botoes1.push({ title: titulo, url: igNormalizarLink(e.link) });
    else if(e.sequencia.length > 0) botoes1.push({ title: titulo, next: 2 });
  }
  var primeiro = { id: 1, message: e.mensagem.trim(), buttons: botoes1 };
  if(e.arquivos.length > 0) primeiro.assets = e.arquivos.slice();
  var passos = [primeiro];

  if(e.comBotao && e.acao === "conversa"){
    e.sequencia.forEach(function(m, i){
      var botoes = m.botoes.map(function(b){
        var titulo = b.nome.trim();
        if(b.destino === "link") return { title: titulo, url: igNormalizarLink(b.link) };
        if(b.destino === "mensagem" && b.paraUid && idDe[b.paraUid]) return { title: titulo, next: idDe[b.paraUid] };
        return { title: titulo };                      // sem destino: encerra, não é enviado
      });
      var passo = { id: i + 2, message: m.mensagem.trim(), buttons: botoes };
      if(m.arquivos.length > 0) passo.assets = m.arquivos.slice();
      passos.push(passo);
    });
  }
  return { steps: passos };
}

// Quantas letras cabem numa mensagem: com botão anexado o Instagram aceita menos.
function igLimiteDaMensagem(temBotao){
  return temBotao ? IG_LIMITE_MSG_COM_BOTAO : IG_LIMITE_MSG;
}

// Confere o que falta antes de salvar. Devolve uma lista de problemas (vazia = tudo certo).
function igValidar(e){
  var erros = [];
  if(!e.qualquer && e.palavras.length === 0) erros.push("Escolha pelo menos uma palavra que ativa a automação, ou ligue \"Qualquer palavra ativa\".");
  if(!e.mensagem.trim()) erros.push("Escreva a sua mensagem (a DM que a pessoa recebe).");
  else if(e.mensagem.length > igLimiteDaMensagem(e.comBotao)) erros.push("A sua mensagem passou de " + igLimiteDaMensagem(e.comBotao) + " letras (limite do Instagram" + (e.comBotao ? " com botão" : "") + "). Encurte um pouco.");
  if(e.comBotao){
    if(!e.textoBotao.trim()) erros.push("Escreva o texto do botão (ou desligue \"Botão na mensagem\").");
    if(e.acao === "link"){
      if(!e.link.trim()) erros.push("Cole o link que o botão abre.");
      else if(!igLinkValido(e.link)) erros.push("O link do botão não parece um endereço de site válido.");
    } else {
      if(e.sequencia.length === 0) erros.push("Você escolheu \"Continua a conversa\": adicione a Mensagem 2.");
      e.sequencia.forEach(function(m, i){
        var n = i + 2;
        if(!m.mensagem.trim()) erros.push("A Mensagem " + n + " está vazia.");
        else if(m.mensagem.length > igLimiteDaMensagem(m.botoes.length > 0)) erros.push("A Mensagem " + n + " passou de " + igLimiteDaMensagem(m.botoes.length > 0) + " letras (limite do Instagram). Encurte um pouco.");
        m.botoes.forEach(function(b, j){
          var nomeBotao = "botão " + (j + 1) + " da Mensagem " + n;
          if(!b.nome.trim()) erros.push("Dê um nome ao " + nomeBotao + ".");
          if(b.destino === "link" && !igLinkValido(b.link)) erros.push("Cole um link válido no " + nomeBotao + ".");
          if(b.destino === "mensagem" && !b.paraUid) erros.push("Escolha pra qual mensagem o " + nomeBotao + " vai.");
        });
      });
    }
  }
  return erros;
}

/* ---------- carregar posts e arquivos ---------- */
async function igCarregarPosts(){
  if(igPostsCache) return igPostsCache;
  var r = await igChamarFuncao("ig-media");
  if(!r.ok){
    return { conectado: false, posts: [], motivo: igTextoFuncaoIndisponivel("ig-media", r.mensagem) };
  }
  var dados = { conectado: !!r.dados.conectado, posts: r.dados.posts || [], motivo: r.dados.motivo || "" };
  if(dados.conectado) igPostsCache = dados;       // só guarda se deu certo, pra tentar de novo depois
  return dados;
}

async function igCarregarAssets(){
  var r = await buscarSeguro(banco.from("ig_assets").select("*").order("created_at", { ascending: false }));
  igAssets = r.ok ? r.dados : [];
  return r;
}

function igTamanhoLegivel(bytes){
  if(!bytes) return "";
  if(bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
}

function igRotuloTipoArquivo(tipo){
  return { image: "Foto", audio: "Áudio", video: "Vídeo", file: "Arquivo" }[tipo] || "Arquivo";
}

/* ---------- abrir o editor ---------- */
async function igAbrirEditor(automacao){
  igEd = automacao ? igAutomacaoParaEstado(automacao) : igEstadoVazio();
  igEdSujo = false;
  await igCarregarAssets();

  abrirModal(igHtmlEditor(), true);
  modalBox.style.maxWidth = "1080px";
  guardaFecharModal = function(){
    if(!igEdSujo) return true;
    return confirm("Você tem alterações que ainda não foram salvas. Sair mesmo assim?");
  };

  igLigarEditor();
  igAtualizarPrevia();
  igCarregarPostsNoEditor();
}

function igHtmlEditor(){
  var e = igEd;
  return '<p class="form-titulo">' + (e.id ? "Editar automação" : "Nova automação") + '</p>' +
  '<div class="ig-editor-grade">' +
    '<div class="ig-coluna-form">' +
      '<div class="campo"><label for="igNome">Nome da automação (só pra você se achar)</label>' +
        '<input id="igNome" maxlength="80" placeholder="Ex: Guia grátis de roteiros" value="' + igAttr(e.nome) + '"></div>' +

      /* ---------- BLOCO 1: O GATILHO ---------- */
      '<div class="ig-bloco">' +
        '<div class="ig-bloco-titulo"><span class="ig-num">1</span> O gatilho: o que faz a DM disparar</div>' +

        '<div class="campo"><label for="igPalavraNova">Palavras que ativam</label>' +
          '<div class="ig-tags" id="igTags"></div>' +
          '<p class="ig-ajuda">Digite a palavra e aperte Enter. A pessoa precisa comentar a palavra inteira (sem se importar com maiúscula ou acento).</p></div>' +

        '<div class="campo"><label class="linha-interruptor"><span class="interruptor"><input type="checkbox" id="igQualquer" ' + (e.qualquer ? "checked" : "") + '><span class="trilho"></span></span> Qualquer palavra ativa</label>' +
          '<p class="ig-ajuda">Ligado: qualquer comentário nos posts escolhidos dispara a DM, e as palavras acima são ignoradas.</p></div>' +

        '<div class="campo"><label>Em quais posts</label>' +
          '<div id="igAreaPosts"><p class="ig-ajuda">Carregando seus posts...</p></div>' +
          '<p class="ig-ajuda">Nenhum marcado = vale pra todos os posts.</p></div>' +

        '<div class="campo"><label for="igRespostaPublica">Resposta no comentário (opcional)</label>' +
          '<textarea id="igRespostaPublica" rows="2" maxlength="300" placeholder="Ex: Te chamei no direct!">' + escapa(e.respostaPublica) + '</textarea>' +
          '<div id="igVariantes"></div>' +
          '<button type="button" class="btn btn-pequeno" id="btnAddVariante" style="margin-top:8px;">' + icone("mais") + ' Adicionar variação (A/B)</button>' +
          '<p class="ig-ajuda">Com variações, o sistema alterna entre os textos, pra os comentários não ficarem todos iguais.</p></div>' +
      '</div>' +

      /* ---------- BLOCO 2: A RESPOSTA ---------- */
      '<div class="ig-bloco">' +
        '<div class="ig-bloco-titulo"><span class="ig-num">2</span> A resposta: o que a pessoa recebe na DM</div>' +

        '<div class="campo"><label for="igMensagem">Sua mensagem</label>' +
          '<textarea id="igMensagem" rows="5" placeholder="Oi! Que bom que você comentou. Aqui está o que você pediu...">' + escapa(e.mensagem) + '</textarea>' +
          '<div class="ig-emojis" id="igEmojis"></div>' +
          '<div class="ig-contador" id="igContadorMsg"></div></div>' +

        '<div class="campo"><label class="linha-interruptor"><span class="interruptor"><input type="checkbox" id="igComBotao" ' + (e.comBotao ? "checked" : "") + '><span class="trilho"></span></span> Botão na mensagem</label></div>' +

        '<div id="igAreaBotao"></div>' +

        '<div class="campo"><label>Anexar um arquivo (opcional)</label>' +
          '<div id="igAreaArquivos"></div>' +
          '<input type="file" id="igArquivoNovo" class="oculto">' +
          '<button type="button" class="btn btn-pequeno" id="btnEnviarArquivo" style="margin-top:8px;">' + icone("baixar") + ' Enviar arquivo novo</button>' +
          '<p class="ig-ajuda" id="igAvisoArquivo">PDF, áudio, foto ou vídeo, até 25 MB. O Instagram pode recusar arquivo na primeira mensagem de um comentário. Se isso acontecer, o motivo aparece em "Últimos envios", e o jeito mais seguro é mandar o arquivo numa mensagem depois do toque no botão (Continua a conversa).</p></div>' +
      '</div>' +

      '<div id="igErroEditor" class="ig-erro-editor"></div>' +
      '<div class="form-acoes">' +
        '<button type="button" class="btn" id="btnCancelarEditorIg">Cancelar</button>' +
        '<button type="button" class="btn btn-principal" id="btnSalvarEditorIg">Salvar automação</button>' +
      '</div>' +
    '</div>' +

    '<div class="ig-coluna-previa">' +
      '<div class="ig-celular" aria-label="Prévia da conversa no celular">' +
        '<div class="ig-cel-topo"><span class="ig-avatar">LC</span><div><strong>sua conta</strong><small>Mensagens diretas</small></div></div>' +
        '<div class="ig-cel-conversa" id="igPrevia"></div>' +
      '</div>' +
      '<p class="ig-previa-legenda">Prévia ao vivo: é assim que a conversa chega.</p>' +
    '</div>' +
  '</div>';
}

/* ---------- ligar todos os campos do editor ---------- */
function igMarcarSujo(){ igEdSujo = true; }

function igLigarEditor(){
  var e = igEd;

  // nome
  document.getElementById("igNome").addEventListener("input", function(ev){ e.nome = ev.target.value; igMarcarSujo(); });

  // palavras (tags)
  igRenderTags();

  // qualquer palavra
  document.getElementById("igQualquer").addEventListener("change", function(ev){
    e.qualquer = ev.target.checked; igMarcarSujo(); igRenderTags(); igAtualizarPrevia();
  });

  // resposta pública e variações
  document.getElementById("igRespostaPublica").addEventListener("input", function(ev){ e.respostaPublica = ev.target.value; igMarcarSujo(); });
  igRenderVariantes();
  document.getElementById("btnAddVariante").addEventListener("click", function(){
    if(e.variantes.length >= 4) return;
    e.variantes.push(""); igMarcarSujo(); igRenderVariantes();
  });

  // mensagem 1 + emojis
  var campoMsg = document.getElementById("igMensagem");
  campoMsg.addEventListener("input", function(ev){ e.mensagem = ev.target.value; igMarcarSujo(); igAtualizarContador(); igAtualizarReferencia(); igAtualizarPrevia(); });
  var barraEmojis = document.getElementById("igEmojis");
  IG_EMOJIS.forEach(function(emoji){
    var b = el('<button type="button" title="Inserir ' + emoji + '">' + emoji + '</button>');
    b.addEventListener("click", function(){ igInserirNoCursor(campoMsg, emoji); e.mensagem = campoMsg.value; igMarcarSujo(); igAtualizarContador(); igAtualizarReferencia(); igAtualizarPrevia(); });
    barraEmojis.appendChild(b);
  });
  igAtualizarContador();

  // botão da mensagem 1
  document.getElementById("igComBotao").addEventListener("change", function(ev){
    e.comBotao = ev.target.checked; igMarcarSujo(); igRenderAreaBotao(); igAtualizarContador(); igAtualizarPrevia();
  });
  igRenderAreaBotao();

  // arquivos
  igRenderArquivos();
  var inputArquivo = document.getElementById("igArquivoNovo");
  document.getElementById("btnEnviarArquivo").addEventListener("click", function(){ inputArquivo.click(); });
  inputArquivo.addEventListener("change", function(){
    if(inputArquivo.files && inputArquivo.files[0]) igEnviarArquivo(inputArquivo.files[0]);
    inputArquivo.value = "";
  });

  // salvar / cancelar
  document.getElementById("btnCancelarEditorIg").addEventListener("click", tentarFecharModal);
  document.getElementById("btnSalvarEditorIg").addEventListener("click", igSalvarEditor);
}

function igInserirNoCursor(campo, texto){
  var ini = campo.selectionStart, fim = campo.selectionEnd;
  if(typeof ini !== "number"){ campo.value += texto; return; }
  campo.value = campo.value.slice(0, ini) + texto + campo.value.slice(fim);
  campo.focus();
  campo.selectionStart = campo.selectionEnd = ini + texto.length;
}

function igAtualizarContador(){
  var e = igEd;
  var contador = document.getElementById("igContadorMsg");
  var campo = document.getElementById("igMensagem");
  if(!contador || !campo) return;
  var limite = e.comBotao ? IG_LIMITE_MSG_COM_BOTAO : IG_LIMITE_MSG;
  campo.maxLength = limite;
  var tamanho = e.mensagem.length;
  contador.textContent = tamanho + " / " + limite + (e.comBotao ? " (com botão, o Instagram aceita até " + IG_LIMITE_MSG_COM_BOTAO + " letras)" : "");
  contador.classList.toggle("estourou", tamanho > limite);
}

/* ---------- tags (palavras que ativam) ---------- */
function igRenderTags(){
  var e = igEd;
  var caixa = document.getElementById("igTags");
  caixa.innerHTML = "";
  e.palavras.forEach(function(p, i){
    var tag = el('<span class="ig-tag">' + escapa(p) + '<button type="button" aria-label="Remover ' + igAttr(p) + '">×</button></span>');
    tag.querySelector("button").addEventListener("click", function(){ e.palavras.splice(i, 1); igMarcarSujo(); igRenderTags(); igAtualizarPrevia(); });
    caixa.appendChild(tag);
  });
  var campo = el('<input id="igPalavraNova" placeholder="' + (e.palavras.length ? "Outra palavra..." : "Ex: quero") + '" ' + (e.qualquer ? "disabled" : "") + '>');
  var adicionar = function(refocar){
    var partes = campo.value.split(",").map(function(p){ return p.trim(); }).filter(Boolean);
    var mudou = false;
    partes.forEach(function(p){
      var ja = e.palavras.some(function(x){ return x.toLowerCase() === p.toLowerCase(); });
      if(!ja){ e.palavras.push(p); mudou = true; }
    });
    campo.value = "";
    if(mudou){
      igMarcarSujo(); igRenderTags(); igAtualizarPrevia();
      if(refocar) document.getElementById("igPalavraNova").focus();
    }
  };
  campo.addEventListener("keydown", function(ev){
    if(ev.key === "Enter" || ev.key === ","){ ev.preventDefault(); adicionar(true); }
    else if(ev.key === "Backspace" && campo.value === "" && e.palavras.length > 0){ e.palavras.pop(); igMarcarSujo(); igRenderTags(); igAtualizarPrevia(); document.getElementById("igPalavraNova").focus(); }
  });
  campo.addEventListener("blur", function(){ adicionar(false); });
  caixa.appendChild(campo);
  caixa.style.opacity = e.qualquer ? ".5" : "1";
}

/* ---------- variações A/B da resposta pública ---------- */
function igRenderVariantes(){
  var e = igEd;
  var area = document.getElementById("igVariantes");
  area.innerHTML = "";
  e.variantes.forEach(function(texto, i){
    var linha = el('<div style="display:flex; gap:6px; margin-top:8px; align-items:flex-start;">' +
      '<textarea rows="2" maxlength="300" placeholder="Variação ' + (i + 2) + '" style="flex:1; border:1.5px solid #E2D4BF; border-radius:8px; padding:9px 10px; background:var(--creme); resize:vertical;">' + escapa(texto) + '</textarea>' +
      '<button type="button" class="btn btn-icone btn-perigo" title="Remover variação">' + icone("lixeira") + '</button></div>');
    linha.querySelector("textarea").addEventListener("input", function(ev){ e.variantes[i] = ev.target.value; igMarcarSujo(); });
    linha.querySelector("button").addEventListener("click", function(){ e.variantes.splice(i, 1); igMarcarSujo(); igRenderVariantes(); });
    area.appendChild(linha);
  });
  var botao = document.getElementById("btnAddVariante");
  if(botao) botao.classList.toggle("oculto", e.variantes.length >= 4);
}

/* ---------- posts ---------- */
async function igCarregarPostsNoEditor(){
  var e = igEd;
  var dados = await igCarregarPosts();
  var area = document.getElementById("igAreaPosts");
  if(!area || igEd !== e) return;                    // o editor foi fechado (ou trocado) enquanto carregava

  if(!dados.conectado){
    area.innerHTML = '<p class="ig-ajuda">Não consegui listar seus posts' + (dados.motivo ? ": " + escapa(dados.motivo) : ".") +
      ' Você ainda pode salvar a automação; sem posts marcados ela vale pra todos.</p>' +
      (e.posts.length > 0 ? '<p class="ig-ajuda">Esta automação tem ' + e.posts.length + ' post(s) escolhido(s) antes.</p>' : "");
    return;
  }
  if(dados.posts.length === 0){
    area.innerHTML = '<p class="ig-ajuda">Nenhum post encontrado na sua conta.</p>';
    return;
  }

  var grade = el('<div class="ig-posts"></div>');
  dados.posts.forEach(function(p){
    var botao = el('<button type="button" class="ig-post ' + (e.posts.indexOf(p.id) !== -1 ? "marcado" : "") + '" title="' + igAttr(p.legenda || "Post sem legenda") + '">' +
      (p.miniatura ? '<img src="' + igAttr(p.miniatura) + '" alt="" loading="lazy">' : '<span class="ig-sem-imagem">' + escapa(p.tipo || "Post") + '</span>') +
      '<span class="ig-marca"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg></span>' +
      '<span class="ig-legenda">' + escapa((p.legenda || "").slice(0, 60)) + '</span></button>');
    botao.addEventListener("click", function(){
      var idx = e.posts.indexOf(p.id);
      if(idx === -1) e.posts.push(p.id); else e.posts.splice(idx, 1);
      botao.classList.toggle("marcado", idx === -1);
      igMarcarSujo();
    });
    grade.appendChild(botao);
  });
  area.innerHTML = "";
  area.appendChild(grade);
}

/* ---------- o botão da Mensagem 1 e a sequência ---------- */
function igRenderAreaBotao(){
  var e = igEd;
  var area = document.getElementById("igAreaBotao");
  if(!e.comBotao){
    area.innerHTML = '<p class="ig-ajuda" style="margin:-6px 0 14px;">Sem botão: a pessoa recebe só a mensagem, e a conversa termina ali.</p>';
    return;
  }

  area.innerHTML =
    '<div class="campo"><label for="igTextoBotao">Texto do botão</label>' +
      '<input id="igTextoBotao" placeholder="Ex: Quero receber" value="' + igAttr(e.textoBotao) + '">' +
      '<div class="ig-contador" id="igContadorBotao"></div></div>' +
    '<div class="campo"><label>O que o botão faz quando ela toca</label>' +
      '<div class="modo-toggle">' +
        '<button type="button" data-acao="link" class="' + (e.acao === "link" ? "ativo" : "") + '">Um link</button>' +
        '<button type="button" data-acao="conversa" class="' + (e.acao === "conversa" ? "ativo" : "") + '">Continua a conversa</button>' +
      '</div></div>' +
    '<div id="igAreaAcao"></div>';

  var campoTexto = document.getElementById("igTextoBotao");
  var contador = document.getElementById("igContadorBotao");
  var atualizar = function(){ contador.textContent = campoTexto.value.length + " / " + IG_LIMITE_BOTAO; };
  atualizar();
  campoTexto.addEventListener("input", function(ev){
    var valor = ev.target.value;
    // Colar um link aqui não faz sentido: o nome do botão é curto (20 letras).
    // Manda o link pro campo certo e deixa um nome padrão.
    if(igParecelink(valor)){
      e.link = valor.trim(); e.acao = "link"; valor = "Acessar";
      campoTexto.value = valor; e.textoBotao = valor;
      igMarcarSujo(); igRenderAreaBotao(); igAtualizarPrevia();
      return;
    }
    if(valor.length > IG_LIMITE_BOTAO){ valor = valor.slice(0, IG_LIMITE_BOTAO); campoTexto.value = valor; }
    e.textoBotao = valor; atualizar(); igMarcarSujo(); igAtualizarReferencia(); igAtualizarPrevia();
  });

  area.querySelectorAll(".modo-toggle button").forEach(function(b){
    b.addEventListener("click", function(){
      var nova = b.getAttribute("data-acao");
      if(nova === e.acao) return;
      e.acao = nova;
      // Ao escolher "continua a conversa" pela primeira vez, já cria a Mensagem 2.
      if(nova === "conversa" && e.sequencia.length === 0) igAdicionarMensagem();
      igMarcarSujo(); igRenderAreaBotao(); igAtualizarPrevia();
    });
  });

  igRenderAreaAcao();
}

function igRenderAreaAcao(){
  var e = igEd;
  var area = document.getElementById("igAreaAcao");
  if(e.acao === "link"){
    area.innerHTML =
      '<div class="campo"><label for="igLinkBotao">Link que o botão abre</label>' +
        '<textarea id="igLinkBotao" class="ig-link-grande" rows="3" placeholder="Cole aqui o link completo, por maior que seja">' + escapa(e.link) + '</textarea>' +
        '<p class="ig-ajuda">O link vai só aqui. A pessoa vê apenas o nome do botão, o endereço fica escondido.</p></div>';
    document.getElementById("igLinkBotao").addEventListener("input", function(ev){ e.link = ev.target.value; igMarcarSujo(); igAtualizarPrevia(); });
    return;
  }

  // Continua a conversa: a Mensagem 1 aparece como referência e dá pra montar da 2 em diante.
  var html = '<div class="ig-msg-card referencia">' +
    '<div class="ig-msg-topo"><span>Mensagem 1</span></div>' +
    '<p id="igRefMsg" style="font-size:.78rem; white-space:pre-wrap; margin-bottom:6px;"></p>' +
    '<p style="font-size:.74rem; color:#6F554B;">Botão: <strong id="igRefBotao"></strong> (leva pra Mensagem 2)</p>' +
    '<p class="ig-ajuda">Pra editar a Mensagem 1, mude "Sua mensagem" e "Texto do botão" aqui em cima.</p>' +
  '</div>';
  html += '<div id="igSequencia"></div>';
  html += '<button type="button" class="btn btn-pequeno" id="btnAddMensagem">' + icone("mais") + ' Adicionar mensagem</button>';
  area.innerHTML = html;
  igAtualizarReferencia();
  igRenderSequencia();
  document.getElementById("btnAddMensagem").addEventListener("click", function(){
    igAdicionarMensagem(); igMarcarSujo(); igRenderSequencia(); igAtualizarPrevia();
  });
}

// O cartão "Mensagem 1" (só leitura) acompanha o que está sendo digitado lá em cima.
function igAtualizarReferencia(){
  var e = igEd;
  var msg = document.getElementById("igRefMsg");
  var botao = document.getElementById("igRefBotao");
  if(!msg || !botao) return;
  if(e.mensagem.trim()){
    msg.textContent = e.mensagem.length > 140 ? e.mensagem.slice(0, 140) + "..." : e.mensagem;
    msg.style.color = "";
    msg.style.fontStyle = "";
  } else {
    msg.textContent = "Escreva a sua mensagem acima.";
    msg.style.color = "#8A7468";
    msg.style.fontStyle = "italic";
  }
  botao.textContent = e.textoBotao || "(sem texto)";
}

function igAdicionarMensagem(){
  var e = igEd;
  e.sequencia.push({ uid: e.proximoUid++, mensagem: "", arquivos: [], botoes: [] });
}

function igRenderSequencia(){
  var e = igEd;
  var area = document.getElementById("igSequencia");
  if(!area) return;
  area.innerHTML = "";

  e.sequencia.forEach(function(m, i){
    var numero = i + 2;
    var card = el('<div class="ig-msg-card"></div>');
    card.innerHTML =
      '<div class="ig-msg-topo"><span>Mensagem ' + numero + '</span>' +
        '<button type="button" class="btn btn-icone btn-perigo" data-remover title="Remover esta mensagem">' + icone("lixeira") + '</button></div>' +
      '<textarea rows="3" placeholder="O que a pessoa recebe nesta mensagem (até ' + IG_LIMITE_MSG_COM_BOTAO + ' letras se tiver botão)">' + escapa(m.mensagem) + '</textarea>' +
      '<div class="ig-botoes-lista" style="margin-top:10px;"></div>' +
      '<button type="button" class="btn btn-pequeno" data-add-botao>' + icone("mais") + ' Adicionar botão</button>' +
      '<div style="margin-top:10px;">' + igHtmlSelectArquivo(m) + '</div>';

    card.querySelector("textarea").addEventListener("input", function(ev){ m.mensagem = ev.target.value; igMarcarSujo(); igAtualizarPrevia(); });
    card.querySelector("[data-remover]").addEventListener("click", function(){
      e.sequencia.splice(i, 1);
      // Botões que apontavam pra essa mensagem ficam sem destino.
      e.sequencia.forEach(function(outra){ outra.botoes.forEach(function(b){ if(b.destino === "mensagem" && b.paraUid === m.uid) b.paraUid = null; }); });
      igMarcarSujo(); igRenderSequencia(); igAtualizarPrevia();
    });

    var listaBotoes = card.querySelector(".ig-botoes-lista");
    m.botoes.forEach(function(b, j){ listaBotoes.appendChild(igCardBotao(m, b, j)); });

    var addBotao = card.querySelector("[data-add-botao]");
    addBotao.classList.toggle("oculto", m.botoes.length >= IG_MAX_BOTOES);
    addBotao.addEventListener("click", function(){
      // O destino sugerido é a mensagem seguinte, se existir.
      var seguinte = e.sequencia[i + 1];
      m.botoes.push(igBotaoVazio(seguinte ? "mensagem" : "encerrar", seguinte ? seguinte.uid : null));
      igMarcarSujo(); igRenderSequencia(); igAtualizarPrevia();
    });

    var seletor = card.querySelector("[data-arquivo]");
    if(seletor) seletor.addEventListener("change", function(ev){
      m.arquivos = ev.target.value ? [ev.target.value] : [];
      igMarcarSujo(); igAtualizarPrevia();
    });

    area.appendChild(card);
  });
}

function igHtmlSelectArquivo(m){
  if(igAssets.length === 0) return '<p class="ig-ajuda">Pra anexar um arquivo nesta mensagem, envie um arquivo na biblioteca (na "Sua mensagem", mais acima).</p>';
  var atual = m.arquivos[0] || "";
  return '<label style="font-size:.74rem; font-weight:700; display:block; margin-bottom:4px;">Anexar um arquivo (opcional)</label>' +
    '<select data-arquivo><option value="">Sem arquivo</option>' +
    igAssets.map(function(a){
      return '<option value="' + igAttr(a.id) + '" ' + (atual === a.id ? "selected" : "") + '>' + escapa(igRotuloTipoArquivo(a.tipo) + ": " + a.nome) + '</option>';
    }).join("") + '</select>';
}

// Um botão da sequência: nome (20 letras) + pra onde vai.
function igCardBotao(m, b, indice){
  var e = igEd;
  var outras = e.sequencia.filter(function(x){ return x.uid !== m.uid; });
  var rotuloMsg = function(x){ return "Mensagem " + (e.sequencia.indexOf(x) + 2); };

  var card = el('<div class="ig-botao-card"></div>');
  card.innerHTML =
    '<div class="ig-botao-linha">' +
      '<input data-nome placeholder="Nome do botão" value="' + igAttr(b.nome) + '">' +
      '<select data-destino>' +
        '<option value="mensagem" ' + (b.destino === "mensagem" ? "selected" : "") + '>ir pra outra mensagem</option>' +
        '<option value="link" ' + (b.destino === "link" ? "selected" : "") + '>abrir um link</option>' +
        '<option value="encerrar" ' + (b.destino === "encerrar" ? "selected" : "") + '>encerrar</option>' +
      '</select>' +
      '<button type="button" class="btn btn-icone btn-perigo" data-remover title="Remover botão">' + icone("lixeira") + '</button>' +
    '</div>' +
    '<div class="ig-sub" data-sub></div>';

  var nomeInput = card.querySelector("[data-nome]");
  var sub = card.querySelector("[data-sub]");

  var desenharSub = function(){
    if(b.destino === "mensagem"){
      if(outras.length === 0){
        sub.innerHTML = '<p class="ig-ajuda">Ainda não existe outra mensagem. Use "Adicionar mensagem" pra criar a próxima.</p>';
      } else {
        sub.innerHTML = '<select data-para><option value="">Escolha a mensagem...</option>' +
          outras.map(function(x){ return '<option value="' + x.uid + '" ' + (b.paraUid === x.uid ? "selected" : "") + '>' + rotuloMsg(x) + '</option>'; }).join("") + '</select>';
        sub.querySelector("[data-para]").addEventListener("change", function(ev){ b.paraUid = ev.target.value ? Number(ev.target.value) : null; igMarcarSujo(); igAtualizarPrevia(); });
      }
    } else if(b.destino === "link"){
      // O campo do link aparece NA HORA, mesmo vazio, e fica guardado no estado do botão.
      sub.innerHTML = '<textarea data-link class="ig-link-grande" rows="3" placeholder="Cole aqui o link completo">' + escapa(b.link) + '</textarea>' +
        '<p class="ig-ajuda">A pessoa vê só o nome do botão.</p>';
      sub.querySelector("[data-link]").addEventListener("input", function(ev){ b.link = ev.target.value; igMarcarSujo(); igAtualizarPrevia(); });
    } else {
      sub.innerHTML = '<p class="ig-ajuda">Encerrar: a conversa acaba aqui. Um botão assim não aparece pra pessoa.</p>';
    }
  };
  desenharSub();

  nomeInput.addEventListener("input", function(ev){
    var valor = ev.target.value;
    // Link colado no NOME do botão: vai pro campo do link e o nome vira "Acessar".
    if(igParecelink(valor)){
      b.link = valor.trim(); b.destino = "link"; b.nome = "Acessar";
      nomeInput.value = "Acessar"; card.querySelector("[data-destino]").value = "link";
      desenharSub(); igMarcarSujo(); igAtualizarPrevia();
      return;
    }
    if(valor.length > IG_LIMITE_BOTAO){ valor = valor.slice(0, IG_LIMITE_BOTAO); nomeInput.value = valor; }
    b.nome = valor; igMarcarSujo(); igAtualizarPrevia();
  });

  card.querySelector("[data-destino]").addEventListener("change", function(ev){
    b.destino = ev.target.value;
    // Se o nome do botão está com um link (colado antes), move pro campo certo.
    if(b.destino === "link" && igParecelink(b.nome)){ b.link = b.nome.trim(); b.nome = "Acessar"; nomeInput.value = b.nome; }
    else if(b.destino === "link" && !b.nome.trim()){ b.nome = "Acessar"; nomeInput.value = b.nome; }
    if(b.destino === "mensagem" && !b.paraUid && outras.length > 0){
      var depois = e.sequencia[e.sequencia.indexOf(m) + 1];
      b.paraUid = depois ? depois.uid : outras[0].uid;
    }
    desenharSub(); igMarcarSujo(); igAtualizarPrevia();
  });

  card.querySelector("[data-remover]").addEventListener("click", function(){
    m.botoes.splice(indice, 1); igMarcarSujo(); igRenderSequencia(); igAtualizarPrevia();
  });
  return card;
}

/* ---------- a biblioteca de arquivos ---------- */
function igRenderArquivos(){
  var e = igEd;
  var area = document.getElementById("igAreaArquivos");
  if(!area) return;
  if(igAssets.length === 0){
    area.innerHTML = '<p class="ig-ajuda">Nenhum arquivo na biblioteca ainda.</p>';
    return;
  }
  area.innerHTML = "";
  igAssets.forEach(function(a){
    var linha = el('<div class="ig-arquivo">' +
      '<input type="checkbox" ' + (e.arquivos.indexOf(a.id) !== -1 ? "checked" : "") + ' aria-label="Anexar ' + igAttr(a.nome) + '">' +
      '<span class="ig-nome" title="' + igAttr(a.nome) + '">' + escapa(a.nome) + '</span>' +
      '<span class="ig-meta">' + igRotuloTipoArquivo(a.tipo) + (a.size_bytes ? " · " + igTamanhoLegivel(a.size_bytes) : "") + '</span>' +
      '<button type="button" class="btn btn-icone btn-perigo" title="Apagar da biblioteca">' + icone("lixeira") + '</button></div>');
    linha.querySelector("input").addEventListener("change", function(ev){
      var idx = e.arquivos.indexOf(a.id);
      if(ev.target.checked && idx === -1) e.arquivos.push(a.id);
      if(!ev.target.checked && idx !== -1) e.arquivos.splice(idx, 1);
      igMarcarSujo(); igAtualizarPrevia();
    });
    linha.querySelector("button").addEventListener("click", function(){ igApagarArquivo(a); });
    area.appendChild(linha);
  });
}

function igTipoDoArquivo(arquivo){
  var tipo = String(arquivo.type || "");
  if(tipo.indexOf("image/") === 0) return "image";
  if(tipo.indexOf("audio/") === 0) return "audio";
  if(tipo.indexOf("video/") === 0) return "video";
  return "file";
}

async function igEnviarArquivo(arquivo){
  var e = igEd;
  var aviso = document.getElementById("igAvisoArquivo");
  var botao = document.getElementById("btnEnviarArquivo");
  if(arquivo.size > IG_MAX_ARQUIVO_BYTES){
    aviso.textContent = "Esse arquivo tem " + igTamanhoLegivel(arquivo.size) + ". O limite é 25 MB.";
    return;
  }
  botao.disabled = true;
  var textoOriginal = botao.innerHTML;
  botao.textContent = "Enviando...";

  // O nome do arquivo guardado no Supabase não pode ter acento nem espaço.
  var nomeSeguro = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-");
  var caminho = Date.now() + "-" + nomeSeguro;

  try{
    var envio = await banco.storage.from("ig-arquivos").upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
    if(envio.error) throw envio.error;
    var url = banco.storage.from("ig-arquivos").getPublicUrl(caminho).data.publicUrl;
    var r = await buscarSeguro(banco.from("ig_assets").insert({
      nome: arquivo.name, tipo: igTipoDoArquivo(arquivo), public_url: url, storage_path: caminho, size_bytes: arquivo.size
    }).select("*"));
    if(!r.ok) throw new Error(r.mensagem);
    var novo = r.dados[0];
    if(novo) e.arquivos.push(novo.id);
    await igCarregarAssets();
    igMarcarSujo();
    igRenderArquivos();
    igAtualizarPrevia();
    igRenderSequencia();
    aviso.textContent = "Arquivo enviado e anexado.";
  }catch(erro){
    console.error(erro);
    aviso.textContent = "Não consegui enviar o arquivo: " + (erro && erro.message ? erro.message : "erro desconhecido") + ". Confira se você rodou o arquivo instagram.sql (ele cria a pasta ig-arquivos).";
  }
  botao.disabled = false;
  botao.innerHTML = textoOriginal;
}

async function igApagarArquivo(a){
  var e = igEd;
  if(!confirm("Apagar \"" + a.nome + "\" da biblioteca? Automações que usam esse arquivo deixam de enviá-lo.")) return;
  if(a.storage_path){
    var rem = await banco.storage.from("ig-arquivos").remove([a.storage_path]);
    if(rem.error) console.error(rem.error);
  }
  var r = await buscarSeguro(banco.from("ig_assets").delete().eq("id", a.id));
  if(!r.ok){ alert("Não consegui apagar: " + (r.mensagem || "")); return; }
  e.arquivos = e.arquivos.filter(function(id){ return id !== a.id; });
  e.sequencia.forEach(function(m){ m.arquivos = m.arquivos.filter(function(id){ return id !== a.id; }); });
  await igCarregarAssets();
  igMarcarSujo();
  igRenderArquivos();
  igRenderSequencia();
  igAtualizarPrevia();
}

/* ============================================================================
   A PRÉVIA AO VIVO (o celular)
============================================================================ */
var IG_ICONE_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';

// Só mostra o botão que o servidor também vai mandar: com nome e com destino.
function igBotoesVisiveisPrevia(botoes){
  return botoes.filter(function(b){ return b.titulo.trim() !== "" && b.temDestino; });
}

function igBalaoHtml(texto, botoes){
  var corpo = texto && texto.trim()
    ? '<div class="ig-texto">' + escapa(texto) + '</div>'
    : '<div class="ig-texto ig-vazio">Sua mensagem aparece aqui</div>';
  var visiveis = igBotoesVisiveisPrevia(botoes);
  var parteBotoes = visiveis.length === 0 ? "" :
    '<div class="ig-balao-botoes">' + visiveis.slice(0, IG_MAX_BOTOES).map(function(b){
      return '<div class="ig-balao-botao">' + (b.ehLink ? IG_ICONE_LINK : "") + '<span>' + escapa(b.titulo) + '</span></div>';
    }).join("") + '</div>';
  return '<div class="ig-balao">' + corpo + parteBotoes + '</div>';
}

function igNomesArquivos(ids){
  return ids.map(function(id){
    var a = igAssets.filter(function(x){ return x.id === id; })[0];
    return a ? a.nome : null;
  }).filter(Boolean);
}

function igAtualizarPrevia(){
  var e = igEd;
  var caixa = document.getElementById("igPrevia");
  if(!caixa || !e) return;

  var gatilho = e.qualquer
    ? "qualquer comentário"
    : (e.palavras.length ? "«" + e.palavras.join(", ") + "»" : "a palavra escolhida");
  var html = '<div class="ig-sistema">Quando alguém comentar ' + escapa(gatilho) + '</div>';

  // Mensagem 1
  var botoes1 = [];
  if(e.comBotao){
    var tem = e.acao === "link" ? e.link.trim() !== "" : e.sequencia.length > 0;
    botoes1.push({ titulo: e.textoBotao, temDestino: tem, ehLink: e.acao === "link" });
  }
  html += igBalaoHtml(e.mensagem, botoes1);
  igNomesArquivos(e.arquivos).forEach(function(nome){
    html += '<div class="ig-arquivo-previa">Arquivo: ' + escapa(nome) + '</div>';
  });

  // Mensagens seguintes (só quando o botão continua a conversa)
  if(e.comBotao && e.acao === "conversa"){
    e.sequencia.forEach(function(m, i){
      html += '<div class="ig-sistema">Mensagem ' + (i + 2) + '</div>';
      var botoes = m.botoes.map(function(b){
        var temDestino = b.destino === "link" ? b.link.trim() !== "" : (b.destino === "mensagem" && !!b.paraUid);
        return { titulo: b.nome, temDestino: temDestino, ehLink: b.destino === "link" };
      });
      html += igBalaoHtml(m.mensagem, botoes);
      igNomesArquivos(m.arquivos).forEach(function(nome){
        html += '<div class="ig-arquivo-previa">Arquivo: ' + escapa(nome) + '</div>';
      });
    });
  }
  caixa.innerHTML = html;
}

/* ============================================================================
   SALVAR
============================================================================ */
async function igSalvarEditor(){
  var e = igEd;
  var areaErro = document.getElementById("igErroEditor");
  var botao = document.getElementById("btnSalvarEditorIg");

  var problemas = igValidar(e);
  if(problemas.length > 0){
    areaErro.innerHTML = '<p class="aviso erro">' + problemas.map(escapa).join("<br>") + '</p>';
    areaErro.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  areaErro.innerHTML = "";

  var fluxo = igEstadoParaFluxo(e);
  var nome = e.nome.trim() || (e.qualquer ? "Qualquer comentário" : e.palavras[0]);
  var registro = {
    nome: nome,
    keyword: e.palavras.join(", "),
    match_any: e.qualquer,
    active: e.ativa,
    media_ids: e.posts.slice(),
    public_reply: e.respostaPublica.trim(),
    public_reply_variants: e.variantes.map(function(v){ return v.trim(); }).filter(Boolean),
    flow: fluxo,
    asset_ids: e.arquivos.slice(),
    updated_at: new Date().toISOString()
  };

  botao.disabled = true;
  var textoOriginal = botao.textContent;
  botao.textContent = "Salvando...";
  var r = e.id
    ? await buscarSeguro(banco.from("ig_automations").update(registro).eq("id", e.id))
    : await buscarSeguro(banco.from("ig_automations").insert(registro));
  botao.disabled = false;
  botao.textContent = textoOriginal;

  if(!r.ok){
    areaErro.innerHTML = '<p class="aviso erro">Não consegui salvar: ' + escapa(r.mensagem || "erro desconhecido") + '. Confira se você rodou o arquivo instagram.sql no Supabase.</p>';
    return;
  }

  igEdSujo = false;
  fecharModal();
  irParaAba("instagram");
}
