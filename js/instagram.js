/* ============================================================================
   ABA: INSTAGRAM (automação de DM, estilo ManyChat)
   Duas sub-abas:
     Automações: a lista, e o editor com a prévia ao vivo (celular).
     Métricas: seguidores, novos seguidores, alcance e leads.

   Como funciona por trás: quando alguém comenta a palavra escolhida num post,
   o Instagram avisa a função "instagram-webhook" no Supabase, que manda a DM.
   Este arquivo só cria e edita as automações (tabela ig_automations) e mostra
   os resultados. Passo a passo de configuração: INSTAGRAM-LEIA-ME.md.

   Este arquivo é carregado DEPOIS do script principal, então pode usar tudo
   que já existe lá: banco, buscarSeguro, escapa, el, icone, faixaAviso,
   irParaAba, abrirModal, fecharModal, guardaFecharModal, modalBox,
   formatarDataHora.
============================================================================ */
"use strict";

var IG_EMOJIS = ["🫶", "👀", "😍", "🥰", "😂", "😮", "🔥", "✨", "💌", "👉", "🙌", "💕"];
var IG_LIMITE_BOTAO = 20;            // o Instagram corta o título do botão em 20 letras
var IG_LIMITE_MSG_COM_BOTAO = 640;   // mensagem com botão anexado: até 640 letras
var IG_LIMITE_MSG = 900;             // mensagem sem botão (o teto real são 1000 bytes)
var IG_MAX_BOTOES = 3;               // botões anexados na mesma mensagem: no máximo 3
var IG_MAX_ARQUIVO_BYTES = 25 * 1024 * 1024;

var igSubabaAtual = "automacoes";
var igPostsCache = null;             // { conectado, posts, motivo }, vindo da função ig-media
var igAssets = [];                   // a biblioteca de arquivos (tabela ig_assets)
var igEd = null;                     // o estado do editor que está aberto
var igEdSujo = false;                // o editor tem alterações não salvas?

