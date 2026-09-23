/* ============================================================================
   ABA: PITCH
   Monta e-mail (ou DM) de prospecção pra marca nova a partir de poucas
   respostas curtas, diferentes pra cada formato. Guarda os dados no navegador
   (localStorage) e usa a mesma chave de IA já salva na aba Roteiros pra
   escrever o texto pronto.

   Este arquivo é carregado DEPOIS do script principal e do roteiros.js, então
   pode usar tudo que já existe lá: banco, buscarSeguro, escapa, el, icone,
   faixaAviso, irParaAba, mesclarObjetos, buscarChaveIA, mensagemErroIA,
   ANTHROPIC_API_URL, ANTHROPIC_MODEL.
============================================================================ */
"use strict";

var PITCH_FORMATOS = [
  { valor: "email", rotulo: "E-mail" },
  { valor: "dm", rotulo: "Versão de DM" },
  { valor: "segundo_email", rotulo: "Segundo e-mail" },
  { valor: "influencer", rotulo: "Seu Influencer" }
];

/* Cada formato pede perguntas diferentes: a DM não precisa dos mesmos dados
   que um e-mail de follow-up, por exemplo. */
var PITCH_CAMPOS_FORMATO = {
  email: [
    { id: "diferenciais", numero: "01", titulo: "Seus diferenciais", placeholder: "gravo em casa com luz natural, entrego em 5 dias, já fiz pra 20 marcas", ajuda: "O que te faz diferente." },
    { id: "oQueViuNoSite", numero: "02", titulo: "O que você viu no site deles", placeholder: "a linha que não solta revestimento", ajuda: "Uma coisa específica. É o que prova que você olhou." },
    { id: "porQueEssaMarca", numero: "03", titulo: "Por que essa marca, e por que agora", placeholder: "me mudei e estou montando a cozinha do zero", ajuda: "A parte que faz ela responder." },
    { id: "ideiaConteudo", numero: "04", titulo: "Sua ideia de conteúdo", placeholder: "a chegada da caixa, o primeiro uso e a lavagem, em tempo real", ajuda: "Quanto mais específica, melhor." },
    { id: "maisAlgumaCoisa", numero: "05", titulo: "Mais alguma coisa?", placeholder: "tenho as próximas duas semanas livres", ajuda: "Opcional.", opcional: true }
  ],
  dm: [
    { id: "quemVoce", numero: "01", titulo: "Quem você é, em uma linha", placeholder: "trabalho com criação de conteúdo para marcas", ajuda: "Na DM ninguém lê currículo." },
    { id: "oQuePedir", numero: "02", titulo: "O que você quer pedir", placeholder: "um e-mail", ajuda: "O objetivo da DM é só esse: conseguir o canal pra mandar a proposta.", obrigatorio: true },
    { id: "viuNoPerfil", numero: "03", titulo: "O que você viu no perfil deles", placeholder: "o post do lançamento de ontem", ajuda: "Opcional. Entra na versão com elogio.", opcional: true },
    { id: "jaClienteOuFa", numero: "04", titulo: "Você já é cliente ou fã?", placeholder: "sou cliente de vocês há anos", ajuda: "Opcional. Entra na versão de cliente pra marca.", opcional: true }
  ],
  segundo_email: [
    { id: "sobrePrimeiro", numero: "01", titulo: "Sobre o que era o primeiro e-mail", placeholder: "a ideia de gravar a chegada e o primeiro uso das panelas", ajuda: "Uma linha pra ela lembrar de você." },
    { id: "segundoContato", numero: "02", titulo: "Qual segundo contato você quer pedir", placeholder: "WhatsApp", ajuda: "O objetivo desse e-mail é reabrir a conversa e conseguir outro canal." },
    { id: "quandoMandouPrimeiro", numero: "03", titulo: "Quando você mandou o primeiro", placeholder: "semana passada", ajuda: "Opcional.", opcional: true }
  ],
  influencer: [
    { id: "quemVoce", numero: "01", titulo: "Quem você é, em uma linha", placeholder: "criadora de conteúdo UGC especializada em casa e decoração", ajuda: "O que aparece primeiro no seu perfil." },
    { id: "numeros", numero: "02", titulo: "Seus números", placeholder: "+300 marcas atendidas, +500 vídeos entregues", ajuda: "O que prova que você entrega." },
    { id: "tipoDeMarca", numero: "03", titulo: "Que tipo de marca você quer atrair", placeholder: "marcas de casa e decoração", ajuda: "Opcional. Ajuda a bio a filtrar quem te chama.", opcional: true }
  ]
};

