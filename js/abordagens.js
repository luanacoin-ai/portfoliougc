/* ============================================================================
   ABA: ABORDAGENS (grupo Empresa)
   Duas partes:
     - Marcas: conversa pronta por nicho pra abordar uma marca direto
       (abertura, proposta com gancho/cena/final e follow-up).
     - Plataformas: inscrição em campanha (Seu Influencer e parecidas),
       montada em campanha / por que você / o vídeo, com contador de
       caracteres (meta 850, limite 900).
   Tudo fica salvo só neste navegador (localStorage).

   Usa o que já existe no painel: escapa, icone.
============================================================================ */
"use strict";

var ABD_CHAVE = "painel_abordagens";
var ABD_META = 850;
var ABD_LIMITE = 900;

var ABD_CATS = {
  familia: "Família e casa",
  beleza: "Beleza e cuidado",
  moda: "Moda",
  comida: "Comida e bem-estar",
  digital: "Digital e serviços",
  outros: "Outros"
};

/* Cada nicho: formato do vídeo, elogio da abertura ({detalhe} entra aqui),
   por que vídeo funciona pra esse produto, gancho sugerido, cena, final,
   novidade pro follow-up e exemplos pros campos. */
var ABD_NICHOS = [
  { id: "maternidade", cat: "familia", n: "Maternidade e bebê", ex: "Fraldas, carrinhos, mamadeiras, enxoval",
    f: "um dia real com o bebê",
    el: "Que lindo {detalhe}, dá pra ver o cuidado com as mães em cada post.",
    mo: "Mãe compra pela indicação de outra mãe, e ver o produto funcionando na rotina de verdade passa mais confiança do que qualquer foto de estúdio.",
    g: "Ninguém me contou que essa seria a parte mais difícil do meu dia.",
    c: "Mostro {produto} no meio da nossa rotina, com o bebê de verdade, sem cena montada.",
    fi: "Termino com o momento que ficou mais leve depois que ele entrou na nossa casa.",
    nu: "Pensei também numa versão curtinha de 15 segundos, boa pra testar em anúncio.",
    pd: "os relatos de mães que vocês repostam", pc: "sou mãe e passo por isso todo santo dia" },
  { id: "infantil", cat: "familia", n: "Infantil e brinquedos", ex: "Brinquedos, roupinhas, livros infantis",
    f: "a reação da criança",
    el: "Adorei {detalhe}, o feed de vocês tem cara de infância de verdade.",
    mo: "Quem compra brinquedo quer saber se a criança vai brincar mais de uma vez, e só um vídeo de verdade mostra isso.",
    g: "Eu achei que ele ia largar isso em cinco minutos.",
    c: "Gravo a primeira vez que a criança mexe em {produto}, com a reação espontânea, sem ensaio.",
    fi: "Fecho com ela voltando pro brinquedo no dia seguinte, sozinha.",
    nu: "Consigo gravar com luz natural e mostrar a criança brincando de verdade, sem roteiro decorado.",
    pd: "a coleção nova de cores", pc: "tenho criança em casa e vejo na hora o que prende a atenção dela" },
  { id: "casa", cat: "familia", n: "Casa e decoração", ex: "Decoração, cama e banho, utilidades",
    f: "antes e depois do cantinho",
    el: "Amei {detalhe}, dá vontade de redecorar a casa toda.",
    mo: "Decoração vende pelo efeito no ambiente, e o antes e depois mostra isso em poucos segundos.",
    g: "Esse cantinho da minha casa era o que eu mais tinha vergonha.",
    c: "Mostro o cantinho como ele era e vou montando com {produto}, passo a passo.",
    fi: "Termino com o ambiente pronto, numa luz bonita de fim de tarde.",
    nu: "Já escolhi o cantinho da casa que vai virar o antes e depois.",
    pd: "os ambientes reais de clientes que vocês mostram", pc: "estou arrumando minha casa aos poucos e amo transformar um cantinho" },
  { id: "limpeza", cat: "familia", n: "Limpeza e organização", ex: "Produtos de limpeza, organizadores, utilidades",
    f: "limpeza satisfatória",
    el: "Que bom ver {detalhe}, vocês deixam a limpeza até gostosa de assistir.",
    mo: "Vídeo de limpeza segura a pessoa até o fim porque ela quer ver o resultado, e é aí que o produto aparece.",
    g: "Essa mancha estava aqui fazia meses.",
    c: "Gravo {produto} em ação, em close, com o som da limpeza e a sujeira saindo de verdade.",
    fi: "Fecho com o resultado final brilhando, sem filtro.",
    nu: "Separei um cantinho bem desafiador da casa pra mostrar o resultado de verdade.",
    pd: "os vídeos de antes e depois", pc: "com criança em casa, a sujeira aparece todo dia" },
  { id: "cozinha", cat: "familia", n: "Cozinha e eletroportáteis", ex: "Panelas, air fryer, liquidificador, utensílios",
    f: "receita rápida em um take",
    el: "Amei {detalhe}, deu fome só de olhar o perfil.",
    mo: "Quem pensa em comprar quer ver o produto funcionando numa cozinha comum, igual à dela.",
    g: "Eu fazia isso em quarenta minutos. Hoje leva dez.",
    c: "Faço uma receita do dia a dia usando {produto}, mostrando cada etapa em tempo real.",
    fi: "Termino com a família provando e a cozinha sem bagunça.",
    nu: "Já pensei na receita: é a que mais sai aqui em casa durante a semana.",
    pd: "as receitas que vocês postam", pc: "cozinho todo dia pra família e preciso de praticidade" },
  { id: "pets", cat: "familia", n: "Pets", ex: "Ração, petiscos, brinquedos, acessórios",
    f: "o pet reagindo",
    el: "Que fofura {detalhe}, o perfil de vocês é puro carinho com os bichinhos.",
    mo: "Dono de pet compra pela reação do animal, e isso não tem como fingir.",
    g: "Olha a cara dele quando eu abro isso aqui.",
    c: "Gravo a primeira vez do meu pet com {produto}, com a reação de verdade.",
    fi: "Termino com ele pedindo mais.",
    nu: "Consigo gravar nos horários em que ele está mais animado, pra reação sair natural.",
    pd: "os vídeos dos pets de clientes", pc: "tenho pet em casa e testo tudo com ele" },
  { id: "beleza", cat: "beleza", n: "Cabelo e maquiagem", ex: "Shampoo, finalizador, base, batom",
    f: "aplicação em close com o resultado",
    el: "Amei {detalhe}, dá pra sentir a textura dos produtos pela tela.",
    mo: "A textura e o acabamento são o que fazem a cliente decidir, e o vídeo em close mostra isso melhor que foto.",
    g: "Se o seu cabelo perde o brilho no segundo dia, presta atenção nisso.",
    c: "Mostro a aplicação de {produto} em close, com o som e a textura, e o resultado aparecendo.",
    fi: "Fecho com o resultado na luz natural da janela, sem filtro.",
    nu: "Pensei numa versão só com a aplicação em close, boa pra usar em anúncio.",
    pd: "o lançamento da linha nova", pc: "uso esse tipo de produto toda semana na minha rotina" },
  { id: "skincare", cat: "beleza", n: "Skincare", ex: "Protetor solar, sérum, hidratante",
    f: "rotina de cuidado em tempo real",
    el: "Gostei muito de {detalhe}, vocês explicam o produto de um jeito simples.",
    mo: "Skincare é compra de confiança: a cliente quer ver textura e acabamento numa pele real antes de pagar.",
    g: "Eu achava que cuidar da pele levava meia hora. Leva três minutos.",
    c: "Mostro {produto} entrando na minha rotina: textura no dedo, aplicação e acabamento na pele sem maquiagem.",
    fi: "Termino com a pele no fim do dia, mostrando como ficou.",
    nu: "Consigo gravar com luz natural pra mostrar o acabamento real.",
    pd: "os posts explicando os ativos", pc: "como mãe, tenho pouco tempo e preciso de uma rotina simples" },
  { id: "moda", cat: "moda", n: "Moda e acessórios", ex: "Roupas, bolsas, bijuterias, calçados",
    f: "um look, três jeitos de usar",
    el: "Amei {detalhe}, as peças de vocês combinam com a vida real.",
    mo: "Quem compra roupa pela internet quer ver caimento e movimento num corpo de verdade.",
    g: "Uma peça só, e eu saí de casa três vezes com ela essa semana.",
    c: "Mostro {produto} em três situações do meu dia, com o caimento e o movimento.",
    fi: "Fecho com o detalhe que mais gostei, em close.",
    nu: "Já separei as três situações do dia pra mostrar a peça.",
    pd: "os looks montados com clientes reais", pc: "vivo na correria e preciso de roupa que funcione o dia inteiro" },
  { id: "alimentacao", cat: "comida", n: "Alimentação e lanches", ex: "Lanches, snacks, delivery, mercado",
    f: "primeira mordida de verdade",
    el: "Que delícia {detalhe}, o perfil de vocês dá água na boca.",
    mo: "Comida vende pelo apetite, e a reação na primeira mordida convence mais que qualquer descrição.",
    g: "Isso aqui virou o lanche preferido lá de casa.",
    c: "Mostro {produto} no nosso dia, da embalagem até a hora de comer, com a reação de quem prova.",
    fi: "Termino com o prato vazio e alguém pedindo mais.",
    nu: "Já pensei no momento do dia em que esse lanche faz mais sentido aqui em casa.",
    pd: "as embalagens novas", pc: "procuro lanche prático pra família todo dia" },
  { id: "bemestar", cat: "comida", n: "Suplementos e bem-estar", ex: "Vitaminas, chás, colágeno, fitness",
    f: "rotina da manhã",
    el: "Gostei muito de {detalhe}, vocês falam de saúde sem exagero.",
    mo: "Bem-estar é sobre hábito, e o vídeo da rotina mostra o produto encaixando no dia de alguém real.",
    g: "Minha manhã mudou quando eu parei de pular essa parte.",
    c: "Mostro {produto} entrando na minha rotina da manhã, do preparo ao primeiro gole.",
    fi: "Fecho com o resto do meu dia começando com mais disposição.",
    nu: "Consigo gravar a rotina real, no horário em que eu realmente uso.",
    pd: "os conteúdos sobre hábitos saudáveis", pc: "estou cuidando mais de mim depois que virei mãe" },
  { id: "apps", cat: "digital", n: "Apps e tecnologia", ex: "Aplicativos, eletrônicos, serviços digitais",
    f: "resolvendo um problema na tela",
    el: "Curti muito {detalhe}, vocês explicam tecnologia de um jeito leve.",
    mo: "As pessoas baixam um app quando veem ele resolvendo um problema delas, e a gravação da tela mostra isso direto.",
    g: "Eu perdia um tempão com isso até descobrir esse truque.",
    c: "Mostro o problema da vida real e resolvo com {produto}, com a tela gravada e eu explicando.",
    fi: "Termino com o tempo que sobrou pra fazer outra coisa.",
    nu: "Já mapeei o problema do dia a dia que o app resolve aqui em casa.",
    pd: "as dicas de uso que vocês postam", pc: "uso o celular pra organizar a casa e o trabalho" },
  { id: "educacao", cat: "digital", n: "Educação e cursos", ex: "Cursos online, idiomas, escolas",
    f: "o antes e depois de aprender",
    el: "Gostei de {detalhe}, dá vontade de aprender só de ver.",
    mo: "Curso vende pela transformação, e o vídeo mostra alguém real usando o que aprendeu.",
    g: "Eu jurava que não tinha tempo pra estudar.",
    c: "Mostro como encaixo {produto} nos intervalos do meu dia, com a tela da aula aparecendo.",
    fi: "Fecho com o que eu já consigo fazer depois das primeiras aulas.",
    nu: "Pensei também num vídeo mostrando a primeira aula em tempo real.",
    pd: "os depoimentos de alunos", pc: "estudo nos intervalos da rotina com criança" },
  { id: "viagem", cat: "outros", n: "Viagem e passeios", ex: "Hotéis, pousadas, passeios, malas",
    f: "o lugar visto pela família",
    el: "Que lindo {detalhe}, o perfil de vocês já dá vontade de fazer a mala.",
    mo: "Quem viaja com a família quer saber se o lugar funciona com criança, e o vídeo mostra isso sem filtro.",
    g: "Viajar com criança pequena pode ser leve. Olha esse lugar.",
    c: "Mostro {produto} pelo olhar da família: chegada, os cantinhos e o que as crianças mais curtiram.",
    fi: "Termino com o momento mais gostoso da viagem.",
    nu: "Consigo mostrar o que importa pra quem viaja com criança, que é o que mais perguntam.",
    pd: "as fotos de hóspedes", pc: "viajo com criança e sei o que faz diferença" },
  { id: "papelaria", cat: "outros", n: "Papelaria e organização", ex: "Agendas, cadernos, planners, canetas",
    f: "organizando a semana comigo",
    el: "Amei {detalhe}, cada peça de vocês é um carinho.",
    mo: "Papelaria vende pelo detalhe e pela sensação de organização, e o vídeo mostra as duas coisas.",
    g: "Minha semana só funciona por causa disso aqui.",
    c: "Mostro como organizo a semana da família usando {produto}, com os detalhes em close.",
    fi: "Fecho com a semana toda planejada na mesa.",
    nu: "Já separei a semana real da família pra mostrar a organização.",
    pd: "a coleção nova de estampas", pc: "organizo a rotina da casa e do trabalho no papel" }
];