/* ============================================================================
   A ABA
============================================================================ */
async function abaInstagram(painel){
  var subabas = [
    { chave: "automacoes", rotulo: "Automações" },
    { chave: "metricas", rotulo: "Métricas" }
  ];
  painel.innerHTML = '<div class="subtabs">' + subabas.map(function(s){
    return '<button type="button" class="subtab-btn ' + (igSubabaAtual === s.chave ? "ativo" : "") + '" data-ig-sub="' + s.chave + '">' + s.rotulo + '</button>';
  }).join("") + '</div><div id="igConteudo"></div>';

  painel.querySelectorAll("[data-ig-sub]").forEach(function(botao){
    botao.addEventListener("click", function(){
      igSubabaAtual = botao.getAttribute("data-ig-sub");
      irParaAba("instagram");
    });
  });

  var area = document.getElementById("igConteudo");
  if(igSubabaAtual === "metricas") await igRenderMetricas(area);
  else await igRenderAutomacoes(area);
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
   SUB-ABA: MÉTRICAS
============================================================================ */
function igGraficoBarras(pontos, classeCor){
  if(!pontos || pontos.length === 0){
    return '<p class="vazio-explicacao">Sem dados nos últimos dias.</p>';
  }
  var maior = 1;
  pontos.forEach(function(p){ if(p.valor > maior) maior = p.valor; });
  var html = '<div class="grafico-barras">';
  pontos.forEach(function(p){
    var altura = Math.round((p.valor / maior) * 90) + 4;
    html += '<div class="barra-dia"><span class="dica">' + igDataCurta(p.dia) + ": " + p.valor + '</span>' +
      '<div class="barra ' + (classeCor || "") + '" style="height:' + altura + 'px"></div>' +
      '<div class="rotulo-dia">' + igDataCurta(p.dia) + '</div></div>';
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

async function igRenderMetricas(area){
  area.innerHTML = '<p class="vazio-explicacao">Carregando métricas...</p>';

  var desde15 = new Date(Date.now() - 15 * 86400000).toISOString();
  var desde7 = new Date(Date.now() - 7 * 86400000).toISOString();

  // Tudo ao mesmo tempo; nenhuma falha derruba as outras.
  var resultados = await Promise.all([
    igChamarFuncao("ig-insights"),
    buscarSeguro(banco.from("ig_leads").select("created_at").gte("created_at", desde15).limit(1000)),
    igContar(banco.from("ig_leads").select("ig_user_id", { count: "exact", head: true })),
    igContar(banco.from("ig_deliveries").select("id", { count: "exact", head: true }).eq("status", "ok").gte("ts", desde7)),
    buscarSeguro(banco.from("ig_token_status").select("*").eq("id", "main").limit(1))
  ]);
  var insights = resultados[0];
  var leadsRecentes = resultados[1];
  var totalLeads = resultados[2];
  var dmsSemana = resultados[3];
  var token = resultados[4];

  var html = "";

  // Aviso do token (vence em ~60 dias; a renovação roda sozinha toda semana).
  var statusToken = token.ok && token.dados.length > 0 ? token.dados[0] : null;
  if(statusToken){
    if(statusToken.last_ok === false){
      html += faixaAviso("A última renovação do token do Instagram falhou: " + (statusToken.last_error || "motivo desconhecido") + ". Se o token vencer, as automações param.", "erro");
    } else if(statusToken.expires_at){
      var diasRestantes = Math.floor((new Date(statusToken.expires_at).getTime() - Date.now()) / 86400000);
      if(diasRestantes <= 10) html += faixaAviso("O token do Instagram vence em " + Math.max(diasRestantes, 0) + " dia(s). Confira se a renovação automática está rodando (INSTAGRAM-LEIA-ME.md).", "erro");
    }
  }

  var leadsPorDia = [];
  if(leadsRecentes.ok){
    var dias = igUltimosDiasISO(15);
    var contagem = {};
    leadsRecentes.dados.forEach(function(l){
      var d = new Date(l.created_at);
      var chave = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
      contagem[chave] = (contagem[chave] || 0) + 1;
    });
    leadsPorDia = dias.map(function(d){ return { dia: d, valor: contagem[d] || 0 }; });
  }

  var ig = insights.ok ? insights.dados : null;
  var conectado = !!(ig && ig.conectado);

  html += '<div class="grade-cartoes">' +
    igCartaoMetrica(conectado ? igFormatarNumero(ig.seguidores) : "-", "seguidores") +
    igCartaoMetrica(conectado ? "+" + igFormatarNumero(igSoma(ig.novos_seguidores)) : "-", "novos seguidores (15 dias)") +
    igCartaoMetrica(conectado ? igFormatarNumero(igSoma(ig.alcance)) : "-", "alcance (15 dias)") +
    igCartaoMetrica(totalLeads === null ? "-" : igFormatarNumero(totalLeads), "leads captados") +
    igCartaoMetrica(dmsSemana === null ? "-" : igFormatarNumero(dmsSemana), "DMs enviadas (7 dias)") +
  '</div>';

  if(!conectado){
    var motivo = !insights.ok
      ? igTextoFuncaoIndisponivel("ig-insights", insights.mensagem)
      : (ig && ig.motivo ? ig.motivo : "");
    html += '<div class="painel-branco"><p class="painel-titulo">Conecte seu Instagram pra ver as métricas</p>' +
      '<p style="font-size:.82rem; color:#6b6353; margin-bottom:8px;">Os números de seguidores e alcance vêm direto do Instagram. Quando você terminar a configuração (INSTAGRAM-LEIA-ME.md), eles aparecem aqui.</p>' +
      (motivo ? '<p style="font-size:.76rem; color:#8a8272;">' + escapa(motivo) + '</p>' : '') +
    '</div>';
  } else {
    html += '<div class="ig-metricas-grade">' +
      '<div class="painel-branco"><p class="painel-titulo">Novos seguidores por dia</p>' + igGraficoBarras(ig.novos_seguidores, "") + '</div>' +
      '<div class="painel-branco"><p class="painel-titulo">Alcance por dia</p>' + igGraficoBarras(ig.alcance, "rosa") + '</div>' +
    '</div>';
    if(ig.avisos && ig.avisos.length > 0){
      html += '<p style="font-size:.74rem; color:#8a8272; margin-bottom:16px;">' + ig.avisos.map(escapa).join("<br>") + '</p>';
    }
  }

  html += '<div class="painel-branco"><p class="painel-titulo">Leads captados por dia</p>' +
    (leadsRecentes.ok ? igGraficoBarras(leadsPorDia, "lima") : faixaAviso("Não consegui ler os leads. Rodou o arquivo instagram.sql no Supabase?", "erro")) +
  '</div>';

  area.innerHTML = html;
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
    '<span style="font-size:.76rem; color:#8a8272;">Quando alguém comenta a palavra escolhida num post, a pessoa recebe uma DM automática.</span>' +
  '</div>';

  if(automacoes.length === 0){
    html += '<div class="vazio-explicacao">Você ainda não criou nenhuma automação. Clique em "Nova automação" para criar a primeira. O editor mostra, ao lado, uma prévia de como a DM chega no celular da pessoa.</div>';
  } else {
    html += '<div class="painel-branco"><div class="tabela-scroll"><table><thead><tr>' +
      '<th>Automação</th><th>Palavras</th><th>Posts</th><th>Ativa</th><th></th>' +
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
}

function igLinhaAutomacao(a){
  var palavras = a.match_any
    ? '<span class="pilula" style="background:#eef2ff; color:#2b6fff;">Qualquer comentário</span>'
    : String(a.keyword || "").split(",").map(function(p){ return p.trim(); }).filter(Boolean).map(function(p){
        return '<span class="pilula" style="background:#efe9db; margin:0 4px 4px 0;">' + escapa(p) + '</span>';
      }).join("");
  var qtdPosts = (a.media_ids || []).length;
  var nome = a.nome && a.nome.trim() ? a.nome : "Automação sem nome";

  var tr = el(
    '<tr class="clicavel">' +
      '<td><strong>' + escapa(nome) + '</strong></td>' +
      '<td>' + (palavras || "-") + '</td>' +
      '<td>' + (qtdPosts === 0 ? "Todos os posts" : qtdPosts + (qtdPosts === 1 ? " post" : " posts")) + '</td>' +
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
        '<td style="color:#6b6353;">' + escapa(d.motivo || "") + '</td></tr>';
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
      '<textarea rows="2" maxlength="300" placeholder="Variação ' + (i + 2) + '" style="flex:1; border:1.5px solid #e0d9c6; border-radius:8px; padding:9px 10px; background:var(--paper); resize:vertical;">' + escapa(texto) + '</textarea>' +
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
    '<p style="font-size:.74rem; color:#6b6353;">Botão: <strong id="igRefBotao"></strong> (leva pra Mensagem 2)</p>' +
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
    msg.style.color = "#8a8272";
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