var PITCH_INTRO_FORMATO = {
  email: "Cinco perguntas. Responde do jeito que você falaria, do resto eu cuido.",
  dm: "A DM não vende: ela só pede o canal pra você mandar a proposta depois. Duas perguntas já bastam.",
  segundo_email: "Esse e-mail não insiste na proposta: ele reabre a conversa e pede outro canal de contato.",
  influencer: "Três perguntas curtas, pra virar uma bio de uma linha do jeito que aparece num perfil de plataforma."
};

var pitchPerfil = { nome: "Luana Coin", arroba: "luanacoin", portfolio: "https://luanacoin.com", cidade: "" };
var pitchRespostas = montarRespostasVaziasPitch();
var pitchFormatoAtivo = "email";
var pitchVersoes = {};
var pitchIndiceVersao = {};
var pitchChats = {};

function montarRespostasVaziasPitch(){
  var respostas = {};
  Object.keys(PITCH_CAMPOS_FORMATO).forEach(function(formato){
    var obj = {};
    PITCH_CAMPOS_FORMATO[formato].forEach(function(campo){ obj[campo.id] = ""; });
    respostas[formato] = obj;
  });
  return respostas;
}

/* ============================================================================
   PERSISTÊNCIA LOCAL (localStorage, só neste navegador)
============================================================================ */
function carregarLocalPitch(){
  try{
    var perfilSalvo = JSON.parse(localStorage.getItem("pitchPerfil") || "null");
    if(perfilSalvo) pitchPerfil = mesclarObjetos(pitchPerfil, perfilSalvo);
    var respostasSalvas = JSON.parse(localStorage.getItem("pitchRespostas") || "null");
    if(respostasSalvas){
      Object.keys(pitchRespostas).forEach(function(formato){
        if(respostasSalvas[formato]) pitchRespostas[formato] = mesclarObjetos(pitchRespostas[formato], respostasSalvas[formato]);
      });
    }
  }catch(erro){ /* localStorage indisponível: segue só com os valores padrão */ }
}

function salvarLocalPitch(){
  try{
    localStorage.setItem("pitchPerfil", JSON.stringify(pitchPerfil));
    localStorage.setItem("pitchRespostas", JSON.stringify(pitchRespostas));
  }catch(erro){}
}

/* ============================================================================
   RASCUNHO PADRÃO (sem IA, aparece na hora)
============================================================================ */
function valorOuPlaceholder(valor, placeholder){
  return valor && valor.trim() ? valor.trim() : placeholder;
}

