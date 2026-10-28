/* ============================================================================
   FINANCEIRO, PARTE 1: ler extrato e fatura (CSV, OFX e PDF) e sugerir a categoria

   Este arquivo só LÊ e INTERPRETA texto. Ele não fala com o banco de dados e não
   mexe na tela, então dá pra testar sozinho. A tela fica em js/financeiro.js.

   Regra de ouro: nada daqui é salvo direto. Tudo vira uma lista de "lançamentos
   sugeridos" que você revisa (marca, desmarca, troca a categoria) antes de confirmar.
   Nenhum banco pede login, senha ou acesso: você mesma baixa o arquivo no app do
   seu banco e entrega aqui.
============================================================================ */
"use strict";

/* ---------- categorias e cores ---------- */
var FIN_CATEGORIAS_DESPESA = ["Casa", "Internet", "Alimentação", "Transporte", "Assinaturas", "Saúde", "Lazer",
  "Compras", "Beleza", "Educação", "Ferramentas", "Marketing", "Impostos e taxas", "Cartão", "Outros"];
var FIN_CATEGORIAS_RECEITA = ["Clientes", "Pix recebido", "Reembolso", "Outros"];

// tons da marca (terracota, sálvia, caramelo, rosa, café) pra os gráficos.
// "Mercado" não está mais na lista, mas a cor fica pra lançamentos antigos que ainda usam essa categoria.
var FIN_CORES = {
  "Casa": "#B5543C", "Internet": "#8A9A6E", "Mercado": "#8A9A6E", "Alimentação": "#C98A55", "Transporte": "#8A6F63",
  "Assinaturas": "#C9807B", "Saúde": "#6E7F52", "Lazer": "#D9B36C", "Compras": "#9A4430",
  "Beleza": "#E8B4B0", "Educação": "#5E6E45", "Ferramentas": "#7A6458", "Marketing": "#D49A3C",
  "Impostos e taxas": "#A08E82", "Cartão": "#4A2E26", "Outros": "#CDBFAA",
  "Clientes": "#6E7F52", "Pix recebido": "#8A9A6E", "Reembolso": "#C98A55"
};
function finCor(categoria){ return FIN_CORES[categoria] || "#CDBFAA"; }