var ABD_PASSOS = [
  { k: "abertura", n: 1, t: "Abertura", s: "Primeira mensagem. Só pra ouvir um \"pode mandar\"." },
  { k: "proposta", n: 2, t: "Proposta", s: "Depois do sim. Gancho, cena e final do vídeo." },
  { k: "followup", n: 3, t: "Follow-up", s: "Depois de 48h sem resposta." }
];

var ABD_ROTULOS = {
  marca: "nome da marca", produto: "produto", detalhe: "o que você viu no perfil",
  contexto: "por que você", gancho: "gancho", nome: "seu nome", portfolio: "link do portfólio",
  momento: "momento da marca", bem: "o que ela faz bem", pede: "o que o briefing pede",
  cena: "a cena", final: "o final", gancho2: "segundo gancho", prova: "sua prova"
};

var ABD_CHECK_MARCAS = [
  "A primeira frase fala da marca, não de mim",
  "O gancho está escrito, não só prometido",
  "O produto aparece de verdade no vídeo",
  "Não sobrou nenhum campo em amarelo",
  "Anotei a data pra mandar o follow-up"
];
var ABD_CHECK_PLAT = [
  "Li o briefing inteiro antes de escrever",
  "A primeira frase fala da marca",
  "A ideia entrega o que a campanha pediu",
  "O gancho está escrito com todas as letras",
  "O produto aparece em uso de verdade",
  "Sem link, @ ou contato no texto",
  "Ficou em até 850 caracteres"
];