function montarRascunhoPitch(formato, p, r){
  var nome = valorOuPlaceholder(p.nome, "[[seu nome]]");
  var arroba = p.arroba && p.arroba.trim() ? "@" + p.arroba.trim().replace(/^@/, "") : "[[seu @]]";
  var portfolio = valorOuPlaceholder(p.portfolio, "[[link do portfólio]]");

  if(formato === "dm"){
    var quemVoce = valorOuPlaceholder(r.quemVoce, "[[quem você é, em uma linha]]");
    var oQuePedir = valorOuPlaceholder(r.oQuePedir, "[[o que você quer pedir]]");
    var extrasDm = "";
    if(r.viuNoPerfil && r.viuNoPerfil.trim()) extrasDm += "Vi " + r.viuNoPerfil.trim() + " e amei! ";
    if(r.jaClienteOuFa && r.jaClienteOuFa.trim()) extrasDm += (extrasDm ? "Aliás, " : "") + r.jaClienteOuFa.trim() + ". ";
    var corpoDm = "Oi, [[nome da marca]]! Tudo bem?\n\n" + quemVoce + ". Tenho uma proposta que gostaria de mandar pra vocês." +
      (extrasDm ? "\n\n" + extrasDm.trim() : "") +
      "\n\nPoderiam me passar " + oQuePedir + " específico pra esse tipo de contato?\n\nAgradeço desde já e fico no aguardo!";
    return { assunto: "", corpo: corpoDm };
  }

  if(formato === "segundo_email"){
    var sobrePrimeiro = r.sobrePrimeiro && r.sobrePrimeiro.trim() ? r.sobrePrimeiro.trim() : null;
    var segundoContato = valorOuPlaceholder(r.segundoContato, "[[segundo canal de contato, ex: WhatsApp]]");
    var assuntoSegundo = sobrePrimeiro ? "Sobre " + sobrePrimeiro : "[[assunto do primeiro e-mail]]";
    var lembreteQuando = (r.quandoMandouPrimeiro && r.quandoMandouPrimeiro.trim()) ? " (mandei " + r.quandoMandouPrimeiro.trim() + ")" : "";
    return { assunto: assuntoSegundo, corpo:
      "Oie, [[pessoa ou nome da marca]]!\n\n" +
      "Passando rapidinho pra saber se vocês conseguiram ver " + (sobrePrimeiro ? "meu e-mail sobre " + sobrePrimeiro : "[[meu último e-mail]]") + lembreteQuando + " e se faz sentido pra vocês.\n\n" +
      "Se for melhor, fico à disposição pra conversarmos e entender o momento do lado de vocês! Tenho certeza que a parceria vai ser incrível.\n\n" +
      "Vocês teriam um segundo meio de contato? Se preferir posso chamar através do " + segundoContato + ".\n\n" +
      "Obrigada, fico aguardando\n" + nome
    };
  }

  if(formato === "influencer"){
    var quemVoceInfl = valorOuPlaceholder(r.quemVoce, "[[quem você é, em uma linha]]");
    var numeros = valorOuPlaceholder(r.numeros, "[[seus números]]");
    var tipoDeMarca = valorOuPlaceholder(r.tipoDeMarca, "[[o tipo de marca que você quer atrair]]");
    return { assunto: "", corpo:
      nome + " (" + arroba + ") — " + quemVoceInfl + ". " + numeros + ". Adoraria criar pra " + tipoDeMarca + ". Portfólio: " + portfolio
    };
  }

  var diferenciais = valorOuPlaceholder(r.diferenciais, "[[seus diferenciais]]");
  var oQueViuNoSite = r.oQueViuNoSite && r.oQueViuNoSite.trim() ? r.oQueViuNoSite.trim() : null;
  var porQueEssaMarca = valorOuPlaceholder(r.porQueEssaMarca, "[[por que essa marca, e por que agora]]");
  var ideiaConteudo = valorOuPlaceholder(r.ideiaConteudo, "[[sua ideia de conteúdo]]");
  var maisAlgumaCoisa = r.maisAlgumaCoisa && r.maisAlgumaCoisa.trim() ? r.maisAlgumaCoisa.trim() : null;

  return { assunto: "Proposta de conteúdo pro [[produto]] de vocês", corpo:
    "Oieee [[pessoa ou nome da marca]], tudo bem?\n\n" +
    "Aqui é a " + nome + ", criadora de conteúdo UGC (" + arroba + "). Cheguei em vocês pesquisando [[produto]]" +
      (oQueViuNoSite ? " e acabei reparando " + oQueViuNoSite + "." : ".") + "\n\n" +
    porQueEssaMarca + " — e o produto de vocês é o que falta aqui. É esse aqui ó: [[link do produto]].\n\n" +
    "A ideia: " + ideiaConteudo + ". Isso vira vídeo vertical e fotos pra vocês usarem, inclusive em ads, e eu documento no meu perfil com @ e link.\n\n" +
    diferenciais + ".\n\n" +
    "Se fizer sentido, vai ser incrível ter vocês nesse projeto :)\nPortfólio: " + portfolio + "\n\n" +
    "Att, " + nome + " / " + arroba +
    (maisAlgumaCoisa ? "\n\nP.S.: " + maisAlgumaCoisa + "." : "")
  };
}

/* ============================================================================
   CHAT COM O CLAUDE (reaproveita a chave da Anthropic salva na aba Roteiros)
   Em vez de gerar o texto de uma vez só, conversa de verdade: a criadora pode
   pedir ajustes ("deixa mais curto", "troca o tom") até o texto ficar bom.
============================================================================ */
var PITCH_INSTRUCAO_FORMATO = {
  email: "Escreva um e-mail de prospecção. Estrutura em parágrafos curtos: 1) saudação e como ela chegou até a marca (pesquisando o produto, citando algo específico que viu no site dela, se ela respondeu essa parte); 2) por que essa marca e por que agora, puxando pro produto que falta pra ela; 3) uma ideia de conteúdo que ela já pensou, explicando rapidinho como isso vira material pra marca usar; 4) os diferenciais dela; 5) o convite pra conversar, com o link do portfólio e a assinatura. Se ela tiver respondido alguma coisa extra, feche com um P.S. curto usando isso.",
  dm: "Escreva uma DM curta pro Instagram, de no máximo 4 frases. O único objetivo dela é conseguir um canal melhor (geralmente e-mail) pra mandar a proposta depois — não venda nem explique demais aqui.",
  segundo_email: "Escreva um e-mail de follow-up (segundo contato), educado e curto, sem soar chato ou insistente. Ele lembra rapidinho do primeiro contato e pede um segundo canal, sem repetir a proposta inteira.",
  influencer: "Escreva uma bio curta, de no máximo 3 frases, pro perfil dela numa plataforma de influenciadoras/UGC. Direto ao ponto, sem saudação nem despedida."
};

