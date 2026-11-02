/* ============================================================================
   ABA ESTRATÉGIA
   O retrato que orienta tudo o que você cria: contexto, preferências de
   roteiro, marca, identidade, objetivo, formatos, tom de voz, pilares,
   público, oferta e o que evitar.

   Usa o que já existe no painel: banco, buscarSeguro, escapa, icone,
   faixaAviso, irParaAba, abrirModal, fecharModal.

   Tudo fica numa linha só da tabela "estrategia" (arquivo estrategia.sql),
   trancada pro seu e-mail. Enquanto a tabela não existe, a aba mostra o
   ponto de partida abaixo e avisa que ainda não dá pra salvar.
============================================================================ */
"use strict";

// Ponto de partida: o que você já tinha montado de estratégia.
var EST_PADRAO = {
  contexto: { historia: "", meta90: "", funciona: "", travas: "" },
  roteiro: {
    topicos: [
      "Maternidade",
      "Endometriose",
      "Hashtag #maeprimeiraviagem",
      "Minha filha como conquista depois de muito tempo esperando por ela"
    ],
    formatos: ["Storytelling", "POV", "Dia na vida", "Voz em off + b-roll", "Talking head", "Lista numerada"],
    duracao: "",
    ganchos: ""
  },
  perfil: { usuario: "luanacoin", tipo: "Marca Pessoal" },
  nicho: {
    nome: "Maternidade e Criação de Conteúdo UGC",
    hashtags: ["#MaternidadeReal", "#PrimeiraViagemComoMae", "#ConteudoUGCParaMarcas", "#RotinaMaterna", "#BemEstarMaterno"]
  },
  identidade: {
    cores: ["#B5543C", "#8A9A6E", "#F3E9DA", "#4A2E26", "#E8B4B0"],
    fontes: "Fraunces, Poppins",
    tom: "Storytelling, Conversacional, Humor",
    guia: ""
  },
  objetivo: "Crescer audiência e vender",
  formatos: ["Vídeo curto", "Carrossel", "Stories"],
  tomVoz: ["Humor", "Storytelling", "Conversacional"],
  pilares: [
    { titulo: "Diário da Mãe", texto: "Momentos reais da maternidade, dos desafios do dia a dia às alegrias e descobertas com a bebê, incluindo a superação de medos e a adaptação à nova rotina." },
    { titulo: "Bastidores do UGC", texto: "Dicas, estratégias e experiências sobre como criar conteúdo UGC de qualidade para marcas, da prospecção à entrega, mostrando o processo criativo e os resultados." },
    { titulo: "Saúde e Bem-Estar Materno", texto: "Temas importantes para a saúde da mulher e da mãe, como endometriose e pós-parto, de forma aberta e informativa, incentivando o diálogo e o autocuidado." }
  ],
  publico: {
    descricao: "Mulheres que estão vivendo a maternidade, principalmente as de primeira viagem, que buscam identificação, dicas práticas e inspiração, e que também se interessam por criação de conteúdo para marcas (UGC).",
    dor: "A maternidade real traz desafios inesperados e medos diários, além da dificuldade de conciliar a nova rotina com a busca por oportunidades de trabalho como criadora de conteúdo UGC."
  },
  oferta: {
    oferta: "",
    promessa: "Compartilhar a jornada real da maternidade, com seus altos e baixos, e oferecer dicas práticas sobre como se destacar na criação de conteúdo UGC, inspirando outras mulheres a viverem as duas experiências com autenticidade."
  },
  evitar: []
};

var estDados = null;
var estPodeSalvar = true;