var abd = null;

function abdPadrao(){
  return {
    parte: "marcas",
    perfil: { nome: "Luana Coin", portfolio: "https://luanacoin.com", prova: "" },
    marcas: { nicho: "maternidade", marca: "", produto: "", detalhe: "", contexto: "", ganchos: {}, check: [] },
    plat: { marca: "", produto: "", momento: "", bem: "", pede: "", contexto: "", gancho: "", cena: "", final: "", gancho2: "", texto: null, check: [] },
    placar: 0
  };
}
function abdCarregar(){
  var d = abdPadrao();
  try{
    var s = JSON.parse(localStorage.getItem(ABD_CHAVE) || "null");
    if(s){
      d.parte = s.parte === "plataformas" ? "plataformas" : "marcas";
      Object.assign(d.perfil, s.perfil || {});
      Object.assign(d.marcas, s.marcas || {});
      Object.assign(d.plat, s.plat || {});
      d.placar = Math.max(0, Math.min(10, Number(s.placar) || 0));
    }
  }catch(e){}
  if(!ABD_NICHOS.some(function(n){ return n.id === d.marcas.nicho; })) d.marcas.nicho = ABD_NICHOS[0].id;
  return d;
}
function abdSalvar(){
  try{ localStorage.setItem(ABD_CHAVE, JSON.stringify(abd)); }catch(e){}
}