function montarBlocoRespostasIA(formato, r){
  return PITCH_CAMPOS_FORMATO[formato].map(function(campo){
    return campo.titulo + ": " + (r[campo.id] && r[campo.id].trim() ? r[campo.id].trim() : "-");
  }).join("\n");
}

function montarMensagemInicialChatPitch(formato, p, r){
  var mostraAssunto = (formato === "email" || formato === "segundo_email");
  return "Você é uma parceira de escrita que ajuda uma criadora de conteúdo UGC a escrever textos de prospecção pra marcas, em português do Brasil, sem soar robótico. " +
    "Vamos conversar até o texto ficar bom — a cada pedido meu de ajuste, você reescreve o texto INTEIRO atualizado, nunca só o trecho que mudou.\n\n" +
    PITCH_INSTRUCAO_FORMATO[formato] + "\n" +
    "Marque com colchetes duplos, assim [[desse jeito]], só as partes que mudam de marca pra marca (nome da marca, produto específico, ideia de conteúdo). O resto não vai marcado.\n" +
    "Não invente números, marcas ou fatos que não foram te dados. Resposta marcada com \"-\" significa que eu não respondi; não invente uma resposta pra mim.\n" +
    (mostraAssunto
      ? "Responda SEMPRE nesse formato, começando com o assunto:\nAssunto: <assunto aqui>\n\n<corpo do texto aqui>"
      : "Responda SEMPRE só com o texto (sem \"Assunto:\", sem explicações antes ou depois).") + "\n\n" +
    "Meus dados:\nNome: " + (p.nome || "-") + "\n@: " + (p.arroba || "-") + "\nPortfólio: " + (p.portfolio || "-") + "\nCidade: " + (p.cidade || "-") + "\n\n" +
    "Minhas respostas pra esse formato:\n" + montarBlocoRespostasIA(formato, r) + "\n\n" +
    "Escreve a primeira versão.";
}

async function chamarChatPitch(mensagens){
  var chaveIA = await buscarChaveIA();
  if(!chaveIA){
    return { ok: false, mensagem: "Salve sua chave de IA na aba Roteiros (🧠 Chave da IA) pra poder conversar com o Claude." };
  }

  var corpoPedido = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1200,
    messages: mensagens.map(function(m){ return { role: m.papel, content: m.texto }; })
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
  if(!resposta.ok) return { ok: false, mensagem: mensagemErroIA(dados, resposta.status) };

  var texto = dados && dados.content && dados.content[0] && dados.content[0].text;
  if(!texto) return { ok: false, mensagem: "A IA não respondeu nada. Tenta de novo." };
  return { ok: true, texto: texto };
}

function parseRespostaChatPitch(texto, mostraAssunto){
  if(mostraAssunto){
    var m = texto.match(/^Assunto:\s*(.*?)\n+([\s\S]*)$/i);
    if(m) return { assunto: m[1].trim(), corpo: m[2].trim() };
  }
  return { assunto: "", corpo: texto.trim() };
}

/* ---------- estado + modal do chat ---------- */
function garantirChatPitch(formato){
  if(!pitchChats[formato]) pitchChats[formato] = { mensagens: [], enviando: false };
  return pitchChats[formato];
}

function ultimaMensagemClaudePitch(formato){
  var estado = pitchChats[formato];
  if(!estado) return null;
  for(var i = estado.mensagens.length - 1; i >= 0; i--){
    if(estado.mensagens[i].papel === "assistant") return estado.mensagens[i].texto;
  }
  return null;
}

