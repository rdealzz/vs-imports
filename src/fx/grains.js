// Capítulo "Estilo e qualidade é com a VS": os mesmos grãos de luz
// formam a frase, uma camiseta, um boné e o VS. WebGL puro, só pontos
// aditivos, sem texturas. Cada grão tem 4 posições + 4 números aleatórios.
import { reduceMotion } from '../three/perf.js';

const FONT = '"Archivo", "Arial Narrow", Arial, sans-serif';

function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// pixels opacos de um desenho 2D -> lista para sortear (sem laço de rejeição)
function maskPoints(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; draw(x, w, h);
  const d = x.getImageData(0, 0, w, h).data, list = [];
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 128) list.push(i);
  return { list, w, h };
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aA; layout(location=1) in vec3 aB; layout(location=2) in vec3 aC; layout(location=3) in vec3 aD; layout(location=4) in vec4 aR;
uniform float uP, uTime, uIntro, uAsp, uShift, uNarrow, uPx, uSolid;
uniform vec2 uPtr, uCam;
out vec3 vCol; out float vA;
vec3 flow(vec3 p, float t){
  return vec3(sin(p.y*2.1+t*0.3)+0.5*sin(p.z*3.7+t*0.21),
              sin(p.z*1.9+t*0.25)+0.5*sin(p.x*3.3-t*0.17),
              sin(p.x*2.3+t*0.35)+0.5*sin(p.y*4.1+t*0.13));
}
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
vec3 shape(int i, float t){
  vec3 p; bool star = aR.w > 0.98;
  if(i==0){ p = aA; if(!star) p += vec3(sin(t*3.+aR.x*40.), cos(t*2.6+aR.y*40.), 0.)*0.01; }
  else if(i==1){ p = aB; if(!star) p = rotY(sin(t*0.45)*0.35)*p; }
  else if(i==2){ p = aC; if(!star) p = rotY(t*0.35 + 0.6)*p; }
  else { p = aD; if(!star) p = rotY(sin(t*0.5)*0.45)*p; }
  if(!star && i>0){ p *= uNarrow; p.x += uShift; }
  return p;
}
vec3 palette(int i, vec4 r, vec3 p){
  if(i==0) return mix(vec3(1.,0.93,0.82), vec3(1.,0.62,0.28), r.y);
  if(i==1) return mix(vec3(0.95,0.9,0.82), vec3(1.,0.78,0.5), r.y*r.y) * (0.75+0.25*r.z);
  if(i==2) return mix(vec3(1.,0.7,0.35), vec3(0.85,0.55,0.25), r.y) * (r.x>0.92 ? 1.6 : 1.);
  return mix(vec3(1.,0.84,0.48), vec3(1.,0.96,0.86), smoothstep(0.6,1.,r.y));
}
void main(){
  float p = clamp(uP, 0., 3.);
  int i = int(min(floor(p), 2.)); float f = p - float(i);
  float seed = aR.x;
  float t = smoothstep(seed*0.5, seed*0.5+0.5, f);
  vec3 A = shape(i, uTime), B = shape(i+1, uTime);
  vec3 pos = mix(A, B, t) + flow(mix(A,B,0.5)*1.3, uTime)*sin(3.14159*t)*0.42;
  vec3 col = mix(palette(i, aR, A), palette(i+1, aR, B), t);
  // abertura: a frase condensa de uma poeira larga
  float k = smoothstep(seed*0.6, seed*0.6+0.4, uIntro);
  vec3 scatter = aB*2.2 + flow(aB, uTime)*0.6;
  pos = mix(scatter, pos, k);
  float land = 1. + (1.-abs(k*2.-1.))*0.0 + smoothstep(0.85,1.,k)*0.25*(1.-smoothstep(0.98,1.,uIntro));
  // câmera
  vec3 v = rotX(uCam.y) * rotY(uCam.x) * pos;
  float d = 4.4 - v.z;
  float th = tan(radians(20.));
  vec2 ndc = vec2(v.x/(d*th)/uAsp, v.y/(d*th));
  // ponteiro afasta o pó
  vec2 dv = (ndc - uPtr)*vec2(uAsp,1.);
  float d2 = dot(dv,dv);
  float push = 0.17*exp(-16.*d2);
  ndc += normalize(dv+1e-5)*push/vec2(uAsp,1.);
  // profundidade de campo
  float blur = abs(d-4.4)*1.5;
  float size = (2.2/d)*(0.7+aR.z*0.8) + blur*3.2 + push*8.;
  if(aR.w > 0.98) size *= 0.8;
  float alpha = (0.55/(1.+5.*blur*blur)) * land;
  if(aR.w > 0.98){ alpha *= 0.5; col = vec3(0.9,0.85,0.75); }
  vCol = col; vA = alpha;
  gl_PointSize = size*uPx;
  gl_Position = vec4(ndc, 0., 1.);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol; in float vA; out vec4 o;
void main(){
  float r = length(gl_PointCoord-0.5)*2.;
  float a = smoothstep(1., 0.2, r)*vA;
  o = vec4(vCol*a, 1.);
}`;

export class Grains {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.N = innerWidth < 760 ? 45000 : 110000;
    this.draw = this.N; this.slow = 0;
    this.p = 0; this.target = 0; this.intro = reduceMotion ? 1 : 0; this.introStarted = reduceMotion;
    this.ptr = [9, 9]; this.cam = [0, 0]; this.camT = [0, 0];
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {}; for (const n of ['uP', 'uTime', 'uIntro', 'uAsp', 'uShift', 'uNarrow', 'uPx', 'uPtr', 'uCam', 'uSolid']) this.u[n] = gl.getUniformLocation(prog, n);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buffers = [];
    this.build();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      this.ptr = [x, y]; this.camT = [x * 0.3, -y * 0.16];
      if (reduceMotion) this.render(performance.now());
    }, { passive: true });
  }
  build() {
    const gl = this.gl, N = this.N, r = rng(4600);
    const A = new Float32Array(N * 3), B = new Float32Array(N * 3), C = new Float32Array(N * 3), D = new Float32Array(N * 3), R = new Float32Array(N * 4);
    // camiseta (silhueta) com frente e costas
    const tee = maskPoints(400, 440, (x) => {
      x.translate(200, 20); x.scale(560, 560);
      x.beginPath(); x.moveTo(-0.085, 0); x.quadraticCurveTo(0, 0.07, 0.085, 0); x.lineTo(0.2, 0.03); x.lineTo(0.32, 0.13); x.lineTo(0.25, 0.27); x.lineTo(0.225, 0.215);
      x.quadraticCurveTo(0.235, 0.45, 0.245, 0.72); x.quadraticCurveTo(0, 0.735, -0.245, 0.72); x.quadraticCurveTo(-0.235, 0.45, -0.225, 0.215); x.lineTo(-0.25, 0.27); x.lineTo(-0.32, 0.13); x.lineTo(-0.2, 0.03); x.closePath(); x.fill();
    });
    const vs = maskPoints(512, 300, (x, w, h) => { x.font = `italic 900 270px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('VS', w / 2, h / 2 + 10); });
    for (let i = 0; i < N; i++) {
      const rr = [r(), r(), r(), r()];
      R.set(rr, i * 4);
      if (rr[3] > 0.98) { // estrelas distantes: mesma casca em todas as formas
        const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), rad = 6 + r() * 3;
        const s = [Math.sin(ph) * Math.cos(th) * rad, Math.cos(ph) * rad * 0.6, -Math.abs(Math.sin(ph) * Math.sin(th)) * rad - 2];
        A.set(s, i * 3); B.set(s, i * 3); C.set(s, i * 3); D.set(s, i * 3);
        continue;
      }
      // camiseta
      const tp = tee.list[(r() * tee.list.length) | 0];
      const tx = (tp % tee.w + r()) / tee.w - 0.5, ty = (Math.floor(tp / tee.w) + r()) / tee.h;
      B.set([tx * 2.0, 1.15 - ty * 2.2, (r() < 0.5 ? -1 : 1) * 0.08 * (1 - Math.abs(tx) * 1.2) + gauss(r) * 0.012], i * 3);
      // boné: copa (esfera) + aba
      if (r() < 0.72) {
        const th = r() * Math.PI * 2, ph = Math.acos(r());
        C.set([Math.sin(ph) * Math.cos(th) * 0.9, Math.cos(ph) * 0.7 - 0.2, Math.sin(ph) * Math.sin(th) * 1.0], i * 3);
      } else {
        const a = Math.PI * r(), rad = Math.sqrt(r());
        const bx = Math.cos(a) * 0.85 * rad, bz = 0.75 + Math.sin(a) * 0.75 * rad;
        C.set([bx, -0.2 - bx * bx * 0.25 - (bz - 0.75) * 0.25 + gauss(r) * 0.006, bz], i * 3);
      }
      // VS extrudado
      const vp = vs.list[(r() * vs.list.length) | 0];
      D.set([((vp % vs.w + r()) / vs.w - 0.5) * 3.0, (0.5 - (Math.floor(vp / vs.w) + r()) / vs.h) * 1.76, (r() - 0.5) * 0.36], i * 3);
    }
    this.data = { A, B, C, D, R };
    this.fillTitle();
    [[B, 3, 1], [C, 3, 2], [D, 3, 3], [R, 4, 4]].forEach(([arr, size, loc]) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    });
  }
  // a frase depende da proporção da tela: só este buffer é refeito
  fillTitle() {
    const gl = this.gl, N = this.N, r = rng(14);
    const rect = this.canvas.getBoundingClientRect();
    const asp = (rect.width || innerWidth) / (rect.height || innerHeight);
    const portrait = asp < 1;
    const m = maskPoints(1024, portrait ? 640 : 300, (x, w, h) => {
      x.textAlign = 'center'; x.textBaseline = 'middle';
      // ajusta o corpo para caber em 94% da largura do desenho
      const fit = (t, size) => { x.font = `italic 800 ${size}px ${FONT}`; const m = x.measureText(t).width; return Math.min(size, size * w * 0.94 / m); };
      if (portrait) { const s1 = fit('QUALIDADE', 190); x.font = `italic 800 ${s1}px ${FONT}`; x.fillText('ESTILO E', w / 2, h * 0.3); x.fillText('QUALIDADE', w / 2, h * 0.72); }
      else { const s1 = fit('ESTILO E QUALIDADE', 150); x.font = `italic 800 ${s1}px ${FONT}`; x.fillText('ESTILO E QUALIDADE', w / 2, h / 2); }
    });
    const visW = 2 * Math.tan(20 * Math.PI / 180) * 4.4 * asp;
    const W = visW * (portrait ? 0.9 : 0.8), H = W * m.h / m.w;
    const A = this.data.A;
    for (let i = 0; i < N; i++) {
      if (this.data.R[i * 4 + 3] > 0.98) continue;
      const p = m.list[(r() * m.list.length) | 0];
      A[i * 3] = ((p % m.w + r()) / m.w - 0.5) * W;
      A[i * 3 + 1] = (0.5 - (Math.floor(p / m.w) + r()) / m.h) * H + (portrait ? 0.55 : 0.35);
      A[i * 3 + 2] = 0;
    }
    if (!this.bufA) { this.bufA = gl.createBuffer(); }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufA); gl.bufferData(gl.ARRAY_BUFFER, A, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.titleAsp = portrait;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.asp = r.width / r.height; this.dpr = dpr;
    if ((this.asp < 1) !== this.titleAsp) this.fillTitle();
    if (reduceMotion) this.render(performance.now());
  }
  // alvo vindo do scroll (0..3)
  setTarget(v) {
    this.target = v;
    if (reduceMotion) { this.p = Math.round(v); this.render(performance.now()); }
  }
  startIntro() { if (this.introStarted) return; this.introStarted = true; this.introT = performance.now(); }
  toggle(on) {
    if (reduceMotion) return;
    if (on && !this.running) { this.running = true; this.last = performance.now(); const f = (t) => { if (!this.running) return; this.raf = requestAnimationFrame(f); this.tick(t); }; this.raf = requestAnimationFrame(f); }
    else if (!on) { this.running = false; cancelAnimationFrame(this.raf); }
  }
  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    // p persegue o alvo a 4,5/s: passos da roda nunca pulam
    const d = this.target - this.p, step = 4.5 * dt * Math.max(0.25, Math.min(1, Math.abs(d)));
    this.p += Math.abs(d) < step ? d : Math.sign(d) * step;
    if (this.introStarted) this.intro = Math.min(1, (now - this.introT) / 2600);
    const a = 1 - Math.exp(-4 * dt);
    this.cam[0] += (this.camT[0] + Math.sin(now * 0.00017) * 0.05 - this.cam[0]) * a;
    this.cam[1] += (this.camT[1] + Math.sin(now * 0.00023) * 0.03 - this.cam[1]) * a;
    this.render(now);
    // orçamento: 30 ms por 24 quadros -> 18% menos grãos, até 40%
    if (dt * 1000 > 30) { if (++this.slow >= 24 && this.draw > this.N * 0.4) { this.draw = Math.max(this.N * 0.4, Math.floor(this.draw * 0.82)); this.slow = 0; } } else this.slow = 0;
  }
  render(now) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.016, 0.02, 0.039, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao);
    const wide = this.asp > 1.1;
    gl.uniform1f(u.uP, this.p); gl.uniform1f(u.uTime, reduceMotion ? 0 : now / 1000);
    gl.uniform1f(u.uIntro, this.intro); gl.uniform1f(u.uAsp, this.asp);
    gl.uniform1f(u.uShift, wide ? 0.78 : 0); gl.uniform1f(u.uNarrow, wide ? 1 : Math.min(1, this.asp * 0.62 + 0.25));
    gl.uniform1f(u.uPx, this.dpr * (this.canvas.height / this.dpr / 900) * 1.2 + 0.6);
    gl.uniform2fv(u.uPtr, this.ptr); gl.uniform2fv(u.uCam, reduceMotion ? [0, 0] : this.cam);
    gl.drawArrays(gl.POINTS, 0, this.draw);
  }
}
