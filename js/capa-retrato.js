/*
  Capa animada do portfólio: a foto recortada da Luana vira uma "gelatina".

  Como funciona (a ideia vem de um retrato vivo feito em WebGL):
  - a foto fica numa malha (uma rede de pontos) que se mexe como pele, com uma
    física de onda amortecida: ela balança e volta sozinha pro lugar;
  - passar o mouse por cima "esfrega" a pele, e clicar e arrastar puxa ela;
  - a cabeça inclina de leve na direção do mouse;
  - quando a pele aperta, a foto escurece um pouquinho; quando estica, clareia.

  Sem WebGL, ou com "reduzir movimento" ligado no aparelho, nada disso roda:
  a foto simplesmente fica parada, do jeito que está no HTML.
*/
(function(){
  "use strict";

  var retrato = document.getElementById("capaRetrato");
  var canvas = document.getElementById("capaCanvas");
  var foto = document.getElementById("capaFoto");
  if(!retrato || !canvas || !foto) return;
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
  if(!gl) return;

  /* ---------- a malha: uma folha maior que a foto, pra ela poder esticar pra fora ---------- */
  var CELULAR = window.innerWidth < 760;
  var OVER = 1.7;                       // a folha tem 1,7x o tamanho da foto
  var N = CELULAR ? 48 : 64;            // quadrados por lado (menos no celular, pra poupar bateria)
  var M = N + 1, SPAN = OVER / N, ORIGIN = 0.5 - OVER / 2;
  var WOBBLE = 2.3 * 2 * Math.PI;       // velocidade do balanço
  var REACH = 0.085 / SPAN;
  var C = REACH * WOBBLE;               // velocidade da onda
  var GAMMA = 2 * 0.14 * WOBBLE;        // quanto o balanço amortece
  var NU = 0.2 * C;                     // quanto a pele "espalha" o movimento

  var VS = "attribute vec2 a, d; attribute float s; varying vec2 vUv; varying float vS;" +
    "uniform vec2 lean; uniform float overS;" +
    "void main(){ vUv = a; vS = s; vec2 p = a + d + lean; gl_Position = vec4(vec2(p.x-.5, .5-p.y)*2./overS, 0., 1.); }";
  var FS = "precision highp float; varying vec2 vUv; varying float vS; uniform sampler2D face;" +
    "void main(){" +
    "  if(vUv.x<0.||vUv.y<0.||vUv.x>1.||vUv.y>1.){ gl_FragColor = vec4(0.); return; }" +
    "  vec4 c = texture2D(face, vUv);" +
    "  if(c.a<.004){ gl_FragColor = vec4(0.); return; }" +
    "  gl_FragColor = vec4(c.rgb*vS, c.a);" +
    "}";

  function compilar(tipo, codigo){
    var o = gl.createShader(tipo);
    gl.shaderSource(o, codigo);
    gl.compileShader(o);
    if(!gl.getShaderParameter(o, gl.COMPILE_STATUS)){ console.error(gl.getShaderInfoLog(o)); return null; }
    return o;
  }
  var vs = compilar(gl.VERTEX_SHADER, VS), fs = compilar(gl.FRAGMENT_SHADER, FS);
  if(!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  var uLean = gl.getUniformLocation(prog, "lean");
  gl.uniform1f(gl.getUniformLocation(prog, "overS"), OVER);
  gl.uniform1i(gl.getUniformLocation(prog, "face"), 0);

  /* ---------- a folha: deslocamento (u), velocidade (v) e posição de repouso de cada ponto ---------- */
  var total = M * M;
  var ux = new Float32Array(total), uy = new Float32Array(total);
  var vx = new Float32Array(total), vy = new Float32Array(total);
  var repouso = new Float32Array(total * 2), dinamico = new Float32Array(total * 3);
  var sx = new Float32Array(total), sy = new Float32Array(total);
  var restX = new Float32Array(total), restY = new Float32Array(total);
  var i, j, k;
  for(j = 0, k = 0; j < M; j++){
    for(i = 0; i < M; i++){ repouso[k++] = ORIGIN + i * SPAN; repouso[k++] = ORIGIN + j * SPAN; }
  }
  for(k = 0; k < total; k++){ restX[k] = repouso[k * 2]; restY[k] = repouso[k * 2 + 1]; }

  var indices = new Uint16Array(N * N * 6);
  for(j = 0, k = 0; j < N; j++){
    for(i = 0; i < N; i++){
      var a = j * M + i, b = a + 1, c = a + M, d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, repouso, gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var bufDinamico = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufDinamico);
  gl.bufferData(gl.ARRAY_BUFFER, dinamico, gl.DYNAMIC_DRAW);
  var aDesloc = gl.getAttribLocation(prog, "d"), aBrilho = gl.getAttribLocation(prog, "s");
  gl.enableVertexAttribArray(aDesloc);
  gl.vertexAttribPointer(aDesloc, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(aBrilho);
  gl.vertexAttribPointer(aBrilho, 1, gl.FLOAT, false, 12, 8);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  /* ---------- a mão: pontos perto do clique seguem o mouse, mais forte no centro ---------- */
  var pincel = null;
  function segurar(u, v, raio){
    raio = raio || 0.22;
    var lista = [];
    for(var n = 0; n < total; n++){
      var dx = repouso[n * 2] + ux[n] - u, dy = repouso[n * 2 + 1] + uy[n] - v;
      var w = Math.exp(-(dx * dx + dy * dy) / (raio * raio));
      if(w > 0.02) lista.push([n, w, ux[n], uy[n]]);
    }
    pincel = { u: u, v: v, lista: lista, px: 0, py: 0 };
    dormindo = false;
  }

  // A folha nunca pode dobrar sobre si mesma (triângulos sobrepostos viram riscos).
  // A cada quadro, cada linha e coluna é recolocada em ordem, com uma folga mínima entre vizinhos:
  // a foto pode apertar, mas nunca se cruza.
  var FOLGA = SPAN * 0.34;
  var linhaA = new Float32Array(M), linhaB = new Float32Array(M), linhaP = new Float32Array(M);
  function ordenar(inicio, passo, campo, base){
    var n;
    for(n = 0; n < M; n++){ var q = inicio + n * passo; linhaP[n] = base[q] + campo[q]; }
    linhaA[0] = linhaP[0];
    for(n = 1; n < M; n++) linhaA[n] = Math.max(linhaP[n], linhaA[n - 1] + FOLGA);
    linhaB[N] = linhaP[N];
    for(n = N - 1; n >= 0; n--) linhaB[n] = Math.min(linhaP[n], linhaB[n + 1] - FOLGA);
    for(n = 0; n < M; n++){ var p = inicio + n * passo; campo[p] = (linhaA[n] + linhaB[n]) / 2 - base[p]; }
  }
  function desembaracar(){
    for(var passada = 0; passada < 2; passada++){
      for(var r = 0; r < M; r++) ordenar(r * M, 1, sx, restX);
      for(var q = 0; q < M; q++) ordenar(q, M, sy, restY);
    }
  }

  var H = 1 / 240, sobra = 0, dormindo = false;
  function passo(dt){
    var c2 = C * C, wo2 = WOBBLE * WOBBLE;
    for(var jj = 1; jj < N; jj++){
      for(var ii = 1; ii < N; ii++){
        var q = jj * M + ii, l = q - 1, r = q + 1, t = q - M, b = q + M;
        var lx = ux[l] + ux[r] + ux[t] + ux[b] - 4 * ux[q], ly = uy[l] + uy[r] + uy[t] + uy[b] - 4 * uy[q];
        var lvx = vx[l] + vx[r] + vx[t] + vx[b] - 4 * vx[q], lvy = vy[l] + vy[r] + vy[t] + vy[b] - 4 * vy[q];
        vx[q] += (c2 * lx - wo2 * ux[q] - GAMMA * vx[q] + NU * lvx) * dt;
        vy[q] += (c2 * ly - wo2 * uy[q] - GAMMA * vy[q] + NU * lvy) * dt;
      }
    }
    if(pincel){
      for(var n = 0; n < pincel.lista.length; n++){
        var it = pincel.lista[n], q2 = it[0], w = it[1];
        var K = 3000 * w, D = 90 * w;
        vx[q2] += ((it[2] + pincel.px * w - ux[q2]) * K - vx[q2] * D) * dt;
        vy[q2] += ((it[3] + pincel.py * w - uy[q2]) * K - vy[q2] * D) * dt;
      }
    }
    for(var z = 0; z < total; z++){ ux[z] += vx[z] * dt; uy[z] += vy[z] * dt; }
  }

  // Um empurrão de qualquer lado: o mouse passando, um toque.
  function empurrar(u, v, dx, dy, raio){
    raio = raio || 0.09;
    for(var n = 0; n < total; n++){
      var ax = repouso[n * 2] - u, ay = repouso[n * 2 + 1] - v;
      var w = Math.exp(-(ax * ax + ay * ay) / (raio * raio));
      vx[n] += dx * w; vy[n] += dy * w;
    }
    dormindo = false;
  }

  /* ---------- a foto vira textura ---------- */
  var textura = gl.createTexture();
  var mapaAlfa = null;
  function mapaDeToque(img){
    var cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    var cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0, 128, 128);
    mapaAlfa = cx.getImageData(0, 0, 128, 128).data;
  }
  // só conta como "em cima dela" onde a foto não é transparente
  function solido(u, v){
    return !!mapaAlfa && u >= 0 && v >= 0 && u < 1 && v < 1 && mapaAlfa[(((v * 128) | 0) * 128 + ((u * 128) | 0)) * 4 + 3] > 40;
  }

  /* ---------- mouse e dedo ---------- */
  var pu = 0.5, pv = 0.5, acordada = false, sobreACabeca = false;
  var apertando = false, apertouEm = 0, apertouU = 0, apertouV = 0, ultimoX = 0, ultimoY = 0;
  function paraUv(x, y){
    var r = canvas.getBoundingClientRect();
    return [((x - r.left) / r.width - 0.5) * OVER + 0.5, ((y - r.top) / r.height - 0.5) * OVER + 0.5];
  }

  window.addEventListener("pointermove", function(e){
    var dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
    ultimoX = e.clientX; ultimoY = e.clientY;
    var uv = paraUv(e.clientX, e.clientY);
    pu = uv[0]; pv = uv[1];
    acordada = true;
    sobreACabeca = solido(pu, pv);
    retrato.style.cursor = apertando ? "grabbing" : (sobreACabeca ? "grab" : "");
    // o mouse passando por cima esfrega a pele
    if(sobreACabeca && !apertando) empurrar(pu, pv, dx * 0.00035, dy * 0.00035, 0.07);
    if(apertando && pincel){
      var px = pu - pincel.u, py = pv - pincel.v;
      var L = Math.hypot(px, py), lim = 0.24;
      if(L > 0){ var f = lim * (1 - Math.exp(-L / lim)) / L; px *= f; py *= f; }
      pincel.px = px; pincel.py = py;
    }
  });

  retrato.addEventListener("pointerdown", function(e){
    var uv = paraUv(e.clientX, e.clientY);
    if(!solido(uv[0], uv[1])) return;
    acordada = true; apertando = true; apertouEm = performance.now(); apertouU = uv[0]; apertouV = uv[1];
    segurar(uv[0], uv[1]);
    try{ retrato.setPointerCapture(e.pointerId); }catch(erro){}
    e.preventDefault();
  });
  function soltar(){
    if(!apertando) return;
    var L = pincel ? Math.hypot(pincel.px, pincel.py) : 0;
    var rapido = performance.now() - apertouEm < 380;
    apertando = false; pincel = null;
    retrato.style.cursor = sobreACabeca ? "grab" : "";
    if(L < 0.03 && rapido) empurrar(apertouU, apertouV, 0, 0.5, 0.06);   // um toque: um solavanco
    dormindo = false;
  }
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);

  /* ---------- só trabalha quando a capa está na tela ---------- */
  var visivel = true;
  if("IntersectionObserver" in window){
    new IntersectionObserver(function(es){ visivel = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
  }
  function ajustarTela(){
    var r = Math.min(window.devicePixelRatio || 1, CELULAR ? 1.5 : 2), b = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(b.width * r));
    canvas.height = Math.max(1, Math.round(b.height * r));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  if("ResizeObserver" in window) new ResizeObserver(ajustarTela).observe(canvas);
  else window.addEventListener("resize", ajustarTela);

  /* ---------- cada quadro ---------- */
  var pronto = false, ultimo = performance.now();
  var leanX = 0, leanY = 0, lvX = 0, lvY = 0;

  function quadro(agora){
    window.requestAnimationFrame(quadro);
    var dt = Math.min(0.04, (agora - ultimo) / 1000);
    ultimo = agora;
    if(!pronto || !visivel) return;

    // a cabeça inclina na direção do mouse (e respira de leve quando está parada)
    var tx = (apertando && pincel ? pincel.px * 0.16 : acordada ? (pu - 0.5) * 0.012 : 0) + Math.sin(agora * 0.0009) * 0.0015;
    var ty = (apertando && pincel ? pincel.py * 0.16 : acordada ? (pv - 0.46) * 0.008 : 0) + Math.sin(agora * 0.0013) * 0.0022;
    lvX += ((tx - leanX) * 70 - lvX * 8) * dt; lvY += ((ty - leanY) * 70 - lvY * 8) * dt;
    leanX += lvX * dt; leanY += lvY * dt;

    // a pele só é recalculada enquanto está se mexendo; parada, não gasta processador
    if(!dormindo){
      sobra += dt;
      var passos = 0;
      while(sobra >= H && passos < 9){ passo(H); sobra -= H; passos++; }
      if(passos === 9) sobra = 0;

      var maior = 0;
      for(var q = 0; q < total; q++){
        var m = Math.abs(vx[q]) + Math.abs(vy[q]) + Math.abs(ux[q]) * 20 + Math.abs(uy[q]) * 20;
        if(m > maior) maior = m;
      }
      if(maior < 0.002 && !pincel){
        ux.fill(0); uy.fill(0); vx.fill(0); vy.fill(0);
        dormindo = true;
      }

      for(var jj = 0; jj < M; jj++){
        for(var ii = 0; ii < M; ii++){
          var p = jj * M + ii, borda = ii === 0 || jj === 0 || ii === N || jj === N;
          sx[p] = borda ? ux[p] : (ux[p] * 4 + ux[p - 1] + ux[p + 1] + ux[p - M] + ux[p + M]) / 8;
          sy[p] = borda ? uy[p] : (uy[p] * 4 + uy[p - 1] + uy[p + 1] + uy[p - M] + uy[p + M]) / 8;
        }
      }
      desembaracar();
      for(var n = 0, o = 0; n < total; n++){
        dinamico[o++] = sx[n]; dinamico[o++] = sy[n];
        var col = n % M, lin = (n / M) | 0, brilho = 1;
        if(col > 0 && col < N && lin > 0 && lin < N){
          brilho = Math.max(0.86, Math.min(1.16, 1 - ((sx[n + 1] - sx[n - 1]) + (sy[n + M] - sy[n - M])) * 1.8));
        }
        dinamico[o++] = brilho;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bufDinamico);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dinamico);
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.uniform2f(uLean, leanX, leanY);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------- carrega a foto e liga tudo ---------- */
  var img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = function(){
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    mapaDeToque(img);
    ajustarTela();
    foto.style.visibility = "hidden";      // a foto comum sai de cena: quem aparece agora é a da malha
    retrato.classList.add("viva");
    pronto = true;
    window.requestAnimationFrame(quadro);
  };
  img.src = foto.currentSrc || foto.src;
})();