function abrirChatPitch(mensagemAutomatica){
  lerCamposPerfilPitch();
  var formato = pitchFormatoAtivo;
  var rotulo = PITCH_FORMATOS.filter(function(f){ return f.valor === formato; })[0].rotulo;
  var estado = garantirChatPitch(formato);

  var html = '<p class="form-titulo">Conversar com o Claude · ' + escapa(rotulo) + '</p>' +
    '<div class="chat-pitch-mensagens" id="chatPitchMensagens"></div>' +
    '<form id="formChatPitch" style="display:flex; gap:8px;">' +
      '<textarea id="chatPitchInput" placeholder="Ex: deixa mais curto, ou troca o tom pra mais descontraído" style="flex:1; min-height:44px;"></textarea>' +
      '<button type="submit" class="btn btn-principal">Enviar</button>' +
    '</form>' +
    '<div class="form-acoes" style="margin-top:14px;">' +
      '<button type="button" class="btn" id="btnChatPitchFechar">Fechar sem usar</button>' +
      '<button type="button" class="btn btn-principal" id="btnChatPitchUsar" disabled>Usar esse texto</button>' +
    '</div>';

  abrirModal(html, true);
  modalBox.style.maxWidth = "640px";

  desenharMensagensChatPitch();

  document.getElementById("formChatPitch").addEventListener("submit", function(e){
    e.preventDefault();
    var campo = document.getElementById("chatPitchInput");
    var texto = campo.value.trim();
    if(!texto || estado.enviando) return;
    campo.value = "";
    enviarMensagemUsuarioChatPitch(texto);
  });
  document.getElementById("btnChatPitchFechar").addEventListener("click", fecharModal);
  document.getElementById("btnChatPitchUsar").addEventListener("click", function(){ usarTextoDoChatPitch(); });

  if(estado.mensagens.length === 0){
    enviarMensagemUsuarioChatPitch(montarMensagemInicialChatPitch(formato, pitchPerfil, pitchRespostas[formato]));
  } else if(mensagemAutomatica){
    enviarMensagemUsuarioChatPitch(mensagemAutomatica);
  }
}

function desenharMensagensChatPitch(){
  var formato = pitchFormatoAtivo;
  var estado = pitchChats[formato];
  var area = document.getElementById("chatPitchMensagens");
  if(!area || !estado) return;

  var htmlMsgs = estado.mensagens
    .filter(function(m, i){ return !(i === 0 && m.papel === "user"); }) // esconde a mensagem de contexto inicial (técnica, não é uma "pergunta" de verdade)
    .map(function(m){ return '<div class="bolha-chat ' + (m.papel === "user" ? "usuario" : "claude") + '">' + escapa(m.texto) + '</div>'; })
    .join("");
  if(estado.enviando) htmlMsgs += '<div class="bolha-chat claude carregando">Escrevendo...</div>';

  area.innerHTML = htmlMsgs || '<p style="font-size:.8rem; color:#8a8272;">Escrevendo a primeira versão...</p>';
  area.scrollTop = area.scrollHeight;

  var btnUsar = document.getElementById("btnChatPitchUsar");
  if(btnUsar) btnUsar.disabled = !ultimaMensagemClaudePitch(formato);
}

async function enviarMensagemUsuarioChatPitch(texto){
  var formato = pitchFormatoAtivo;
  var estado = garantirChatPitch(formato);
  estado.mensagens.push({ papel: "user", texto: texto });
  estado.enviando = true;
  desenharMensagensChatPitch();

  var resultado = await chamarChatPitch(estado.mensagens);
  estado.enviando = false;

  if(!resultado.ok){
    estado.mensagens.pop(); // desfaz a pergunta que falhou, pra poder tentar de novo
    desenharMensagensChatPitch();
    var area = document.getElementById("chatPitchMensagens");
    if(area) area.innerHTML += faixaAviso(resultado.mensagem, "erro");
    return;
  }

  estado.mensagens.push({ papel: "assistant", texto: resultado.texto });
  desenharMensagensChatPitch();
}

function usarTextoDoChatPitch(){
  var formato = pitchFormatoAtivo;
  var textoClaude = ultimaMensagemClaudePitch(formato);
  if(!textoClaude) return;
  var mostraAssunto = (formato === "email" || formato === "segundo_email");
  var parse = parseRespostaChatPitch(textoClaude, mostraAssunto);
  pitchVersoes[formato].push({ assunto: parse.assunto, corpo: parse.corpo, origem: "ia" });
  pitchIndiceVersao[formato] = pitchVersoes[formato].length - 1;
  fecharModal();
  desenharVersaoAtualPitch();
}

/* ============================================================================
   GRIFOS: transforma [[trecho]] em <mark> clicável
============================================================================ */
function renderizarCorpoComGrifos(texto){
  var partes = String(texto || "").split(/\[\[(.*?)\]\]/g);
  var html = "";
  partes.forEach(function(parte, i){
    html += (i % 2 === 1) ? ("<mark>" + escapa(parte) + "</mark>") : escapa(parte);
  });
  return html;
}