var EST_ICONES = {
  balao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  alvo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  paleta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="14.5" cy="7" r="1" fill="currentColor"/></svg>',
  bandeira: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  grade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  voz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="15" rx="2"/><path d="M7 9h10M7 13h6"/></svg>',
  camadas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  raio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
  pessoas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
  presente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-1.5-4-6-4-6-1.5S10 8 12 8zM12 8c1.5-4 6-4 6-1.5S14 8 12 8z"/></svg>',
  proibido: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  lapis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  lampada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

/* ============================================================================
   PEQUENOS AJUDANTES
============================================================================ */
function estAttr(texto){ return escapa(texto).replace(/"/g, "&quot;"); }

// Junta o que veio do banco com o ponto de partida, pra nenhum campo faltar.
function estMisturar(padrao, salvo){
  if(Array.isArray(padrao)) return Array.isArray(salvo) ? salvo : padrao;
  if(padrao && typeof padrao === "object"){
    var saida = {};
    Object.keys(padrao).forEach(function(k){
      saida[k] = estMisturar(padrao[k], salvo && typeof salvo === "object" ? salvo[k] : undefined);
    });
    return saida;
  }
  return salvo === undefined || salvo === null ? padrao : salvo;
}

function estCopia(obj){ return JSON.parse(JSON.stringify(obj)); }

function estTextoOuVazio(texto, classe){
  if(!texto || !String(texto).trim()) return '<p class="est-vazio">Ainda não preenchido.</p>';
  return '<p class="' + (classe || "est-texto") + '">' + escapa(texto) + '</p>';
}

function estPilulas(lista, cheia){
  if(!lista || !lista.length) return '<p class="est-vazio">-</p>';
  return '<div class="est-pilulas">' + lista.map(function(item){
    return '<span class="est-pilula' + (cheia ? " cheia" : "") + '">' + escapa(item) + '</span>';
  }).join("") + '</div>';
}

function estTopoCard(iconeNome, titulo, sub, editar){
  return '<div class="est-card-topo">' +
    '<span class="est-card-icone">' + EST_ICONES[iconeNome] + '</span>' +
    '<span class="est-card-nome">' + escapa(titulo) + (sub ? '<small>' + escapa(sub) + '</small>' : "") + '</span>' +
    (editar ? '<button type="button" class="est-lapis" data-editar="' + editar + '" aria-label="Editar ' + estAttr(titulo) + '">' + EST_ICONES.lapis + '</button>' : "") +
  '</div>';
}

// Lista digitada uma por linha (ou separada por vírgula) vira lista de verdade.
function estLerLista(texto){
  return String(texto || "").split(/\n|,/).map(function(t){ return t.trim(); }).filter(Boolean);
}

async function estSalvar(){
  if(!estPodeSalvar){
    alert("Ainda não dá pra salvar: rode o arquivo estrategia.sql no Supabase (o passo a passo está no aviso amarelo no topo da aba).");
    return false;
  }
  var r = await buscarSeguro(banco.from("estrategia").upsert({ id: 1, dados: estDados, atualizado_em: new Date().toISOString() }));
  if(!r.ok){
    alert("Não consegui salvar (" + r.mensagem + "). Tente de novo.");
    return false;
  }
  return true;
}

/* ============================================================================
   A TELA
============================================================================ */
async function abaEstrategia(painel){
  var r = await buscarSeguro(banco.from("estrategia").select("*").eq("id", 1));
  estPodeSalvar = r.ok;
  estDados = estMisturar(EST_PADRAO, r.ok && r.dados[0] ? r.dados[0].dados : null);
  estDesenhar(painel, r.ok ? "" : faixaAviso("Falta um passo pra salvar a sua estratégia: abra o Supabase, vá em SQL Editor, clique em New query, cole o arquivo estrategia.sql inteiro e clique em Run. Até lá, você vê o ponto de partida abaixo, mas as mudanças não ficam guardadas."));
}

function estDesenhar(painel, aviso){
  var d = estDados;
  var c = d.contexto;
  var passos = [
    { nome: "História e origem", ok: !!c.historia.trim() },
    { nome: "Meta dos 90 dias", ok: !!c.meta90.trim() },
    { nome: "Conteúdo que funciona", ok: !!c.funciona.trim() },
    { nome: "Travas atuais", ok: !!c.travas.trim() }
  ];
  var completos = passos.filter(function(p){ return p.ok; }).length;

  var html = (aviso || "") + '<div class="est-topo"><p class="est-sub">O retrato que orienta tudo o que você cria.</p>' +
    '<div class="est-topo-botoes"><button type="button" class="btn" id="estBtnBrainstorm">' + EST_ICONES.lampada + 'Brainstorm</button>' +
    '<button type="button" class="btn btn-principal" data-calendario="">' + EST_ICONES.mais + 'Adicionar ao calendário</button></div></div>';

  // ---- contexto + preferências de roteiro ----
  html += '<div class="est-grade est-g2">';
  html += '<section class="est-card">' +
    '<div class="est-card-topo"><span class="est-card-icone">' + EST_ICONES.balao + '</span><span class="est-card-nome">Entrevista de contexto</span>' +
    (completos === 4 ? '<span class="est-ativo">perfil ativo</span>' : '<span class="est-ativo" style="background:#F8EBD2;color:#7A5A22">' + completos + ' de 4</span>') + '</div>' +
    (completos === 4
      ? '<p class="est-destaque">Seu contexto está <em>salvo</em>.</p><p class="est-texto">Tudo o que você planejar parte destas respostas. Atualize quando quiser refinar.</p>'
      : '<p class="est-destaque">Conte a sua <em>história</em>.</p><p class="est-texto">Quatro respostas curtas que servem de base pra pauta, roteiro e pitch.</p>') +
    '<div class="est-linha"></div>' +
    '<div class="est-checks">' + passos.map(function(p){
      return '<span class="' + (p.ok ? "ok" : "") + '">' + (p.ok ? EST_ICONES.check : "&#9675;") + escapa(p.nome) + '</span>';
    }).join("") + '</div>' +
    '<button type="button" class="btn" data-editar="contexto">' + EST_ICONES.balao + (completos ? "Atualizar contexto" : "Responder agora") + '</button>' +
  '</section>';

  html += '<section class="est-card">' + estTopoCard("ajustes", "Preferências de roteiro", "", "roteiro") +
    '<p class="est-rotulo" style="margin-top:0">Tópicos</p>' +
    (d.roteiro.topicos.length ? '<p class="est-forte">' + d.roteiro.topicos.map(escapa).join(" · ") + '</p>' : '<p class="est-vazio">-</p>') +
    '<div class="est-linha"></div>' +
    '<div class="est-tres est-prefs">' +
      '<div><p class="est-rotulo">Formatos preferidos</p><p class="est-texto">' + (d.roteiro.formatos.length ? escapa(d.roteiro.formatos.join(", ")) : "-") + '</p></div>' +
      '<div><p class="est-rotulo">Duração padrão</p><p class="est-texto">' + escapa(d.roteiro.duracao || "-") + '</p></div>' +
      '<div><p class="est-rotulo">Ganchos</p><p class="est-texto">' + escapa(d.roteiro.ganchos || "-") + '</p></div>' +
    '</div>' +
  '</section>';
  html += '</div>';

  // ---- marca ----
  html += '<p class="est-secao">Marca</p><div class="est-grade est-g-marca">';
  html += '<section class="est-card">' +
    '<div class="est-perfil"><span class="est-avatar">' + escapa((d.perfil.usuario || "L").charAt(0).toUpperCase()) + '</span>' +
      '<span class="est-card-nome" style="font-size:1.05rem">' + escapa(d.perfil.usuario || "-") + '<small>' + escapa(d.perfil.tipo || "") + '</small></span>' +
      '<button type="button" class="est-lapis" data-editar="perfil" aria-label="Editar perfil">' + EST_ICONES.lapis + '</button></div>' +
    '<div class="est-card-topo" style="margin:14px 0 8px"><span class="est-rotulo" style="margin:0;flex:1">Nicho</span>' +
      '<button type="button" class="est-lapis" data-editar="nicho" aria-label="Editar nicho">' + EST_ICONES.lapis + '</button></div>' +
    '<p class="est-forte" style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><span style="color:var(--terracota);display:flex;width:18px">' + EST_ICONES.alvo + '</span>' + escapa(d.nicho.nome || "-") + '</p>' +
    estPilulas(d.nicho.hashtags) +
  '</section>';

  html += '<section class="est-card">' + estTopoCard("paleta", "Identidade", "", "identidade") +
    '<div class="est-cores">' + d.identidade.cores.map(function(cor){ return '<i style="background:' + estAttr(cor) + '" title="' + estAttr(cor) + '"></i>'; }).join("") + '</div>' +
    '<div class="est-ident-linha">' +
      '<span><b>Fontes</b>' + escapa(d.identidade.fontes || "-") + '</span>' +
      '<span><b>Tom</b>' + escapa(d.identidade.tom || "-") + '</span>' +
      (d.identidade.guia ? '<a href="' + estAttr(d.identidade.guia) + '" target="_blank" rel="noopener" class="fin-link" style="font-family:var(--ff-titulo);font-style:italic">Guia da marca</a>' : "") +
    '</div>' +
  '</section>';
  html += '</div>';

  // ---- conteúdo ----
  html += '<p class="est-secao">Conteúdo</p><div class="est-grade est-g3">';
  html += '<section class="est-card">' + estTopoCard("bandeira", "Objetivo", "", "objetivo") + estTextoOuVazio(d.objetivo, "est-forte") + '</section>';
  html += '<section class="est-card">' + estTopoCard("grade", "Formatos", "", "formatos") + estPilulas(d.formatos) + '</section>';
  html += '<section class="est-card">' + estTopoCard("voz", "Tom de voz", "", "tomVoz") + estPilulas(d.tomVoz, true) + '</section>';
  html += '</div>';

  // ---- pilares ----
  html += '<section class="est-card" style="margin-bottom:14px">' + estTopoCard("camadas", "Pilares", "os territórios que você cobre", "pilares") +
    (d.pilares.length
      ? '<div class="est-tres">' + d.pilares.map(function(p, i){
          return '<div class="est-pilar"><span class="est-card-icone">' + (i % 2 ? EST_ICONES.grade : EST_ICONES.raio) + '</span>' +
            '<h4>' + escapa(p.titulo || "-") + '</h4><p>' + escapa(p.texto || "") + '</p>' +
            '<button type="button" class="btn btn-pequeno" data-calendario="' + estAttr(p.titulo ? "Pilar: " + p.titulo : "") + '">' + EST_ICONES.mais + 'Adicionar ao calendário</button></div>';
        }).join("") + '</div>'
      : '<p class="est-vazio">Nenhum pilar ainda.</p>') +
  '</section>';

  // ---- público + oferta ----
  html += '<div class="est-grade est-g2">';
  html += '<section class="est-card">' + estTopoCard("pessoas", "Público", "quem você atende", "publico") +
    estTextoOuVazio(d.publico.descricao, "est-forte") +
    '<div class="est-linha"></div><p class="est-rotulo">Dor principal</p>' + estTextoOuVazio(d.publico.dor) +
  '</section>';
  html += '<section class="est-card">' + estTopoCard("presente", "Oferta e promessa", "", "oferta") +
    '<p class="est-rotulo" style="margin-top:0">Oferta</p>' +
    (d.oferta.oferta ? '<p class="est-texto">' + escapa(d.oferta.oferta) + '</p>'
      : '<button type="button" class="btn btn-pequeno" data-editar="oferta">' + EST_ICONES.mais + 'Adicionar oferta</button>') +
    '<div class="est-linha"></div><p class="est-rotulo">Promessa</p>' +
    (d.oferta.promessa ? '<p class="est-promessa">"' + escapa(d.oferta.promessa) + '"</p>' : '<p class="est-vazio">Ainda não preenchido.</p>') +
  '</section>';
  html += '</div>';

  // ---- evitar ----
  html += '<section class="est-card">' + estTopoCard("proibido", "Evitar", "linhas que você não cruza", "") +
    (d.evitar.length
      ? '<div class="est-pilulas">' + d.evitar.map(function(t, i){
          return '<span class="est-pilula">' + escapa(t) + '<button type="button" data-tirar="' + i + '" aria-label="Tirar ' + estAttr(t) + '">' + icone("fechar") + '</button></span>';
        }).join("") + '</div>'
      : '<p class="est-vazio">Nenhum tema bloqueado ainda.</p>') +
    '<form class="est-add" id="estFormEvitar"><input id="estNovoEvitar" placeholder="Adicionar tema a evitar" maxlength="120"><button type="submit" class="btn">Adicionar</button></form>' +
  '</section>';

  painel.innerHTML = html;

  painel.querySelectorAll("[data-editar]").forEach(function(b){
    b.addEventListener("click", function(){ estAbrirEdicao(b.dataset.editar); });
  });
  // Leva pro Calendário de conteúdos e já abre o "Adicionar" (com o pilar na ideia, quando vem de um pilar).
  painel.querySelectorAll("[data-calendario]").forEach(function(b){
    b.addEventListener("click", function(){
      calAbrirFormAoEntrar = { ideia: b.dataset.calendario };
      irParaAba("calendario");
    });
  });
  document.getElementById("estBtnBrainstorm").addEventListener("click", estPerguntarFunil);
  painel.querySelectorAll("[data-tirar]").forEach(function(b){
    b.addEventListener("click", async function(){
      var antes = estCopia(estDados.evitar);
      estDados.evitar.splice(+b.dataset.tirar, 1);
      if(await estSalvar()) estDesenhar(painel, aviso);
      else estDados.evitar = antes;
    });
  });
  document.getElementById("estFormEvitar").addEventListener("submit", async function(e){
    e.preventDefault();
    var texto = document.getElementById("estNovoEvitar").value.trim();
    if(!texto) return;
    estDados.evitar.push(texto);
    if(await estSalvar()) estDesenhar(painel, aviso);
    else estDados.evitar.pop();
  });
}

/* ============================================================================
   EDITAR (um modal por cartão)
============================================================================ */
// Cada cartão diz quais campos aparecem no modal e onde cada um mora nos dados.
// tipo "lista": um item por linha.
var EST_FORMS = {
  contexto: { titulo: "Entrevista de contexto", campos: [
    { caminho: "contexto.historia", rotulo: "Sua história e origem: como você chegou até aqui?", tipo: "area" },
    { caminho: "contexto.meta90", rotulo: "Meta dos próximos 90 dias", tipo: "area" },
    { caminho: "contexto.funciona", rotulo: "Que conteúdo seu funciona melhor hoje?", tipo: "area" },
    { caminho: "contexto.travas", rotulo: "O que te trava hoje?", tipo: "area" }
  ]},
  roteiro: { titulo: "Preferências de roteiro", campos: [
    { caminho: "roteiro.topicos", rotulo: "Tópicos (um por linha)", tipo: "lista" },
    { caminho: "roteiro.formatos", rotulo: "Formatos preferidos (um por linha)", tipo: "lista" },
    { caminho: "roteiro.duracao", rotulo: "Duração padrão", tipo: "texto", dica: "ex: 30 a 45 segundos" },
    { caminho: "roteiro.ganchos", rotulo: "Ganchos que você gosta de usar", tipo: "area" }
  ]},
  perfil: { titulo: "Perfil", campos: [
    { caminho: "perfil.usuario", rotulo: "Usuário", tipo: "texto" },
    { caminho: "perfil.tipo", rotulo: "Tipo de perfil", tipo: "texto", dica: "ex: Marca Pessoal" }
  ]},
  nicho: { titulo: "Nicho", campos: [
    { caminho: "nicho.nome", rotulo: "Nicho", tipo: "texto" },
    { caminho: "nicho.hashtags", rotulo: "Hashtags (uma por linha)", tipo: "lista" }
  ]},
  identidade: { titulo: "Identidade", campos: [
    { caminho: "identidade.cores", rotulo: "Cores da marca", tipo: "cores" },
    { caminho: "identidade.fontes", rotulo: "Fontes", tipo: "texto" },
    { caminho: "identidade.tom", rotulo: "Tom", tipo: "texto" },
    { caminho: "identidade.guia", rotulo: "Link do guia da marca (opcional)", tipo: "texto", dica: "https://..." }
  ]},
  objetivo: { titulo: "Objetivo", campos: [{ caminho: "objetivo", rotulo: "Objetivo principal", tipo: "texto" }] },
  formatos: { titulo: "Formatos", campos: [{ caminho: "formatos", rotulo: "Formatos (um por linha)", tipo: "lista" }] },
  tomVoz: { titulo: "Tom de voz", campos: [{ caminho: "tomVoz", rotulo: "Tom de voz (um por linha)", tipo: "lista" }] },
  publico: { titulo: "Público", campos: [
    { caminho: "publico.descricao", rotulo: "Quem você atende", tipo: "area" },
    { caminho: "publico.dor", rotulo: "Dor principal", tipo: "area" }
  ]},
  oferta: { titulo: "Oferta e promessa", campos: [
    { caminho: "oferta.oferta", rotulo: "Oferta (o que você vende ou oferece)", tipo: "area" },
    { caminho: "oferta.promessa", rotulo: "Promessa", tipo: "area" }
  ]}
};

function estPegar(caminho){
  return caminho.split(".").reduce(function(o, k){ return o[k]; }, estDados);
}
function estPor(caminho, valor){
  var partes = caminho.split(".");
  var alvo = estDados;
  for(var i = 0; i < partes.length - 1; i++) alvo = alvo[partes[i]];
  alvo[partes[partes.length - 1]] = valor;
}

function estAbrirEdicao(chave){
  if(chave === "pilares") return estEditarPilares();
  var form = EST_FORMS[chave];
  var html = '<h2 class="form-titulo" id="modalTituloLabel">' + escapa(form.titulo) + '</h2><form id="estForm">';
  form.campos.forEach(function(c, i){
    var valor = estPegar(c.caminho);
    html += '<div class="campo"><label for="estCampo' + i + '">' + escapa(c.rotulo) + '</label>';
    if(c.tipo === "area") html += '<textarea id="estCampo' + i + '" placeholder="' + estAttr(c.dica || "") + '">' + escapa(valor || "") + '</textarea>';
    else if(c.tipo === "lista") html += '<textarea id="estCampo' + i + '">' + escapa((valor || []).join("\n")) + '</textarea>';
    else if(c.tipo === "cores") html += '<div class="est-cor-linha" id="estCampo' + i + '">' + (valor || []).map(function(cor){
      return '<input type="color" value="' + estAttr(cor) + '">';
    }).join("") + '<button type="button" class="btn btn-pequeno" id="estMaisCor">' + EST_ICONES.mais + 'Cor</button></div>';
    else html += '<input id="estCampo' + i + '" value="' + estAttr(valor || "") + '" placeholder="' + estAttr(c.dica || "") + '">';
    html += '</div>';
  });
  html += '<div class="form-acoes"><button type="button" class="btn" id="estCancelar">Cancelar</button><button type="submit" class="btn btn-principal">Salvar</button></div></form>';
  abrirModal(html, form.campos.length > 2);

  var maisCor = document.getElementById("estMaisCor");
  if(maisCor) maisCor.addEventListener("click", function(){
    maisCor.insertAdjacentHTML("beforebegin", '<input type="color" value="#C98A55">');
  });
  document.getElementById("estCancelar").addEventListener("click", fecharModal);
  document.getElementById("estForm").addEventListener("submit", async function(e){
    e.preventDefault();
    var antes = estCopia(estDados);
    form.campos.forEach(function(c, i){
      var campo = document.getElementById("estCampo" + i);
      if(c.tipo === "lista") estPor(c.caminho, estLerLista(campo.value));
      else if(c.tipo === "cores") estPor(c.caminho, Array.from(campo.querySelectorAll("input[type=color]")).map(function(x){ return x.value; }));
      else estPor(c.caminho, campo.value.trim());
    });
    if(await estSalvar()){ fecharModal(); irParaAba("estrategia"); }
    else estDados = antes;
  });
}

function estEditarPilares(){
  var lista = estCopia(estDados.pilares);
  function blocos(){
    return lista.map(function(p, i){
      return '<div class="est-pilar-form">' +
        '<div class="campo"><label for="estPilT' + i + '">Pilar ' + (i + 1) + '</label><input id="estPilT' + i + '" value="' + estAttr(p.titulo) + '"></div>' +
        '<div class="campo" style="margin-bottom:6px"><label for="estPilX' + i + '">Sobre o que é</label><textarea id="estPilX' + i + '">' + escapa(p.texto) + '</textarea></div>' +
        '<button type="button" class="btn btn-pequeno btn-perigo" data-tirar-pilar="' + i + '">Tirar este pilar</button></div>';
    }).join("");
  }
  function ler(){
    lista = lista.map(function(_, i){
      return { titulo: document.getElementById("estPilT" + i).value.trim(), texto: document.getElementById("estPilX" + i).value.trim() };
    });
  }
  function montar(){
    abrirModal('<h2 class="form-titulo" id="modalTituloLabel">Pilares</h2><form id="estForm">' +
      '<div id="estPilares">' + blocos() + '</div>' +
      '<button type="button" class="btn btn-pequeno" id="estNovoPilar">' + EST_ICONES.mais + 'Novo pilar</button>' +
      '<div class="form-acoes"><button type="button" class="btn" id="estCancelar">Cancelar</button><button type="submit" class="btn btn-principal">Salvar</button></div></form>', true);
    document.getElementById("estNovoPilar").addEventListener("click", function(){ ler(); lista.push({ titulo: "", texto: "" }); montar(); });
    document.querySelectorAll("[data-tirar-pilar]").forEach(function(b){
      b.addEventListener("click", function(){ ler(); lista.splice(+b.dataset.tirarPilar, 1); montar(); });
    });
    document.getElementById("estCancelar").addEventListener("click", fecharModal);
    document.getElementById("estForm").addEventListener("submit", async function(e){
      e.preventDefault();
      ler();
      var antes = estDados.pilares;
      estDados.pilares = lista.filter(function(p){ return p.titulo || p.texto; });
      if(await estSalvar()){ fecharModal(); irParaAba("estrategia"); }
      else estDados.pilares = antes;
    });
  }
  montar();
}

/* ============================================================================
   BRAINSTORM: pergunta o nível do funil e pede ideias pra IA, usando tudo o
   que está guardado na estratégia. Usa a chave da IA salva na aba Roteiros
   (chamarIAPitch, do pitch.js). Cada ideia pode ir direto pro calendário.
============================================================================ */
var EST_FUNIL = {
  topo: { nome: "Topo", explica: "Atrair gente nova: conteúdo de identificação e alcance, pra quem ainda não te conhece.", etapas: ["🪞 Identificação", "🤔 Curiosidade"] },
  meio: { nome: "Meio", explica: "Criar conexão e autoridade: mostrar o que você sabe e por que vale te seguir.", etapas: ["🏆 Autoridade", "✨ Desejo"] },
  fundo: { nome: "Fundo", explica: "Converter: levar marcas e seguidoras a agir (fechar parceria, comprar, chamar no direct).", etapas: ["✨ Desejo", "👉 Ação"] }
};
var EST_QTD_IDEIAS = 5;
var estIdeias = null;   // { nivel, lista: [{ titulo, formato, estilo, pilar, etapa, ideia, porque, data, estado }] }

function estPerguntarFunil(){
  abrirModal('<h2 class="form-titulo" id="modalTituloLabel">Brainstorm</h2>' +
    '<p class="est-texto" style="margin-bottom:14px">Qual o nível do funil dessas ideias?</p>' +
    '<div class="est-funil">' + Object.keys(EST_FUNIL).map(function(k){
      var f = EST_FUNIL[k];
      return '<button type="button" class="est-funil-op" data-nivel="' + k + '"><span class="est-funil-barra est-funil-' + k + '"></span>' +
        '<span><b>' + f.nome + ' de funil</b><small>' + escapa(f.explica) + '</small></span></button>';
    }).join("") + '</div>');
  modalConteudo.querySelectorAll("[data-nivel]").forEach(function(b){
    b.addEventListener("click", function(){ estGerarIdeias(b.dataset.nivel); });
  });
}

function estDataISO(d){
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function estResumoParaIA(){
  var d = estDados;
  return [
    "Perfil: @" + d.perfil.usuario + " (" + d.perfil.tipo + ")",
    "Nicho: " + d.nicho.nome + " | hashtags: " + d.nicho.hashtags.join(" "),
    "Objetivo: " + d.objetivo,
    "Formatos: " + d.formatos.join(", "),
    "Tom de voz: " + d.tomVoz.join(", "),
    "Pilares:\n" + d.pilares.map(function(p){ return "- " + p.titulo + ": " + p.texto; }).join("\n"),
    "Público: " + d.publico.descricao,
    "Dor principal: " + d.publico.dor,
    "Oferta: " + (d.oferta.oferta || "-"),
    "Promessa: " + (d.oferta.promessa || "-"),
    "Tópicos que gosta de abordar: " + d.roteiro.topicos.join("; "),
    "Formatos de roteiro preferidos: " + d.roteiro.formatos.join(", "),
    "Duração padrão: " + (d.roteiro.duracao || "-"),
    "Ganchos que gosta: " + (d.roteiro.ganchos || "-"),
    "História e origem: " + (d.contexto.historia || "-"),
    "Meta dos 90 dias: " + (d.contexto.meta90 || "-"),
    "Conteúdo que funciona: " + (d.contexto.funciona || "-"),
    "Travas atuais: " + (d.contexto.travas || "-"),
    "Temas que NUNCA devem aparecer: " + (d.evitar.length ? d.evitar.join("; ") : "-")
  ].join("\n");
}

async function estGerarIdeias(nivel){
  var funil = EST_FUNIL[nivel];
  abrirModal('<h2 class="form-titulo" id="modalTituloLabel">Brainstorm: ' + funil.nome + ' de funil</h2>' +
    '<p class="vazio-explicacao">Pensando em ' + EST_QTD_IDEIAS + ' ideias com base na sua estratégia... isso leva uns segundos.</p>', true);

  // títulos que já estão no calendário, pra IA não repetir
  var jaTem = await buscarSeguro(banco.from("calendario").select("titulo").order("data", { ascending: false }).limit(40));
  var titulosAntigos = jaTem.ok ? jaTem.dados.map(function(c){ return c.titulo; }).filter(Boolean) : [];

  var pedido = "Você é estrategista de conteúdo de uma criadora UGC brasileira. Crie " + EST_QTD_IDEIAS + " ideias de conteúdo para o Instagram dela, em português do Brasil.\n\n" +
    "Nível do funil: " + funil.nome.toUpperCase() + " (" + funil.explica + ")\n\n" +
    "Estratégia dela:\n" + estResumoParaIA() + "\n\n" +
    (titulosAntigos.length ? "Conteúdos que já estão no calendário (não repita):\n- " + titulosAntigos.join("\n- ") + "\n\n" : "") +
    "Regras: distribua as ideias entre os pilares; use só formatos da lista dela; títulos curtos e específicos, na voz dela (primeira pessoa quando fizer sentido); não invente marcas, números ou fatos que não estão acima; nunca use travessão.\n" +
    "Responda SÓ com um JSON válido, sem nada antes ou depois, neste formato:\n" +
    '[{"titulo": "...", "formato": "Reels ou Carrossel ou Stories ou Post", "estilo": "um dos formatos de roteiro dela, ex: Storytelling", "pilar": "nome do pilar", "etapa": "' + funil.etapas.join('" ou "') + '", "ideia": "2 ou 3 frases dizendo o que gravar e mostrar", "porque": "1 ou 2 frases explicando por que esse conteúdo funciona nesse nível do funil e pro objetivo dela"}]';

  var r = await chamarIAPitch([{ papel: "user", texto: pedido }]);
  if(!r.ok) return estMostrarErroIdeias(nivel, r.mensagem);

  var lista = null;
  try{ lista = JSON.parse(r.texto.slice(r.texto.indexOf("["), r.texto.lastIndexOf("]") + 1)); }catch(erro){ lista = null; }
  if(!Array.isArray(lista) || !lista.length) return estMostrarErroIdeias(nivel, "A IA respondeu num formato que eu não entendi. Tenta de novo.");

  // datas sugeridas: uma por dia a partir de amanhã (dá pra trocar em cada ideia)
  var dia = new Date();
  estIdeias = { nivel: nivel, lista: lista.slice(0, EST_QTD_IDEIAS).map(function(i){
    dia.setDate(dia.getDate() + 1);
    return {
      titulo: String(i.titulo || "").trim(), formato: String(i.formato || "").trim(), estilo: String(i.estilo || "").trim(),
      pilar: String(i.pilar || "").trim(), etapa: funil.etapas.indexOf(i.etapa) !== -1 ? i.etapa : funil.etapas[0],
      ideia: String(i.ideia || "").trim(), porque: String(i.porque || "").trim(),
      data: estDataISO(dia), estado: ""
    };
  }) };
  estMostrarIdeias();
}

function estMostrarErroIdeias(nivel, mensagem){
  abrirModal('<h2 class="form-titulo" id="modalTituloLabel">Brainstorm</h2>' + faixaAviso(mensagem, "erro") +
    '<div class="form-acoes"><button type="button" class="btn" id="estOutroNivel">Escolher outro nível</button>' +
    '<button type="button" class="btn btn-principal" id="estTentarDeNovo">Tentar de novo</button></div>');
  document.getElementById("estOutroNivel").addEventListener("click", estPerguntarFunil);
  document.getElementById("estTentarDeNovo").addEventListener("click", function(){ estGerarIdeias(nivel); });
}

function estMostrarIdeias(){
  var funil = EST_FUNIL[estIdeias.nivel];
  var visiveis = estIdeias.lista.filter(function(i){ return i.estado !== "dispensada"; });
  var algumaAdicionada = estIdeias.lista.some(function(i){ return i.estado === "adicionada"; });
  var html = '<p class="est-ideias-topo">' + visiveis.length + ' ideias geradas · ' + funil.nome + ' de funil</p>' +
    '<h2 class="form-titulo est-ideias-titulo" id="modalTituloLabel">Conteúdos pra testar</h2>' +
    '<div class="est-ideias">' + estIdeias.lista.map(function(i, n){
      if(i.estado === "dispensada") return "";
      return '<article class="est-ideia' + (i.estado === "adicionada" ? " feita" : "") + '">' +
        '<div class="est-ideia-meta"><span class="est-ideia-num">' + String(n + 1).padStart(2, "0") + '</span>' +
          '<span class="est-funil-barra est-funil-' + estIdeias.nivel + '"></span><b>' + funil.nome.toUpperCase() + '</b>' +
          (i.formato ? '<span class="est-ideia-sep">' + escapa(i.formato) + (i.estilo ? " · " + escapa(i.estilo) : "") + '</span>' : "") +
          (i.pilar ? '<em>' + escapa(i.pilar) + '</em>' : "") + '</div>' +
        '<h3>' + escapa(i.titulo) + '</h3>' +
        '<p class="est-rotulo est-ideia-rot">Ideia</p><p class="est-texto">' + escapa(i.ideia) + '</p>' +
        (i.porque ? '<details class="est-porque"><summary>Por que esse conteúdo?</summary><p>' + escapa(i.porque) + '</p></details>' : "") +
        '<div class="est-ideia-acoes">' +
          (i.estado === "adicionada"
            ? '<span class="est-ativo">No calendário em ' + escapa(formatarData(i.data)) + '</span>'
            : '<label class="est-ideia-data">Data <input type="date" data-data="' + n + '" value="' + i.data + '"></label>' +
              '<button type="button" class="btn btn-pequeno est-dispensar" data-dispensar="' + n + '">Dispensar</button>' +
              '<button type="button" class="btn btn-pequeno btn-principal" data-add="' + n + '">' + icone("calendario") + 'Adicionar ao calendário</button>') +
        '</div></article>';
    }).join("") + '</div>' +
    (visiveis.length ? "" : '<p class="vazio-explicacao">Você dispensou todas. Gere de novo pra ver outras.</p>') +
    '<div class="est-ideias-rodape"><span>Não gostou? Gere de novo ou troque o nível.</span>' +
      '<button type="button" class="btn btn-pequeno" id="estTrocarNivel">Trocar nível</button>' +
      '<button type="button" class="btn btn-pequeno" id="estGerarDeNovo">Gerar de novo</button>' +
      (algumaAdicionada ? '<button type="button" class="btn btn-pequeno btn-principal" id="estVerCal">Ver no calendário</button>' : "") +
    '</div>';
  abrirModal(html, true);
  modalBox.style.maxWidth = "780px";

  modalConteudo.querySelectorAll("[data-data]").forEach(function(c){
    c.addEventListener("change", function(){ estIdeias.lista[+c.dataset.data].data = c.value; });
  });
  modalConteudo.querySelectorAll("[data-dispensar]").forEach(function(b){
    b.addEventListener("click", function(){ estIdeias.lista[+b.dataset.dispensar].estado = "dispensada"; estMostrarIdeias(); });
  });
  modalConteudo.querySelectorAll("[data-add]").forEach(function(b){
    b.addEventListener("click", async function(){
      var i = estIdeias.lista[+b.dataset.add];
      if(!i.data){ alert("Escolha uma data antes de adicionar."); return; }
      b.disabled = true;
      b.textContent = "Salvando...";
      var res = await buscarSeguro(banco.from("calendario").insert({
        titulo: i.titulo, data: i.data, marca: "", formato: i.formato, etapa: i.etapa,
        ideia: i.ideia + (i.pilar ? "\n\nPilar: " + i.pilar : "") + (i.estilo ? "\nEstilo: " + i.estilo : ""),
        legenda: "", tipo: "gravar", status: "a_fazer"
      }));
      if(!res.ok){ alert("Não consegui salvar no calendário: " + res.mensagem); estMostrarIdeias(); return; }
      i.estado = "adicionada";
      estMostrarIdeias();
    });
  });
  document.getElementById("estTrocarNivel").addEventListener("click", estPerguntarFunil);
  document.getElementById("estGerarDeNovo").addEventListener("click", function(){ estGerarIdeias(estIdeias.nivel); });
  var verCal = document.getElementById("estVerCal");
  if(verCal) verCal.addEventListener("click", function(){
    var primeira = estIdeias.lista.find(function(i){ return i.estado === "adicionada"; });
    calMesAtual = new Date(primeira.data + "T12:00:00");
    calMesAtual.setDate(1);
    fecharModal();
    irParaAba("calendario");
  });
}