// Palavras que aparecem na descrição e dizem a categoria. A primeira regra que bater vale.
var FIN_REGRAS_DESPESA = [
  { cat: "Cartão", re: /pagamento (de )?fatura|pgto fatura|fatura (do )?cart/ },
  { cat: "Internet", re: /internet|fibra|provedor|wi-?fi|\bclaro\b|\bvivo\b|\btim\b|\boi\b|net ?combo|telecom|telefon/ },
  { cat: "Alimentação", re: /super ?mer|mercado(?! ?livre)|mercadinho|atacad|assa[ií]\b|carrefour|p[aã]o de a[cç][uú]car|hortifruti|sacol[aã]o|bompre[cç]o|nordestin|mateus|guanabara|mercantil|a[cç]ougue|\bfeira\b|ifood|rappi|uber ?eats|restaurante|lanchonete|pizza|hamburg|burger|sushi|padaria|cafeteria|sorvet|a[cç]a[ií]|mcdonald|subway|outback|delivery|habib|bk brasil|bebida|adega|conveni[eê]ncia/ },
  { cat: "Transporte", re: /\buber\b|\b99 ?pop\b|\b99\b|cabify|\bposto\b|combust|\bshell\b|ipiranga|petrobras|estaciona|ped[aá]gio|sem parar|conectcar|metr[oô]|cptm|passagem/ },
  { cat: "Assinaturas", re: /netflix|spotify|prime video|amazon ?prime|anthropic|claude|google g\d|disney|\bhbo\b|youtube|apple\.com|icloud|google (one|storage)|deezer|globoplay|paramount|canva|adobe|chatgpt|openai|notion|dropbox|microsoft|assinatura/ },
  { cat: "Saúde", re: /farm[aá]cia|drogaria|drogasil|droga ?raia|pacheco|pague menos|cl[ií]nica|hospital|laborat[oó]rio|unimed|dentista|psic[oó]log|consulta|exame|plano de sa[uú]de|hapvida/ },
  { cat: "Casa", re: /alugue|condom[ií]nio|energia|\benel\b|celpe|neoenergia|cemig|[aá]gua|compesa|sabesp|\bg[aá]s\b|comg[aá]s|iptu|leroy|tok ?stok|m[oó]veis/ },
  { cat: "Lazer", re: /cinema|ingresso|sympla|\bshow\b|teatro|parque|viagem|hotel|airbnb|booking|latam|gol linhas|azul linhas|decolar|balada/ },
  { cat: "Compras", re: /shopee|mercado ?livre|amazon|magalu|magazine|americanas|shein|renner|\bc ?& ?a\b|riachuelo|zara|aliexpress|\bloja\b|casas bahia|kabum|fast shop|centauro|netshoes/ },
  { cat: "Beleza", re: /sal[aã]o|est[eé]tica|cabelo|barbearia|\bunha|manicure|sobrancelha|c[ií]lios|botic[aá]rio|natura|sephora|\bavon\b|beleza/ },
  { cat: "Educação", re: /\bcurso|escola|faculdade|udemy|hotmart|alura|col[eé]gio|livraria|saraiva|duolingo/ },
  { cat: "Ferramentas", re: /capcut|hostinger|registro\.br|dom[ií]nio|hospedagem|godaddy|\bwix\b|figma|zapier|elementor|vercel|supabase|github|resend/ },
  { cat: "Marketing", re: /meta ads|facebook ?ads|fb ?ads|google ?ads|tiktok ?ads|an[uú]ncio|impulsion|instagram ads/ },
  { cat: "Impostos e taxas", re: /\bdas\b|\bmei\b|darf|imposto|\biof\b|tarifa|anuidade|\btaxa\b|juros|rotativo|multa|encargos|\binss\b|\biss\b/ }
];
var FIN_REGRAS_RECEITA = [
  { cat: "Reembolso", re: /reembolso|estorno|devolu[cç][aã]o|cashback/ },
  { cat: "Clientes", re: /cliente|publi|campanha|parceria|\bnf\b|nota fiscal|\bugc\b|marca/ },
  { cat: "Pix recebido", re: /\bpix\b|transfer[eê]ncia|\bted\b|\bdoc\b|dep[oó]sito/ }
];