/* ============================================================================
   ABA PRINCIPAL
============================================================================ */
async function abaPitch(painel){
  carregarLocalPitch();
  garantirVersaoInicialPitch(pitchFormatoAtivo);

  var html = "";
  html += '<p style="font-size:.85rem; color:#6b6353; margin-bottom:16px;">Responde poucas perguntas rápidas e eu escrevo o e-mail (ou a DM) pronto pra mandar pra marca nova, na estrutura que costuma funcionar. Depois é só trocar o que ficar grifado de amarelo pra cada marca nova.</p>';

  html += '<p class="painel-titulo" style="margin-bottom:10px;">A estrutura do e-mail</p>';
  html += '<div class="grade-cartoes">' + [
    ["Parágrafo 1", "Quem você é", "E como você chegou nessa marca."],
    ["Parágrafo 2", "A conexão", "Por que vocês combinam agora."],
    ["Parágrafo 3", "A ideia", "O conteúdo que você já pensou."],
    ["Parágrafo 4", "O convite", "A pergunta e o seu portfólio."]
  ].map(function(c){
    return '<div class="cartao-borda" style="--cor-cartao:var(--orange);">' +
      '<p class="rotulo" style="text-transform:uppercase; letter-spacing:.03em; font-size:.68rem; font-weight:700; color:var(--orange);">' + c[0] + '</p>' +
      '<p style="font-weight:700; margin:2px 0 3px;">' + c[1] + '</p>' +
      '<p class="sub">' + c[2] + '</p>' +
    '</div>';
  }).join("") + '</div>';

  html += faixaAviso('O que muda de marca pra marca fica grifado de amarelo. Clica em cima e escreve. Nada é inventado: se preencher pouco nas respostas, o texto sai mais genérico.');

  html += '<div class="pitch-grade">';

  html += '<div class="coluna-preview"><div class="painel-branco">';
  html += '<p class="painel-titulo">O seu texto</p>';
  html += '<div class="chips" id="pitchFormatos" style="margin-bottom:12px;"></div>';
  html += '<p id="pitchStatusVersao" style="font-size:.72rem; color:#8a8272; margin-bottom:12px;"></p>';
  html += '<div class="form-acoes" style="justify-content:flex-start; gap:8px; margin-top:0; margin-bottom:12px;">' +
    '<button type="button" class="btn btn-principal" id="btnPitchEscrever">Escrever pra mim</button>' +
    '<button type="button" class="btn btn-pequeno" id="btnPitchOutraVersao">Outra versão</button>' +
    '<button type="button" class="btn btn-pequeno" id="btnPitchOriginal">Voltar ao original</button>' +
  '</div>';
  html += '<div class="campo" id="pitchCampoAssunto"><label>Assunto</label><input id="pitchAssunto" placeholder="Assunto do e-mail"></div>';
  html += '<div class="painel-branco" style="background:var(--paper); border-style:dashed; margin-bottom:0;"><div id="pitchCorpo" class="pitch-corpo" contenteditable="true" spellcheck="false"></div></div>';
  html += '<div class="form-acoes" style="margin-top:12px;">' +
    '<span style="font-size:.78rem; color:#8a8272;" id="pitchContadores"></span>' +
    '<button type="button" class="btn" id="btnPitchCopiar">' + icone("copiar") + ' Copiar</button>' +
  '</div>';
  html += '</div></div>'; // painel-branco / coluna-preview

  html += '<div class="coluna-formulario">';
  html += '<p style="font-size:.78rem; color:#6b6353; margin-bottom:14px;" id="pitchIntroFormato"></p>';

  html += '<div class="painel-branco">';
  html += '<p class="painel-titulo">Seus dados</p>';
  html += '<div class="form-linha">' +
    '<div class="campo"><label>Nome</label><input id="pitchNome" value="' + escapa(pitchPerfil.nome) + '"></div>' +
    '<div class="campo"><label>@</label><input id="pitchArroba" value="' + escapa(pitchPerfil.arroba) + '"></div>' +
  '</div>';
  html += '<div class="campo"><label>Portfólio</label><input id="pitchPortfolio" placeholder="https://" value="' + escapa(pitchPerfil.portfolio) + '"></div>';
  html += '<div class="campo" style="margin-bottom:0;"><label>Cidade</label><input id="pitchCidade" placeholder="Opcional" value="' + escapa(pitchPerfil.cidade) + '"></div>';
  html += '</div>';

  html += '<div class="painel-branco">';
  html += '<p class="painel-titulo">Suas respostas</p>';
  html += '<div id="pitchCamposRespostas"></div>';
  html += '<button type="button" class="btn btn-principal" style="width:100%; justify-content:center; margin-top:6px;" id="btnPitchCriarModelo">Criar modelo de e-mail</button>';
  html += '<p style="font-size:.72rem; color:#8a8272; margin-top:8px;" id="pitchAvisoMudou"></p>';
  html += '<button type="button" class="btn btn-pequeno" style="margin-top:10px;" id="btnPitchLimpar">Limpar minhas respostas</button>';
  html += '</div>';

  html += '</div>'; // coluna-formulario
  html += '</div>'; // pitch-grade

  painel.innerHTML = html;

  desenharCamposRespostaPitch();
  ligarEventosPitch();
  desenharFormatosPitch();
  desenharVersaoAtualPitch();
}

