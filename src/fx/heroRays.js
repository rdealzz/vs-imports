// Capa: luz dourada saindo de trás do título. As letras (texto real do h1)
// bloqueiam a luz e os fachos escapam por entre elas, com poeira brilhando.
// WebGL puro, duas passadas leves: máscara de oclusão em 1/3 da resolução e
// marcha radial até a fonte de luz. Pausa fora da tela; reduz resolução se pesar.
import { reduceMotion, isMobile } from '../three/perf.js';

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uText; uniform vec2 uRes; uniform vec2 uSun; uniform float uBright; uniform float uTime;
float text(vec2 p){ return texture(uText, vec2(p.x, 1.-p.y)).r; }
float glow(vec2 p){
  float r = length((p-uSun)*vec2(uRes.x/uRes.y, 1.));
  return exp(-4.2*r)*1.4 + smoothstep(0.16, 0.0, r)*1.6;
}
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
`;

// só a luz que passa: o letreiro bloqueia e a luz escapa em volta dele
// num halo difuso (sem as faixas verticais da parede ripada)
const OCC = COMMON + `
void main(){ o = vec4(vec3(glow(vUv)*(1.-text(vUv))*uBright*0.42), 1.); }`;

const MAIN = COMMON + `
uniform sampler2D uOcc; uniform int uSteps;
float specks(vec2 p, float s, float seed){
  vec2 q = p*s; vec2 c = floor(q); vec2 f = fract(q);
  float h = hash(c+seed); if(h < 0.55) return 0.;
  vec2 o2 = vec2(hash(c+seed+1.7), hash(c+seed+9.1))*0.8+0.1;
  return smoothstep(0.07, 0., length(f-o2))*(0.5+0.5*sin(uTime*(1.1+h*2.)+h*40.));
}
void main(){
  vec2 p = vUv;
  vec2 delta = (uSun - p)/float(uSteps) * 0.92;
  float w = 1., sum = 0.;
  vec2 q = p + delta*hash(gl_FragCoord.xy + fract(uTime)*13.);
  for(int i=0;i<64;i++){ if(i>=uSteps) break; sum += texture(uOcc, q).r*w; w *= 0.962; q += delta; }
  float ray = sum/float(uSteps)*2.1;
  // as letras ficam escuras e nítidas por cima (são o texto real); aqui só a luz
  ray *= 1. - text(p)*0.9;
  float asp = uRes.x/uRes.y;
  float dust = specks(p*vec2(asp,1.) + vec2(uTime*.006, uTime*.004), 70., 3.) + specks(p*vec2(asp,1.) + vec2(-uTime*.004, uTime*.008), 130., 7.)*.7;
  float a = clamp(ray*(1.+dust*1.8), 0., 0.9);
  // dourado da marca, mais claro no miolo do facho
  vec3 gold = mix(vec3(0.78,0.60,0.33), vec3(1.0,0.90,0.66), clamp(ray*1.4,0.,1.));
  // pontilhado de 1/255: some com os "degraus" de cor do degradê
  a = clamp(a + (hash(gl_FragCoord.xy + 17.3) - 0.5)/255., 0., 0.9);
  o = vec4(gold*a, a); // pré-multiplicado
}`;

export class HeroRays {
  constructor(section, canvas, title) {
    this.section = section; this.canvas = canvas; this.title = title;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.steps = isMobile ? 32 : 44;
    this.scale = isMobile ? 0.36 : 0.6; // resolução do canvas (os fachos são suaves)
    this.initGL();
    this.sun = [0.3, 0.6]; this.home = [0.3, 0.6]; this.ptr = null; this.ptrT = 0;
    this.bright = reduceMotion ? 1 : 0; this.t0 = performance.now(); this.slow = 0;
    new ResizeObserver(() => this.resize()).observe(section);
    section.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      this.ptr = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; this.ptrT = performance.now();
    }, { passive: true });
    let on = true;
    new IntersectionObserver(([e]) => { on = e.isIntersecting; this.toggle(on && !document.hidden); }).observe(section);
    document.addEventListener('visibilitychange', () => this.toggle(on && !document.hidden));
    addEventListener('scroll', () => { this.scrollT = performance.now(); }, { passive: true });
    // uma janela vai abrir por cima: esconde o canvas no mesmo quadro (sem recomposição pesada)
    document.addEventListener('vs-cover', (e) => {
      const covered = e.detail || !!document.querySelector('.auth:not([hidden]), .bag:not([hidden])');
      canvas.style.visibility = covered ? 'hidden' : '';
    });
    this.resize();
    if (reduceMotion) requestAnimationFrame(() => this.draw(0)); else this.toggle(true);
  }
  initGL() {
    const gl = this.gl;
    this.occ = this.prog(OCC); this.main = this.prog(MAIN);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.textTex = gl.createTexture(); this.occTex = gl.createTexture(); this.fbo = gl.createFramebuffer();
  }
  prog(fs) {
    const gl = this.gl;
    const mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p, u };
  }
  tex(t, w, h, src) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // redesenha o que bloqueia a luz exatamente onde o navegador colocou:
  // uma imagem (o letreiro/logo) ou as letras do título
  drawText() {
    const r = this.canvas.getBoundingClientRect();
    const s = 0.5; // máscara leve; os fachos são difusos
    const c = this.mask || (this.mask = document.createElement('canvas'));
    c.width = Math.max(1, Math.round(r.width * s)); c.height = Math.max(1, Math.round(r.height * s));
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#fff';
    const im = this.title.tagName === 'IMG' ? this.title : this.title.querySelector('img');
    if (im) {
      const b = im.getBoundingClientRect();
      if (im.complete && b.width) {
        // silhueta branca do letreiro
        const t = this.sil || (this.sil = document.createElement('canvas'));
        t.width = Math.round(b.width * s); t.height = Math.round(b.height * s);
        const tx = t.getContext('2d'); tx.clearRect(0, 0, t.width, t.height);
        tx.drawImage(im, 0, 0, t.width, t.height);
        tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#fff'; tx.fillRect(0, 0, t.width, t.height); tx.globalCompositeOperation = 'source-over';
        x.drawImage(t, (b.left - r.left) * s, (b.top - r.top) * s);
        this.home = [(b.left + b.width / 2 - r.left) / r.width, 1 - (b.top + b.height * 0.47 - r.top) / r.height];
        if (!this.started) { this.sun = [...this.home]; this.started = true; }
      } else im.addEventListener('load', () => this.drawText(), { once: true });
      this.tex(this.textTex, 0, 0, c);
      return;
    }
    const range = document.createRange();
    const walker = document.createTreeWalker(this.title, NodeFilter.SHOW_TEXT);
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const cs = getComputedStyle(n.parentElement);
      x.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * s}px ${cs.fontFamily}`;
      const asc = x.measureText('H').fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * s * 0.9;
      // a animação de entrada desloca as linhas: compensa o transform atual
      const m = new DOMMatrixReadOnly(getComputedStyle(n.parentElement).transform === 'none' ? undefined : getComputedStyle(n.parentElement).transform);
      for (let i = 0; i < n.textContent.length; i++) {
        const ch = n.textContent[i]; if (!ch.trim()) continue;
        range.setStart(n, i); range.setEnd(n, i + 1);
        const b = range.getBoundingClientRect(); if (!b.width) continue;
        const left = b.left - m.m41, top = b.top - m.m42;
        x.fillText(ch, (left - r.left) * s, (top - r.top) * s + asc);
        minX = Math.min(minX, left); maxX = Math.max(maxX, left + b.width); minY = Math.min(minY, top); maxY = Math.max(maxY, top + b.height);
      }
    }
    this.tex(this.textTex, 0, 0, c);
    // luz atrás do título: um pouco acima do centro do bloco de texto
    if (minX < 1e9) this.home = [((minX + maxX) / 2 - r.left) / r.width + 0.04, 1 - ((minY + (maxY - minY) * 0.42) - r.top) / r.height];
    if (!this.started) { this.sun = [...this.home]; this.started = true; }
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(); if (!r.width) return;
    const k = Math.min(devicePixelRatio || 1, 1.5) * this.scale;
    this.canvas.width = Math.round(r.width * k); this.canvas.height = Math.round(r.height * k);
    this.ow = Math.max(1, Math.round(this.canvas.width / 3)); this.oh = Math.max(1, Math.round(this.canvas.height / 3));
    this.tex(this.occTex, this.ow, this.oh);
    const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.occTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.drawText();
    if (reduceMotion) this.draw(0);
  }
  toggle(on) {
    if (reduceMotion) return;
    if (on && !this.running) { this.running = true; this.last = performance.now(); const f = (t) => { if (!this.running) return; this.raf = requestAnimationFrame(f); this.tick(t); }; this.raf = requestAnimationFrame(f); }
    else if (!on) { this.running = false; cancelAnimationFrame(this.raf); }
  }
  tick(now) {
    // durante a rolagem a luz fica parada no último quadro: a página rola livre
    // parada também quando algo cobre a capa (login, sacola, loja 3D aberta)
    const covered = document.body.classList.contains('in-store') || document.querySelector('.auth:not([hidden]), .bag:not([hidden])');
    if (covered || now - (this.scrollT || 0) < 150 || scrollY > innerHeight * 0.35) { this.last = now; this.slow = 0; return; }
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const k = Math.min(1, (now - this.t0) / 2400); this.bright = 1 - Math.pow(1 - k, 3);
    if (k < 1 && now - (this.lastText || 0) > 200) { this.lastText = now; this.drawText(); } // segue as letras entrando
    const home = [this.home[0] + Math.sin(now * 0.00023) * 0.025, this.home[1] + Math.sin(now * 0.00031 + 1) * 0.02];
    const active = this.ptr && now - this.ptrT < 2600;
    const tgt = active ? [this.home[0] + (this.ptr[0] - this.home[0]) * 0.22, this.home[1] + (this.ptr[1] - this.home[1]) * 0.18] : home;
    const a = 1 - Math.exp(-(active ? 5 : 1.2) * dt);
    this.sun[0] += (tgt[0] - this.sun[0]) * a; this.sun[1] += (tgt[1] - this.sun[1]) * a;
    this.draw(now);
    // orçamento: se 24 quadros seguidos passarem de 24 ms, baixa a resolução
    if (dt * 1000 > 24) { if (++this.slow > 24 && this.scale > 0.3) { this.scale *= 0.8; this.slow = 0; this.resize(); } } else this.slow = 0;
  }
  draw(now) {
    const gl = this.gl;
    const set = (pr) => {
      gl.useProgram(pr.p); const u = pr.u;
      gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height); gl.uniform2f(u.uSun, this.sun[0], this.sun[1]);
      gl.uniform1f(u.uBright, this.bright); gl.uniform1f(u.uTime, now / 1000);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textTex); gl.uniform1i(u.uText, 0);
    };
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.ow, this.oh);
    set(this.occ); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    set(this.main); gl.uniform1i(this.main.u.uSteps, this.steps);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.occTex); gl.uniform1i(this.main.u.uOcc, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