function abdEsc(t){
  return String(t === null || t === undefined ? "" : t).replace(/[&<>"']/g, function(c){
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
  });
}
function abdSemAcento(t){ return String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function abdNichoAtual(){ return ABD_NICHOS.find(function(n){ return n.id === abd.marcas.nicho; }) || ABD_NICHOS[0]; }
function abdGancho(n){ var g = abd.marcas.ganchos[n.id]; return g !== undefined ? g : n.g; }

async function abdCopiar(texto){
  try{ await navigator.clipboard.writeText(texto); return true; }catch(e){}
  var ta = document.createElement("textarea");
  ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  var ok = false;
  try{ ok = document.execCommand("copy"); }catch(e){ ok = false; }
  document.body.removeChild(ta);
  return ok;
}
function abdAvisoCopiado(botao, ok){
  botao.textContent = ok ? "Copiado" : "Selecione e copie";
  botao.classList.toggle("feito", ok);
  setTimeout(function(){ botao.textContent = "Copiar"; botao.classList.remove("feito"); }, 1800);
}

function abdCampo(id, rotulo, valor, opcoes){
  opcoes = opcoes || {};
  var ctrl = opcoes.area
    ? '<textarea id="abd_' + id + '" data-k="' + id + '" rows="' + (opcoes.linhas || 2) + '" placeholder="' + abdEsc(opcoes.ph || "") + '">' + abdEsc(valor) + '</textarea>'
    : '<input id="abd_' + id + '" data-k="' + id + '" value="' + abdEsc(valor) + '" placeholder="' + abdEsc(opcoes.ph || "") + '">';
  return '<div class="abd-campo"><label for="abd_' + id + '">' + rotulo + (opcoes.opcional ? ' <i>(opcional)</i>' : '') + '</label>' + ctrl +
    (opcoes.ajuda ? '<small>' + opcoes.ajuda + '</small>' : '') + '</div>';
}
function abdChecklist(lista, marcados, grupo){
  return '<div class="abd-check">' + lista.map(function(item, i){
    return '<label><input type="checkbox" data-check="' + grupo + '" data-i="' + i + '"' + (marcados.indexOf(i) >= 0 ? " checked" : "") + '><span>' + abdEsc(item) + '</span></label>';
  }).join("") + '</div>';
}
function abdLigarChecklist(painel, alvo){
  painel.querySelectorAll('input[data-check]').forEach(function(cb){
    cb.addEventListener("change", function(){
      var i = Number(cb.dataset.i);
      var lista = alvo.check.filter(function(x){ return x !== i; });
      if(cb.checked) lista.push(i);
      alvo.check = lista;
      abdSalvar();
    });
  });
}

/* ============================================================================
   A ABA
============================================================================ */
async function abaAbordagens(painel){
  abd = abdCarregar();
  painel.innerHTML =
    '<div class="abd-abas" role="tablist">' +
      '<button type="button" role="tab" data-parte="plataformas" aria-selected="' + (abd.parte === "plataformas") + '">Plataformas</button>' +
      '<button type="button" role="tab" data-parte="marcas" aria-selected="' + (abd.parte === "marcas") + '">Marcas</button>' +
    '</div>' +
    '<div id="abdParte"></div>';
  painel.querySelectorAll(".abd-abas button").forEach(function(b){
    b.addEventListener("click", function(){
      abd.parte = b.dataset.parte;
      abdSalvar();
      painel.querySelectorAll(".abd-abas button").forEach(function(x){ x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      abdMostrarParte(painel.querySelector("#abdParte"));
    });
  });
  abdMostrarParte(painel.querySelector("#abdParte"));
}

function abdMostrarParte(caixa){
  if(abd.parte === "plataformas") abdPartePlataformas(caixa);
  else abdParteMarcas(caixa);
}

/* ============================================================================
   MARCAS: conversa pronta por nicho
============================================================================ */
function abdModelos(n){
  return {
    abertura:
      "Oi, pessoal da {marca}! " + n.el + "\n" +
      "Tive uma ideia de vídeo com {produto} no formato \"" + n.f + "\" e queria muito te mostrar.\n" +
      "Posso mandar por aqui?",
    proposta:
      "Oba, que bom que vocês responderam!\n" +
      n.mo + "\n" +
      "Pensei em mim porque {contexto}.\n" +
      "O vídeo começa comigo dizendo: \"{gancho}\"\n" +
      n.c + " " + n.fi + "\n" +
      "Posso te mandar a proposta com formato, prazo e valor?\n\n" +
      "{nome}\n{portfolio}",
    followup:
      "Oi, pessoal da {marca}! Voltando aqui sobre a ideia de vídeo com {produto}.\n" +
      n.nu + "\n" +
      "Se fizer sentido pra vocês, te mando tudo ainda hoje. Pode ser?"
  };
}

function abdPreencher(modelo, valores){
  var faltam = [];
  var html = "", texto = "";
  modelo.split(/(\{\w+\})/).forEach(function(parte){
    var m = parte.match(/^\{(\w+)\}$/);
    if(m && ABD_ROTULOS[m[1]]){
      var v = String(valores[m[1]] || "").trim();
      if(v){ html += '<span class="abd-tok">' + abdEsc(v) + '</span>'; texto += v; }
      else{
        if(faltam.indexOf(ABD_ROTULOS[m[1]]) < 0) faltam.push(ABD_ROTULOS[m[1]]);
        html += '<span class="abd-vazio">' + abdEsc(ABD_ROTULOS[m[1]]) + '</span>';
        texto += "[" + ABD_ROTULOS[m[1]] + "]";
      }
    }else{ html += abdEsc(parte); texto += parte; }
  });
  return { html: html, texto: texto, faltam: faltam };
}

function abdValoresMarcas(){
  var m = abd.marcas;
  return {
    marca: m.marca, produto: m.produto, detalhe: m.detalhe, contexto: m.contexto,
    gancho: abdGancho(abdNichoAtual()), nome: abd.perfil.nome, portfolio: abd.perfil.portfolio
  };
}

function abdParteMarcas(caixa){
  var m = abd.marcas;
  caixa.innerHTML =
    '<p class="abd-intro">A conversa inteira pra chamar uma marca direto (DM ou e-mail): a mensagem que abre a porta, a proposta com a ideia do vídeo e o follow-up. Escolha o nicho, preencha os campos e copie.</p>' +
    '<div class="abd-regras">' +
      '<div class="abd-regra"><b><span class="num">01</span>Troque tudo que está em amarelo</b>Marca, produto e o que você viu no perfil. Mensagem com cara de modelo não recebe resposta.</div>' +
      '<div class="abd-regra"><b><span class="num">02</span>Só o que for verdade</b>O "por que você" e o gancho precisam ser da sua vida real. Se não combina, escolha outro nicho.</div>' +
      '<div class="abd-regra"><b><span class="num">03</span>Elogie, não corrija</b>Na primeira mensagem fale do que a marca faz bem. Apontar o que falta soa como crítica.</div>' +
    '</div>' +
    '<div class="abd-grade">' +
      '<div class="abd-coluna">' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo">Nicho</h3>' +
          '<div class="abd-campo abd-busca"><input id="abdBusca" placeholder="Buscar nicho ou produto (ex.: fralda, panela)" aria-label="Buscar nicho"></div>' +
          '<div class="abd-nichos" id="abdNichos"></div>' +
          '<div class="abd-nicho-info" id="abdNichoInfo"></div>' +
        '</section>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo">A marca</h3>' +
          abdCampo("marca", "Nome da marca", m.marca, { ph: "Ex.: Bebê Feliz" }) +
          abdCampo("produto", "Produto ou serviço", m.produto, { ph: "Ex.: a fralda noturna", ajuda: "Com o artigo: \"a fralda\", \"o carrinho\"." }) +
          abdCampo("detalhe", "O que você viu de bom no perfil deles", m.detalhe, { area: true, ajuda: "Uma coisa específica. É o que prova que você olhou de verdade." }) +
          abdCampo("contexto", "Por que você", m.contexto, { area: true, ajuda: "Continua a frase \"pensei em mim porque...\". Sua rotina real." }) +
          '<div class="abd-campo"><label for="abd_gancho">Gancho do vídeo</label>' +
            '<textarea id="abd_gancho" rows="2"></textarea>' +
            '<small>A primeira frase que você fala, escrita com todas as letras. Escreva uns 5 ganchos diferentes e fique com o melhor. <button type="button" class="abd-link" id="abdVoltarGancho">Voltar ao sugerido</button></small>' +
          '</div>' +
        '</section>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo">Seus dados</h3>' +
          '<div class="abd-duas">' +
            abdCampo("nome", "Seu nome", abd.perfil.nome) +
            abdCampo("portfolio", "Link do portfólio", abd.perfil.portfolio) +
          '</div>' +
          '<p class="abd-sub" style="margin:0">Fica salvo neste navegador.</p>' +
        '</section>' +
      '</div>' +
      '<div class="abd-coluna">' +
        '<div id="abdMsgs" class="abd-coluna"></div>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo">Antes de enviar</h3>' +
          abdChecklist(ABD_CHECK_MARCAS, m.check, "marcas") +
        '</section>' +
        '<p class="abd-rodape">pra fechar 1 campanha, fale com 10 marcas</p>' +
      '</div>' +
    '</div>';

  var busca = caixa.querySelector("#abdBusca");
  busca.addEventListener("input", function(){ abdListaNichos(caixa); });
  caixa.querySelector("#abdNichos").addEventListener("click", function(e){
    var b = e.target.closest(".abd-chip");
    if(!b) return;
    m.nicho = b.dataset.id;
    abdSalvar();
    abdListaNichos(caixa);
    abdInfoNicho(caixa);
    abdMensagens(caixa);
  });

  caixa.querySelectorAll("[data-k]").forEach(function(el){
    el.addEventListener("input", function(){
      var k = el.dataset.k;
      if(k === "nome" || k === "portfolio") abd.perfil[k] = el.value;
      else m[k] = el.value;
      abdSalvar();
      abdMensagens(caixa);
    });
  });
  var gancho = caixa.querySelector("#abd_gancho");
  gancho.addEventListener("input", function(){
    m.ganchos[abdNichoAtual().id] = gancho.value;
    abdSalvar();
    abdMensagens(caixa);
  });
  caixa.querySelector("#abdVoltarGancho").addEventListener("click", function(){
    delete m.ganchos[abdNichoAtual().id];
    abdSalvar();
    abdInfoNicho(caixa);
    abdMensagens(caixa);
  });

  caixa.querySelector("#abdMsgs").addEventListener("click", async function(e){
    var b = e.target.closest(".abd-copiar");
    if(!b) return;
    var r = abdPreencher(abdModelos(abdNichoAtual())[b.dataset.k], abdValoresMarcas());
    abdAvisoCopiado(b, await abdCopiar(r.texto));
  });

  abdLigarChecklist(caixa, m);
  abdListaNichos(caixa);
  abdInfoNicho(caixa);
  abdMensagens(caixa);
}

function abdListaNichos(caixa){
  var q = abdSemAcento(caixa.querySelector("#abdBusca").value.trim());
  var html = "";
  Object.keys(ABD_CATS).forEach(function(cat){
    var itens = ABD_NICHOS.filter(function(n){ return n.cat === cat && (!q || abdSemAcento(n.n + " " + n.ex).indexOf(q) >= 0); });
    if(!itens.length) return;
    html += '<div><div class="abd-grupo-rotulo">' + abdEsc(ABD_CATS[cat]) + '</div><div class="abd-chips">' +
      itens.map(function(n){
        return '<button type="button" class="abd-chip" data-id="' + n.id + '" aria-pressed="' + (n.id === abd.marcas.nicho) + '">' + abdEsc(n.n) + '</button>';
      }).join("") + '</div></div>';
  });
  caixa.querySelector("#abdNichos").innerHTML = html || '<p class="abd-sub" style="margin:0">Nenhum nicho com esse nome. Tente pelo produto, tipo "fralda" ou "panela".</p>';
}

function abdInfoNicho(caixa){
  var n = abdNichoAtual();
  caixa.querySelector("#abdNichoInfo").innerHTML =
    '<b>' + abdEsc(n.n) + '</b><br>' + abdEsc(n.ex) + '<br><span style="color:#725A50">Ideia de vídeo: ' + abdEsc(n.f) + '</span>';
  caixa.querySelector("#abd_detalhe").placeholder = "Ex.: " + n.pd;
  caixa.querySelector("#abd_contexto").placeholder = "Ex.: " + n.pc;
  caixa.querySelector("#abd_gancho").value = abdGancho(n);
}

function abdMensagens(caixa){
  var modelos = abdModelos(abdNichoAtual());
  var valores = abdValoresMarcas();
  caixa.querySelector("#abdMsgs").innerHTML = ABD_PASSOS.map(function(p){
    var r = abdPreencher(modelos[p.k], valores);
    var status = r.faltam.length
      ? '<span class="abd-status falta">Falta: ' + abdEsc(r.faltam.join(", ")) + '</span>'
      : '<span class="abd-status ok">Pronta pra enviar</span>';
    return '<article class="abd-msg">' +
      '<div class="abd-msg-topo"><span class="abd-letra">' + p.n + '</span><div class="t"><b>' + p.t + '</b><span>' + abdEsc(p.s) + '</span></div>' +
      status + '<button type="button" class="abd-copiar" data-k="' + p.k + '">Copiar</button></div>' +
      '<div class="abd-msg-corpo">' + r.html + '</div>' +
    '</article>';
  }).join("");
}

/* ============================================================================
   PLATAFORMAS: inscrição em campanha (Seu Influencer e parecidas)
============================================================================ */
function abdMontarInscricao(){
  var p = abd.plat;
  var v = function(k){ return String(p[k] || "").trim(); };
  var tira = function(t){ return t.replace(/[.!\s]+$/, ""); };
  var falta = function(k){ return v(k) ? tira(v(k)) : "[" + ABD_ROTULOS[k] + "]"; };

  var abertura = "Oi, time " + (v("marca") || "[" + ABD_ROTULOS.marca + "]") + "! Vi que vocês estão " + falta("momento") +
    (v("bem") ? " e amei " + tira(v("bem")) : "") + ".";
  var entrega = "Minha ideia entrega o que a campanha pede: o vídeo mostra " + falta("pede") + ".";
  var porque = "Pensei em mim porque " + falta("contexto") + ".";
  var video = "O vídeo abre comigo dizendo: \"" + falta("gancho") + "\". " + falta("cena") + ". " + falta("final") + ".";
  var linhas = [abertura, entrega, porque, video];
  if(v("gancho2")) linhas.push("Outra opção de gancho pra testar: \"" + tira(v("gancho2")) + "\".");
  if(String(abd.perfil.prova || "").trim()) linhas.push(tira(String(abd.perfil.prova).trim()) + ".");
  linhas.push("Vou amar criar esse conteúdo com vocês!");
  return linhas.join("\n\n");
}

function abdPartePlataformas(caixa){
  var p = abd.plat;
  caixa.innerHTML =
    '<p class="abd-intro">Pra se inscrever em campanha na Seu Influencer e em outras plataformas. Lá a marca já está procurando creator, então você vai direto com a ideia do vídeo, sem pedir licença e sem mandar link.</p>' +
    '<div class="abd-regras">' +
      '<div class="abd-regra"><b><span class="num">850</span>caracteres é a meta</b>A caixa corta em 900. A folga evita perder o final do texto.</div>' +
      '<div class="abd-regra"><b><span class="num">0</span>links, @ ou contatos</b>A marca já vê seu perfil e seu portfólio dentro da plataforma.</div>' +
      '<div class="abd-regra"><b><span class="num">1</span>inscrição por campanha</b>Nunca mande o mesmo texto pra várias. A marca percebe o modelo na primeira linha.</div>' +
    '</div>' +
    '<div class="abd-grade">' +
      '<div class="abd-coluna">' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo"><span class="abd-letra">1</span>A campanha</h3>' +
          '<p class="abd-sub">Leia o briefing inteiro antes. A primeira frase fala da marca e a ideia precisa entregar o que foi pedido.</p>' +
          '<div class="abd-duas">' +
            abdCampo("marca", "Marca", p.marca) +
            abdCampo("produto", "Produto", p.produto, { ph: "o sérum, a fralda" }) +
          '</div>' +
          abdCampo("momento", "O momento da marca", p.momento, { area: true, ph: "lançando a linha nova pra pele sensível", ajuda: "Continua a frase \"vi que vocês estão...\"." }) +
          abdCampo("bem", "O que ela faz bem", p.bem, { opcional: true, ph: "o cuidado com a embalagem", ajuda: "Continua a frase \"amei...\"." }) +
          abdCampo("pede", "O que o briefing pede", p.pede, { area: true, ph: "o produto na rotina real de uma mãe", ajuda: "Em poucas palavras. Continua a frase \"o vídeo mostra...\"." }) +
        '</section>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo"><span class="abd-letra">2</span>Por que você</h3>' +
          abdCampo("contexto", "Sua rotina com esse produto", p.contexto, { area: true, ph: "sou mãe de primeira viagem e uso isso todo dia", ajuda: "Continua a frase \"pensei em mim porque...\". A marca precisa pensar: ela usaria isso de verdade." }) +
          '<p class="abd-evite">Evite: "sou creator há 1 ano" ou "amo o nicho de beleza". Isso qualquer pessoa escreve.</p>' +
        '</section>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo"><span class="abd-letra">3</span>O vídeo</h3>' +
          '<p class="abd-sub">É aqui que a marca escolhe você. Gancho escrito por inteiro, cena com o produto em uso e o final.</p>' +
          abdCampo("gancho", "O gancho", p.gancho, { area: true, ph: "Ninguém me contou que essa seria a parte mais difícil do dia.", ajuda: "A primeira frase que você fala no vídeo." }) +
          abdCampo("cena", "A cena", p.cena, { area: true, ph: "Mostro o produto no meio da nossa rotina, sem cena montada", ajuda: "O que aparece, com o produto em uso de verdade." }) +
          abdCampo("final", "O final", p.final, { area: true, ph: "Termino com o momento que ficou mais leve", ajuda: "Como o vídeo termina." }) +
          abdCampo("gancho2", "Uma segunda opção de gancho", p.gancho2, { opcional: true, area: true, ajuda: "Mostra que você pensa em teste de anúncio." }) +
        '</section>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo">Sua prova</h3>' +
          abdCampo("prova", "Uma prova curta e verdadeira", abd.perfil.prova, { opcional: true, area: true, ph: "Já criei conteúdo pra mais de 30 marcas de maternidade", ajuda: "Entra no fim do texto. Fica salva pra próxima campanha." }) +
        '</section>' +
      '</div>' +
      '<div class="abd-coluna">' +
        '<section class="abd-msg">' +
          '<div class="abd-msg-topo"><div class="t"><b>Sua inscrição</b><span>Monta sozinha enquanto você preenche. Pode editar direto na caixa.</span></div>' +
            '<div class="abd-acoes"><span class="abd-editado oculto" id="abdEditado">Editado à mão</span>' +
            '<button type="button" class="abd-btn-sec" id="abdRemontar">Montar de novo</button>' +
            '<button type="button" class="abd-copiar" id="abdCopiarInsc">Copiar</button></div>' +
          '</div>' +
          '<textarea class="abd-texto" id="abdTexto" aria-label="Texto da inscrição" spellcheck="true"></textarea>' +
          '<div class="abd-medidor">' +
            '<div class="abd-medidor-topo"><strong id="abdConta">0 <small>caracteres</small></strong><span id="abdContaMsg"></span></div>' +
            '<div class="abd-barra"><i id="abdBarra"></i>' +
              '<span class="marca" style="left:' + (ABD_META / ABD_LIMITE * 100) + '%"><span>850</span></span>' +
              '<span class="marca" style="left:calc(100% - 2px)"><span>900</span></span>' +
            '</div>' +
            '<div class="abd-alertas" id="abdAlertas"></div>' +
          '</div>' +
        '</section>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo">Desafio 10 inscrições</h3>' +
          '<p class="abd-sub" style="margin-top:-6px">Pra fechar 1, se inscreva em 10. Marque aqui conforme for mandando.</p>' +
          '<div class="abd-placar"><div class="abd-bolinhas" id="abdBolinhas"></div><strong id="abdPlacar"></strong></div>' +
          '<div class="abd-acoes" style="margin-top:12px">' +
            '<button type="button" class="abd-copiar" id="abdMaisUm">Mandei mais uma</button>' +
            '<button type="button" class="abd-btn-sec" id="abdMenosUm">Desfazer</button>' +
            '<button type="button" class="abd-btn-sec" id="abdZerar">Zerar</button>' +
          '</div>' +
        '</section>' +
        '<section class="prec-card">' +
          '<h3 class="prec-card-titulo">Antes de enviar</h3>' +
          '<p class="abd-sub" style="margin-top:-6px">Se algum item falhar, reescreva só aquela parte.</p>' +
          abdChecklist(ABD_CHECK_PLAT, p.check, "plat") +
        '</section>' +
        '<button type="button" class="abd-btn-sec" id="abdNova" style="align-self:center">Começar nova inscrição</button>' +
      '</div>' +
    '</div>';

  var texto = caixa.querySelector("#abdTexto");
  function atualizarTexto(){
    if(p.texto === null) texto.value = abdMontarInscricao();
    caixa.querySelector("#abdEditado").classList.toggle("oculto", p.texto === null);
    abdMedir(caixa);
  }

  caixa.querySelectorAll("[data-k]").forEach(function(el){
    el.addEventListener("input", function(){
      if(el.dataset.k === "prova") abd.perfil.prova = el.value;
      else p[el.dataset.k] = el.value;
      abdSalvar();
      atualizarTexto();
    });
  });
  texto.addEventListener("input", function(){
    p.texto = texto.value;
    abdSalvar();
    caixa.querySelector("#abdEditado").classList.remove("oculto");
    abdMedir(caixa);
  });
  caixa.querySelector("#abdRemontar").addEventListener("click", function(){
    p.texto = null; abdSalvar(); atualizarTexto();
  });
  caixa.querySelector("#abdCopiarInsc").addEventListener("click", async function(e){
    abdAvisoCopiado(e.currentTarget, await abdCopiar(texto.value));
  });
  caixa.querySelector("#abdNova").addEventListener("click", function(){
    if(!confirm("Apagar os campos desta campanha e começar outra? Sua prova e o placar continuam.")) return;
    abd.plat = abdPadrao().plat;
    abdSalvar();
    abdPartePlataformas(caixa);
  });

  function placar(){
    var html = "";
    for(var i = 0; i < 10; i++) html += '<i class="' + (i < abd.placar ? "cheia" : "") + '"></i>';
    caixa.querySelector("#abdBolinhas").innerHTML = html;
    caixa.querySelector("#abdPlacar").textContent = abd.placar + " de 10";
  }
  caixa.querySelector("#abdMaisUm").addEventListener("click", function(){ abd.placar = Math.min(10, abd.placar + 1); abdSalvar(); placar(); });
  caixa.querySelector("#abdMenosUm").addEventListener("click", function(){ abd.placar = Math.max(0, abd.placar - 1); abdSalvar(); placar(); });
  caixa.querySelector("#abdZerar").addEventListener("click", function(){ abd.placar = 0; abdSalvar(); placar(); });

  if(p.texto !== null) texto.value = p.texto;
  abdLigarChecklist(caixa, p);
  placar();
  atualizarTexto();
}

function abdMedir(caixa){
  var t = caixa.querySelector("#abdTexto").value;
  var n = t.length; // emoji já conta como 2 aqui, igual em muita caixa de texto
  var cls = n <= ABD_META ? "ok" : n <= ABD_LIMITE ? "atencao" : "ruim";
  var barra = caixa.querySelector("#abdBarra");
  barra.style.width = Math.min(100, n / ABD_LIMITE * 100) + "%";
  barra.className = "abd-" + cls + "-bg";
  caixa.querySelector("#abdConta").innerHTML = n + " <small>caracteres</small>";
  caixa.querySelector("#abdConta").className = "abd-" + cls;
  var msg = caixa.querySelector("#abdContaMsg");
  msg.className = "abd-" + cls;
  msg.textContent = n <= ABD_META ? "Dentro da meta, com folga" : n <= ABD_LIMITE ? "Cabe, mas sem folga. Tente chegar a 850" : "Passou do limite. Corte " + (n - ABD_LIMITE) + " caracteres";

  var alertas = [];
  var faltam = (t.match(/\[[^\]]+\]/g) || []).map(function(x){ return x.slice(1, -1); });
  if(faltam.length) alertas.push({ t: "Ainda falta preencher: " + faltam.filter(function(x, i){ return faltam.indexOf(x) === i; }).join(", ") });
  if(/https?:\/\/|www\.|\.com\b|@\w/i.test(t)) alertas.push({ t: "Tem link, @ ou contato no texto. Tire antes de enviar: a plataforma não deixa.", ruim: true });
  caixa.querySelector("#abdAlertas").innerHTML = alertas.map(function(a){
    return '<p class="' + (a.ruim ? "ruim" : "") + '">' + abdEsc(a.t) + '</p>';
  }).join("");
}