function finNormalizar(texto){
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Sugere a categoria pela descrição. "tipo" é "receita" ou "despesa".
function finCategorizar(descricao, tipo){
  var texto = String(descricao || "").toLowerCase();
  var regras = tipo === "receita" ? FIN_REGRAS_RECEITA : FIN_REGRAS_DESPESA;
  for(var i = 0; i < regras.length; i++){
    if(regras[i].re.test(texto)) return regras[i].cat;
  }
  return "Outros";
}

/* ---------- números e datas no formato brasileiro ---------- */
// "1.234,56", "R$ 1.234,56", "-12,90", "(12,90)", "1234.56" -> número (negativo se tiver sinal)
function finParseValor(texto){
  var s = String(texto === null || texto === undefined ? "" : texto).trim();
  if(!s) return NaN;
  var negativo = /^[-−(]/.test(s) || /[-−]\s*$/.test(s) || /\)\s*$/.test(s) && /^\(/.test(s);
  s = s.replace(/R\$|\s|[()]/g, "").replace(/[-−+]/g, "");
  if(!/^[\d.,]+$/.test(s)) return NaN;
  var ultimaVirgula = s.lastIndexOf(","), ultimoPonto = s.lastIndexOf(".");
  if(ultimaVirgula >= 0 && ultimoPonto >= 0){
    if(ultimaVirgula > ultimoPonto) s = s.replace(/\./g, "").replace(",", ".");   // 1.234,56
    else s = s.replace(/,/g, "");                                                  // 1,234.56
  } else if(ultimaVirgula >= 0){
    var depoisVirgula = s.length - ultimaVirgula - 1;
    s = depoisVirgula <= 2 ? s.replace(/,/g, ".") : s.replace(/,/g, "");           // 12,90 ou 1,234
  } else if(ultimoPonto >= 0){
    var depoisPonto = s.length - ultimoPonto - 1;
    if(depoisPonto === 3 && s.indexOf(".") !== ultimoPonto) s = s.replace(/\./g, "");   // 1.234.567
    else if(depoisPonto === 3 && !/^0\./.test(s)) s = s.replace(/\./g, "");              // 1.234
  }
  var n = parseFloat(s);
  if(isNaN(n)) return NaN;
  return negativo ? -n : n;
}

var FIN_MESES_ABREV = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

function finDoisDigitos(n){ return ("0" + n).slice(-2); }

function finHojeISO(){
  var d = new Date();
  return d.getFullYear() + "-" + finDoisDigitos(d.getMonth() + 1) + "-" + finDoisDigitos(d.getDate());
}

// Devolve "AAAA-MM-DD" ou null. Entende 15/10/2026, 15/10/26, 15-10-2026, 2026-10-15, 20261015,
// 15/10 (usa anoRef), "15 out" e "15 out 2026". Se a data sem ano cair no futuro, volta um ano.
function finParseData(texto, anoRef){
  var s = String(texto || "").trim().toLowerCase();
  var m, dia, mes, ano;
  if((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))){ ano = +m[1]; mes = +m[2]; dia = +m[3]; }
  else if((m = s.match(/^(\d{4})(\d{2})(\d{2})/))){ ano = +m[1]; mes = +m[2]; dia = +m[3]; }
  else if((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))){ dia = +m[1]; mes = +m[2]; ano = +m[3]; if(ano < 100) ano += 2000; }
  else if((m = s.match(/^(\d{1,2})[\/.](\d{1,2})$/))){ dia = +m[1]; mes = +m[2]; ano = null; }
  else if((m = s.match(/^(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+(?:de\s+)?(\d{4}))?$/))){
    dia = +m[1]; mes = FIN_MESES_ABREV[m[2]]; ano = m[3] ? +m[3] : null;
  } else return null;
  if(!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return null;
  var semAno = ano === null;
  if(semAno) ano = anoRef || new Date().getFullYear();
  var iso = ano + "-" + finDoisDigitos(mes) + "-" + finDoisDigitos(dia);
  if(semAno && iso > finSomarDiasISO(finHojeISO(), 45)){
    ano -= 1;
    iso = ano + "-" + finDoisDigitos(mes) + "-" + finDoisDigitos(dia);
  }
  return iso;
}

function finSomarDiasISO(iso, dias){
  var d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + "-" + finDoisDigitos(d.getMonth() + 1) + "-" + finDoisDigitos(d.getDate());
}

/* ---------- peças em comum ---------- */
// Palavras que indicam que a linha NÃO é um gasto de verdade (saldo, total, pagamento da fatura...).
var FIN_IGNORAR = /saldo (anterior|final|do dia|dispon|total)|total (da fatura|de compras|a pagar|geral)|limite (de|dispon|total)|pagamento m[ií]nimo|valor total|encargos futuros|proximo vencimento|data de vencimento/;
var FIN_PAGAMENTO_FATURA = /pagamento (recebido|efetuado|de fatura|fatura|on ?line)|pgto (fatura|cartao)|pagto (fatura|cartao)|credito em conta|estorno|desconto antecipacao/;

function finDescricaoLimpa(texto){
  return String(texto || "").replace(/\s+/g, " ").replace(/^[\s\-\u2013\u2014:.]+|[\s\-\u2013\u2014:.]+$/g, "").trim();
}

// "PARC 02/06", "PARCELA 2 DE 6", "LOJA 03/10" -> "2/6". Só aceita se parecer parcela mesmo.
function finAcharParcela(descricao){
  var m = String(descricao || "").match(/parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i)
       || String(descricao || "").match(/(?:^|\s)(\d{1,2})\/(\d{1,2})\s*$/);
  if(!m) return null;
  var n = +m[1], total = +m[2];
  if(total < 2 || total > 48 || n < 1 || n > total) return null;
  return n + "/" + total;
}

// Chave pra reconhecer o mesmo lançamento se o arquivo for importado duas vezes.
// "ocorrencia" separa duas compras iguais no mesmo dia.
function finChave(dataISO, valor, descricao, ocorrencia){
  return dataISO + "|" + Math.abs(Number(valor)).toFixed(2) + "|" + finNormalizar(descricao).slice(0, 60) + "|" + (ocorrencia || 1);
}

// Monta o lançamento sugerido a partir de uma linha lida.
// valorComSinal: negativo = saiu dinheiro (extrato) ou crédito (fatura, conforme "faturaInvertida")
function finMontarSugestao(dataISO, descricao, valorComSinal, tipoImportacao){
  var limpa = finDescricaoLimpa(descricao);
  var normal = finNormalizar(limpa);
  var tipo;
  if(tipoImportacao === "fatura") tipo = valorComSinal >= 0 ? "despesa" : "receita";
  else tipo = valorComSinal < 0 ? "despesa" : "receita";
  var ehPagamentoFatura = tipoImportacao === "fatura" && tipo === "receita" && FIN_PAGAMENTO_FATURA.test(normal);
  var ehPagamentoDaFaturaNoExtrato = tipoImportacao === "extrato" && tipo === "despesa" && /pagamento (de )?fatura|pgto fatura|fatura (do )?cart/.test(normal);
  var sugestao = {
    data: dataISO,
    descricao: limpa,
    valor: Math.abs(valorComSinal),
    tipo: tipo,
    categoria: finCategorizar(limpa, tipo),
    parcela: finAcharParcela(limpa),
    aviso: null,
    marcada: true
  };
  if(ehPagamentoFatura){
    sugestao.marcada = false;
    sugestao.aviso = "Pagamento ou crédito da fatura: já está nas suas contas, por isso vem desmarcado.";
  } else if(tipoImportacao === "fatura" && tipo === "receita"){
    // qualquer crédito numa fatura é pagamento (ou débito automático) ou estorno de uma compra
    sugestao.marcada = false;
    sugestao.aviso = "Crédito na fatura (pagamento ou estorno de uma compra). Vem desmarcado: pagamento já está nas suas contas. Se for estorno, marque.";
  } else if(ehPagamentoDaFaturaNoExtrato){
    sugestao.categoria = "Cartão";
    sugestao.marcada = false;
    sugestao.aviso = "Pagamento da fatura do cartão: se você importar a fatura, os gastos já entram por lá. Vem desmarcado pra não contar duas vezes.";
  }
  return sugestao;
}

// Numera as repetições (duas compras iguais no mesmo dia) e põe a chave em cada uma.
function finNumerarChaves(sugestoes){
  var vistas = {};
  sugestoes.forEach(function(s){
    var base = finChave(s.data, s.valor, s.descricao, 1).replace(/\|1$/, "");
    vistas[base] = (vistas[base] || 0) + 1;
    s.chave = base + "|" + vistas[base];
  });
  return sugestoes;
}

/* ---------- CSV ---------- */
function finDividirCSV(texto){
  var linhas = String(texto || "").replace(/^﻿/, "").split(/\r\n|\n|\r/).filter(function(l){ return l.trim() !== ""; });
  if(!linhas.length) return { linhas: [], sep: ";" };
  var amostra = linhas.slice(0, 6).join("\n");
  var cont = { ";": (amostra.match(/;/g) || []).length, ",": (amostra.match(/,/g) || []).length, "\t": (amostra.match(/\t/g) || []).length };
  var sep = cont[";"] >= cont[","] && cont[";"] >= cont["\t"] ? ";" : (cont[","] >= cont["\t"] ? "," : "\t");
  // quebra respeitando aspas (um campo entre aspas pode ter o separador dentro)
  var saida = linhas.map(function(linha){
    var campos = [], atual = "", dentro = false;
    for(var i = 0; i < linha.length; i++){
      var c = linha[i];
      if(c === '"'){
        if(dentro && linha[i + 1] === '"'){ atual += '"'; i++; }
        else dentro = !dentro;
      } else if(c === sep && !dentro){ campos.push(atual); atual = ""; }
      else atual += c;
    }
    campos.push(atual);
    return campos.map(function(x){ return x.trim(); });
  });
  return { linhas: saida, sep: sep };
}

// Lê um CSV de banco. tipoImportacao: "extrato" ou "fatura".
// Devolve { itens: [sugestoes], erro: texto|null }
function finLerCSV(texto, tipoImportacao){
  var partes = finDividirCSV(texto);
  var linhas = partes.linhas;
  if(linhas.length < 2) return { itens: [], erro: "O arquivo está vazio ou só tem uma linha." };

  var iCab = -1;
  for(var i = 0; i < Math.min(linhas.length, 12); i++){
    var norm = linhas[i].map(finNormalizar);
    var temData = norm.some(function(c){ return /^(data|date|dt)\b|^data /.test(c); });
    var temValor = norm.some(function(c){ return /^(valor|amount|value|quantia)|debito|credito/.test(c); });
    if(temData && temValor){ iCab = i; break; }
  }
  var iData = -1, iDesc = -1, iValor = -1, iDeb = -1, iCred = -1, primeira = 0;
  if(iCab >= 0){
    var cab = linhas[iCab].map(finNormalizar);
    cab.forEach(function(c, idx){
      if(iData < 0 && /^(data|date|dt)\b|^data /.test(c)) iData = idx;
      else if(iDesc < 0 && /descri|historico|lancamento|title|estabelecimento|memo|nome|detalhe/.test(c)) iDesc = idx;
      else if(iValor < 0 && /^(valor|amount|value|quantia)/.test(c)) iValor = idx;
      else if(iDeb < 0 && /debito|saida/.test(c)) iDeb = idx;
      else if(iCred < 0 && /credito|entrada/.test(c)) iCred = idx;
    });
    primeira = iCab + 1;
  } else {
    // sem cabeçalho: assume data, descrição, valor
    iData = 0; iDesc = 1; iValor = 2;
  }
  if(iData < 0 || (iValor < 0 && iDeb < 0 && iCred < 0)){
    return { itens: [], erro: "Não achei as colunas de data e valor nesse CSV. Ele precisa ter pelo menos 'Data' e 'Valor'." };
  }
  if(iDesc < 0){
    // usa a primeira coluna de texto que não seja data nem valor
    for(var k = 0; k < linhas[primeira].length; k++){
      if(k !== iData && k !== iValor && k !== iDeb && k !== iCred){ iDesc = k; break; }
    }
  }

  var brutos = [];
  for(var r = primeira; r < linhas.length; r++){
    var linha = linhas[r];
    var data = finParseData(linha[iData]);
    if(!data) continue;
    var valor = NaN;
    if(iValor >= 0) valor = finParseValor(linha[iValor]);
    if(isNaN(valor) && (iDeb >= 0 || iCred >= 0)){
      var deb = iDeb >= 0 ? finParseValor(linha[iDeb]) : NaN;
      var cred = iCred >= 0 ? finParseValor(linha[iCred]) : NaN;
      if(!isNaN(deb) && deb !== 0) valor = -Math.abs(deb);
      else if(!isNaN(cred) && cred !== 0) valor = Math.abs(cred);
    }
    if(isNaN(valor) || valor === 0) continue;
    var desc = iDesc >= 0 ? linha[iDesc] : "";
    if(FIN_IGNORAR.test(finNormalizar(desc))) continue;
    brutos.push({ data: data, descricao: desc, valor: valor });
  }
  if(!brutos.length){
    return { itens: [], erro: iCab < 0
      ? "Não achei as colunas de data e valor nesse CSV. Ele precisa ter pelo menos 'Data' e 'Valor'."
      : "Não encontrei nenhum lançamento nesse CSV." };
  }

  // Fatura: normalmente compra é positivo. Se a maioria vier negativa, o banco inverte.
  var negativos = brutos.filter(function(b){ return b.valor < 0; }).length;
  var inverter = tipoImportacao === "fatura" && negativos > brutos.length / 2;
  var itens = brutos.map(function(b){
    return finMontarSugestao(b.data, b.descricao, inverter ? -b.valor : b.valor, tipoImportacao);
  });
  return { itens: finNumerarChaves(itens), erro: null };
}

/* ---------- OFX (o arquivo que quase todo banco deixa baixar) ---------- */
function finLerOFX(texto, tipoImportacao){
  var s = String(texto || "");
  var blocos = s.split(/<STMTTRN>/i).slice(1);
  if(!blocos.length) return { itens: [], erro: "Não achei lançamentos nesse arquivo OFX." };
  var pegar = function(bloco, tag){
    var m = bloco.match(new RegExp("<" + tag + ">\\s*([^<\\r\\n]*)", "i"));
    return m ? m[1].trim() : "";
  };
  var itens = [];
  blocos.forEach(function(bloco){
    var data = finParseData(pegar(bloco, "DTPOSTED"));
    var valor = parseFloat(String(pegar(bloco, "TRNAMT")).replace(",", "."));
    if(!data || isNaN(valor) || valor === 0) return;
    var desc = pegar(bloco, "MEMO") || pegar(bloco, "NAME") || "Sem descrição";
    // no OFX, valor negativo é sempre saída (também nas faturas de cartão)
    var sug = finMontarSugestao(data, desc, tipoImportacao === "fatura" ? -valor : valor, tipoImportacao);
    itens.push(sug);
  });
  if(!itens.length) return { itens: [], erro: "Não achei lançamentos nesse arquivo OFX." };
  return { itens: finNumerarChaves(itens), erro: null };
}

/* ---------- PDF: recebe as linhas de texto que o leitor de PDF tirou ---------- */
// O valor no fim da linha. Grupos: 1 = sinal antes ("+" ou um "-" colado no número), 2 = "R$",
// 3 = "-" depois do "R$", 4 = o número, 5 = sinal depois (-, CR, DB, C, D).
// Um "-" solto (com espaço depois) NÃO é sinal: no Inter ele marca "sem beneficiário".
var FIN_RE_VALOR_FIM = /(?:^|\s)(\+\s*|[-−](?=\S))?(R\$\s*)?([-−](?=\d))?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*([-−]|CR|DB|C|D)?\s*$/i;
// A data no começo da linha: 15/10, 15/10/2026, "15 out", "15 out 2026" e o jeito do Inter: "23 de set. 2026".
var FIN_RE_DATA_INICIO = /^\s*(\d{2}[\/.]\d{2}(?:[\/.]\d{2,4})?|\d{1,2}\s+(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+(?:de\s+)?\d{4})?)\s+(.+)$/i;

// Acha o ano do documento (ex: vencimento 10/11/2026) pra datas que vêm só com dia e mês.
function finAcharAnoDoDocumento(linhas){
  var contagem = {};
  linhas.slice(0, 80).forEach(function(l){
    (l.match(/\b\d{2}\/\d{2}\/(20\d{2})\b/g) || []).forEach(function(d){
      var ano = d.slice(-4);
      contagem[ano] = (contagem[ano] || 0) + 1;
    });
  });
  var melhor = null;
  Object.keys(contagem).forEach(function(a){ if(melhor === null || contagem[a] > contagem[melhor]) melhor = a; });
  return melhor ? +melhor : new Date().getFullYear();
}

function finLerLinhasPDF(linhas, tipoImportacao){
  var ano = finAcharAnoDoDocumento(linhas);
  var brutos = [];
  linhas.forEach(function(linha){
    var texto = String(linha || "").replace(/\s+/g, " ").trim();
    var m = texto.match(FIN_RE_DATA_INICIO);
    if(!m) return;
    var data = finParseData(m[1].replace(/\s+/g, " "), ano);
    if(!data) return;
    var resto = m[2];
    // pode ter dois valores no fim (valor e saldo): no extrato o primeiro é o lançamento
    var achou = resto.match(FIN_RE_VALOR_FIM);
    if(!achou) return;
    var depois = resto.slice(0, achou.index);
    var segundo = depois.match(FIN_RE_VALOR_FIM);
    var alvo = achou;
    if(segundo && tipoImportacao === "extrato") alvo = segundo;
    var valorAbs = finParseValor(alvo[4]);
    if(isNaN(valorAbs) || valorAbs === 0) return;
    var descricao = resto.slice(0, alvo.index).trim();
    if(!descricao || descricao.length < 2) return;
    if(FIN_IGNORAR.test(finNormalizar(descricao))) return;

    var antes = (alvo[1] || "").trim(), depoisDoRS = alvo[3] || "", sufixo = (alvo[5] || "").toLowerCase();
    var negativo = /^[-−]/.test(antes) || depoisDoRS !== "" || sufixo === "-" || sufixo === "−" || sufixo === "db" || sufixo === "d";
    var credito = antes === "+" || sufixo === "cr" || sufixo === "c";
    var valorComSinal;
    if(tipoImportacao === "fatura"){
      // fatura: sem sinal = compra (positivo). Com "+", "-" colado ou CR = crédito, pagamento ou estorno (negativo)
      valorComSinal = (negativo || credito) ? -valorAbs : valorAbs;
    } else {
      // extrato: "-" ou D = saída. Sem sinal (ou com "+" ou C) = entrada
      valorComSinal = (negativo && !credito) ? -valorAbs : valorAbs;
    }
    brutos.push({ data: data, descricao: descricao, valor: valorComSinal });
  });
  if(!brutos.length){
    return { itens: [], erro: "Não consegui achar lançamentos no texto desse PDF. Se ele for uma foto (escaneado), o texto não dá pra ler. Tente baixar o CSV ou o OFX no app do banco." };
  }

  // Parcela de uma compra antiga (ex: compra de fevereiro, parcela 8 de 10 cobrada agora): a data
  // original cairia no mês errado, então ela vai pra data mais recente dessa fatura.
  if(tipoImportacao === "fatura"){
    var ref = null;
    brutos.forEach(function(b){
      var p = finAcharParcela(b.descricao);
      if((!p || /^1\//.test(p)) && (ref === null || b.data > ref)) ref = b.data;
    });
    if(ref){
      var corte = finSomarDiasISO(ref, -40);
      brutos.forEach(function(b){
        var p = finAcharParcela(b.descricao);
        if(p && !/^1\//.test(p) && b.data < corte){ b.dataOriginal = b.data; b.data = ref; }
      });
    }
  }

  var itens = brutos.map(function(b){
    var sug = finMontarSugestao(b.data, b.descricao, b.valor, tipoImportacao);
    if(b.dataOriginal){
      sug.dataOriginal = b.dataOriginal;
      var dd = b.dataOriginal.slice(8, 10) + "/" + b.dataOriginal.slice(5, 7) + "/" + b.dataOriginal.slice(0, 4);
      sug.aviso = (sug.aviso ? sug.aviso + " " : "") + "Parcela de uma compra de " + dd + ": a data foi movida pra data dessa fatura, pra cair no mês em que você pagou.";
    }
    return sug;
  });
  return { itens: finNumerarChaves(itens), erro: null };
}

// Escolhe o leitor certo pelo nome e pelo começo do arquivo.
function finLerTexto(texto, nomeArquivo, tipoImportacao){
  var nome = String(nomeArquivo || "").toLowerCase();
  if(/\.ofx$/.test(nome) || /<OFX>|OFXHEADER/i.test(String(texto).slice(0, 400))) return finLerOFX(texto, tipoImportacao);
  return finLerCSV(texto, tipoImportacao);
}