function montarCampoRespostaPitch(campo, valor){
  return '<div class="campo">' +
    '<label><span style="color:#c98a00; font-weight:700; margin-right:4px;">' + campo.numero + '</span>' + escapa(campo.titulo) + '</label>' +
    '<textarea id="pitchResposta-' + campo.id + '" placeholder="' + escapa(campo.placeholder || "") + '" style="min-height:60px;">' + escapa(valor) + '</textarea>' +
    '<p style="font-size:.7rem; color:#8a8272; margin-top:4px;">' + escapa(campo.ajuda) + '</p>' +
  '</div>';
}

/* Redesenha só o bloco de perguntas (muda de campo pra campo conforme o
   formato escolhido) e religa os eventos dos campos que trocaram de lugar. */
function desenharCamposRespostaPitch(){
  var area = document.getElementById("pitchCamposRespostas");
  if(!area) return;
  var campos = PITCH_CAMPOS_FORMATO[pitchFormatoAtivo];
  var respostas = pitchRespostas[pitchFormatoAtivo];
  area.innerHTML = campos.map(function(campo){ return montarCampoRespostaPitch(campo, respostas[campo.id]); }).join("");

  campos.forEach(function(campo){
    var elCampo = document.getElementById("pitchResposta-" + campo.id);
    if(!elCampo) return;
    elCampo.addEventListener("input", function(){
      lerCamposPerfilPitch();
      var aviso = document.getElementById("pitchAvisoMudou");
      if(aviso) aviso.textContent = "Você mudou uma resposta. Clica em criar modelo de e-mail pra ele escrever de novo.";
    });
  });

  var introEl = document.getElementById("pitchIntroFormato");
  if(introEl) introEl.textContent = PITCH_INTRO_FORMATO[pitchFormatoAtivo] || "";
}

/* ============================================================================
   EVENTOS
============================================================================ */
function lerCamposPerfilPitch(){
  pitchPerfil = {
    nome: document.getElementById("pitchNome").value.trim(),
    arroba: document.getElementById("pitchArroba").value.trim().replace(/^@/, ""),
    portfolio: document.getElementById("pitchPortfolio").value.trim(),
    cidade: document.getElementById("pitchCidade").value.trim()
  };

  var respostasFormato = {};
  PITCH_CAMPOS_FORMATO[pitchFormatoAtivo].forEach(function(campo){
    var elCampo = document.getElementById("pitchResposta-" + campo.id);
    respostasFormato[campo.id] = elCampo ? elCampo.value.trim() : "";
  });
  pitchRespostas[pitchFormatoAtivo] = respostasFormato;

  salvarLocalPitch();
}

function ligarEventosPitch(){
  ["pitchNome", "pitchArroba", "pitchPortfolio", "pitchCidade"].forEach(function(id){
    var campo = document.getElementById(id);
    if(!campo) return;
    campo.addEventListener("input", function(){
      lerCamposPerfilPitch();
      var aviso = document.getElementById("pitchAvisoMudou");
      if(aviso) aviso.textContent = "Você mudou uma resposta. Clica em criar modelo de e-mail pra ele escrever de novo.";
    });
  });

  document.getElementById("btnPitchCriarModelo").addEventListener("click", function(){ abrirChatPitch(); });
  document.getElementById("btnPitchEscrever").addEventListener("click", function(){ abrirChatPitch(); });
  document.getElementById("btnPitchOutraVersao").addEventListener("click", function(){ abrirChatPitch("Me dá outra versão: mesma ideia, mas com outras palavras."); });
  document.getElementById("btnPitchOriginal").addEventListener("click", function(){ voltarOriginalPitch(); });
  document.getElementById("btnPitchCopiar").addEventListener("click", function(e){ copiarPitch(e.currentTarget); });
  document.getElementById("btnPitchLimpar").addEventListener("click", function(){ limparRespostasPitch(); });

  document.getElementById("pitchAssunto").addEventListener("input", atualizarContadoresPitch);
  var corpoEl = document.getElementById("pitchCorpo");
  corpoEl.addEventListener("input", atualizarContadoresPitch);
  corpoEl.addEventListener("click", function(e){
    var alvo = e.target.closest ? e.target.closest("mark") : null;
    if(!alvo) return;
    var intervalo = document.createRange();
    intervalo.selectNodeContents(alvo);
    var selecao = window.getSelection();
    selecao.removeAllRanges();
    selecao.addRange(intervalo);
  });
}

function desenharFormatosPitch(){
  var area = document.getElementById("pitchFormatos");
  if(!area) return;
  area.innerHTML = "";
  PITCH_FORMATOS.forEach(function(f){
    var chip = el('<button type="button" class="chip ' + (pitchFormatoAtivo === f.valor ? "ativo" : "") + '">' + escapa(f.rotulo) + '</button>');
    chip.addEventListener("click", function(){
      pitchFormatoAtivo = f.valor;
      garantirVersaoInicialPitch(pitchFormatoAtivo);
      desenharFormatosPitch();
      desenharCamposRespostaPitch();
      desenharVersaoAtualPitch();
    });
    area.appendChild(chip);
  });
}

/* ============================================================================
   VERSÕES (rascunho padrão + versões escritas pela IA)
============================================================================ */
function garantirVersaoInicialPitch(formato){
  if(!pitchVersoes[formato]){
    var rascunho = montarRascunhoPitch(formato, pitchPerfil, pitchRespostas[formato]);
    pitchVersoes[formato] = [mesclarObjetos(rascunho, { origem: "rascunho" })];
    pitchIndiceVersao[formato] = 0;
  }
}

function versaoAtualPitch(){
  return pitchVersoes[pitchFormatoAtivo][pitchIndiceVersao[pitchFormatoAtivo]];
}

function desenharVersaoAtualPitch(){
  var v = versaoAtualPitch();
  var formato = pitchFormatoAtivo;
  var total = pitchVersoes[formato].length;
  var indice = pitchIndiceVersao[formato] + 1;

  var mostraAssunto = (formato === "email" || formato === "segundo_email");
  document.getElementById("pitchCampoAssunto").style.display = mostraAssunto ? "" : "none";
  document.getElementById("pitchAssunto").value = v.assunto || "";

  document.getElementById("pitchCorpo").innerHTML = renderizarCorpoComGrifos(v.corpo || "");

  var origemTexto = v.origem === "ia" ? "escrito pela IA" : "o modelo padrão · rascunho, ainda não escrito pra você";
  document.getElementById("pitchStatusVersao").textContent = "Versão " + indice + " de " + total + " · " + origemTexto;

  var avisoMudou = document.getElementById("pitchAvisoMudou");
  if(avisoMudou) avisoMudou.textContent = "";

  atualizarContadoresPitch();
}

function atualizarContadoresPitch(){
  var corpoEl = document.getElementById("pitchCorpo");
  if(!corpoEl) return;
  var texto = (corpoEl.innerText || "").trim();
  var palavras = texto ? texto.split(/\s+/).length : 0;
  var grifos = corpoEl.querySelectorAll("mark").length;
  var span = document.getElementById("pitchContadores");
  if(!span) return;
  span.textContent = palavras + " palavra" + (palavras === 1 ? "" : "s") +
    (grifos > 0 ? " · " + grifos + " grifo" + (grifos === 1 ? "" : "s") + " ainda pra trocar" : " · tudo customizado ✓");
}

function voltarOriginalPitch(){
  pitchIndiceVersao[pitchFormatoAtivo] = 0;
  desenharVersaoAtualPitch();
}

function copiarPitch(botao){
  var mostraAssunto = document.getElementById("pitchCampoAssunto").style.display !== "none";
  var assunto = document.getElementById("pitchAssunto").value;
  var corpoEl = document.getElementById("pitchCorpo");
  var texto = (mostraAssunto && assunto ? "Assunto: " + assunto + "\n\n" : "") + (corpoEl ? corpoEl.innerText : "");
  var original = botao.innerHTML;
  navigator.clipboard.writeText(texto).then(function(){
    botao.innerHTML = "copiado ✓";
    setTimeout(function(){ botao.innerHTML = original; }, 1500);
  }).catch(function(){
    botao.innerHTML = "não deu pra copiar";
    setTimeout(function(){ botao.innerHTML = original; }, 1500);
  });
}

function limparRespostasPitch(){
  if(!window.confirm("Limpar suas respostas desse formato? Isso não apaga os textos já escritos, só o formulário.")) return;
  var vazias = {};
  PITCH_CAMPOS_FORMATO[pitchFormatoAtivo].forEach(function(campo){ vazias[campo.id] = ""; });
  pitchRespostas[pitchFormatoAtivo] = vazias;
  salvarLocalPitch();
  irParaAba("pitch");
}
