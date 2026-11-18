// Abertura: o título é recortado numa parede preta com ripado e a luz
// atravessa as letras. WebGL puro, duas passadas:
//   1) oclusão em 1/3 da resolução: só a luz que passa pelas letras
//   2) imagem final: parede, piso polido com as letras projetadas,
//      fachos (90 passos até o sol), poeira e acabamento.
// O h1 continua sendo texto real e selecionável por cima.
import { reduceMotion, isMobile } from '../three/perf.js';

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uText; uniform vec2 uRes; uniform vec2 uSun; uniform float uOpen;
uniform float uCount; uniform float uFloor; uniform float uBright; uniform float uTime;
uniform vec3 uLight; uniform vec3 uShade;
float glyph(vec2 p){ if(p.y < uFloor || p.x<0. || p.x>1. || p.y>1.) return 0.; return texture(uText, vec2(p.x, 1.-p.y)).r; }
float slat(vec2 p){
  float T = 0.5*(1.-uOpen*0.92);
  float d = abs(fract(p.y*uCount)-0.5);
  return mix(0.14*uOpen, 1., smoothstep(T-0.09, T+0.09, d));
}
float sky(vec2 p){
  float asp = uRes.x/uRes.y;
  float r = length((p-uSun)*vec2(asp,1.));
  return smoothstep(0.06,0.048,r)*2.6 + exp(-6.*r)*0.9 + exp(-1.8*r)*0.34 + 0.2;
}
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
`;

const OCC = COMMON + `
void main(){ vec2 p=vUv; outColor = vec4(vec3(sky(p)*glyph(p)*slat(p)*uBright*0.25),1.); }`;

const MAIN = COMMON + `
uniform sampler2D uOcc; uniform int uSteps;
vec3 wall(vec2 p){
  float g = glyph(p);
  float n = hash(floor(gl_FragCoord.xy/2.));
  vec3 shade = uShade*0.018*(0.75+0.5*n) + vec3(0.006);
  vec3 lit = (uLight*sky(p) + uShade*0.2)*slat(p)*uBright;
  return mix(shade, lit, g);
}
float specks(vec2 p, float s, float seed){
  vec2 q = p*s; vec2 c = floor(q); vec2 f = fract(q);
  float h = hash(c+seed);
  if(h < 0.5) return 0.;
  vec2 o = vec2(hash(c+seed+1.7), hash(c+seed+9.1))*0.8+0.1;
  float d = length(f-o);
  float tw = 0.55+0.45*sin(uTime*(1.2+h*2.)+h*40.);
  return smoothstep(0.06, 0.0, d)*tw;
}
void main(){
  vec2 p = vUv; float asp = uRes.x/uRes.y;
  vec3 col;
  if(p.y >= uFloor){
    col = wall(p);
  } else {
    float t = (uFloor-p.y)/uFloor;
    float Z = t/(1.-0.55*t)*0.6;
    vec2 w = vec2(0.5+(p.x-0.5)*(1.-0.28*t)+(uSun.x-0.5)*Z*1.1, uFloor+(uSun.y-0.1)*Z*2.7);
    float lit = glyph(w)*slat(w);
    vec3 base = uShade*0.012 + vec3(0.004);
    col = base + uLight*lit*(0.85-0.35*t)*uBright*0.55;
    vec2 m = vec2(p.x, uFloor + (uFloor-p.y));
    col += wall(m)*0.11*(1.-t);
  }
  // fachos: marcha até o sol somando a passada de oclusão
  vec2 delta = (uSun - p)/float(uSteps);
  float wgt = 1.; float sum = 0.;
  vec2 q = p + delta*hash(gl_FragCoord.xy + fract(uTime)*17.);
  for(int i=0;i<120;i++){
    if(i>=uSteps) break;
    sum += texture(uOcc, q).r*wgt;
    wgt *= 0.978; q += delta;
  }
  vec3 shaft = uLight*sum*0.12;
  vec2 dp = p*vec2(asp,1.);
  float dust = specks(dp + vec2(uTime*0.006, uTime*0.004), 90., 3.) + specks(dp + vec2(-uTime*0.004, uTime*0.009), 160., 11.)*0.7;
  col += shaft*(1.+dust*3.);
  // acabamento
  vec2 v = vUv-0.5; col *= 1.-dot(v*vec2(asp*0.6,1.),v*vec2(asp*0.6,1.))*0.9;
  col = 1.-exp(-1.6*col);
  col += (hash(gl_FragCoord.xy+uTime*60.)-0.5)*0.028;
  outColor = vec4(col,1.);
}`;

export const MOODS = {
  manha: { sun: [0.27, 0.6], light: [1, 0.74, 0.52], shade: [0.5, 0.58, 0.95] },
  tarde: { sun: [0.44, 0.9], light: [1, 0.96, 0.88], shade: [0.7, 0.82, 1] },
  noite: { sun: [0.7, 0.52], light: [1, 0.76, 0.42], shade: [0.6, 0.52, 0.5] }, // ouro da logo
};

export class Daylight {
  constructor(section, canvas, h1, opts = {}) {
    this.section = section; this.canvas = canvas; this.h1 = h1;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.steps = isMobile ? 72 : 90;
    this.occ = this.program(VERT, OCC);
    this.main = this.program(VERT, MAIN);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.textTex = gl.createTexture();
    this.occTex = gl.createTexture();
    this.fbo = gl.createFramebuffer();
    this.mood = MOODS[opts.mood || 'noite'];
    this.cur = { sun: [...this.mood.sun], light: [...this.mood.light], shade: [...this.mood.shade] };
    this.sun = [this.mood.sun[0], this.mood.sun[1] - 0.2];
    this.ptr = null; this.ptrT = 0;
    this.open = 0; this.bright = 0; this.t0 = performance.now();
    this.scale = 1; this.slow = 0;
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.onReady = opts.onReady;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(section);
    section.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.ptr = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
      this.ptrT = performance.now();
    }, { passive: true });
    section.addEventListener('pointerleave', () => { this.ptrT = performance.now() - 2000; });
    let onScreen = true;
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; this.toggle(onScreen && !document.hidden); }).observe(section);
    document.addEventListener('visibilitychange', () => this.toggle(onScreen && !document.hidden));
    if (reduceMotion) { this.open = 0.8; this.bright = 1; this.sun = [...this.mood.sun]; requestAnimationFrame(() => this.draw(0)); this.onReady?.(); }
    else this.toggle(true);
  }
  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  setMood(name) {
    this.mood = MOODS[name]; this.moodT = performance.now();
    this.moodFrom = { sun: [...this.cur.sun], light: [...this.cur.light], shade: [...this.cur.shade] };
    if (reduceMotion) { this.cur = { sun: [...this.mood.sun], light: [...this.mood.light], shade: [...this.mood.shade] }; this.sun = [...this.mood.sun]; this.draw(0); }
  }
  // desenha cada letra do h1 exatamente onde o navegador a colocou
  drawText() {
    const r = this.canvas.getBoundingClientRect();
    const s = Math.min(devicePixelRatio || 1, 2);
    const c = this.textCanvas || (this.textCanvas = document.createElement('canvas'));
    c.width = Math.max(1, Math.round(r.width * s)); c.height = Math.max(1, Math.round(r.height * s));
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff';
    const cs = getComputedStyle(this.h1);
    x.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * s}px ${cs.fontFamily}`;
    const asc = x.measureText('H').fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * s * 0.92;
    const walker = document.createTreeWalker(this.h1, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let top = Infinity, bottom = -Infinity;
    const tf = cs.textTransform;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const raw = n.textContent;
      const t = tf === 'uppercase' ? raw.toUpperCase() : tf === 'lowercase' ? raw.toLowerCase() : raw;
      for (let i = 0; i < t.length; i++) {
        if (!t[i].trim()) continue;
        range.setStart(n, i); range.setEnd(n, i + 1);
        const b = range.getBoundingClientRect();
        if (!b.width) continue;
        x.fillText(t[i], (b.left - r.left) * s, (b.top - r.top) * s + asc);
        top = Math.min(top, b.top); bottom = Math.max(bottom, b.bottom);
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // ~9 ripas na altura de uma letra (altura da caixa de linha / 1,15)
    const lineH = parseFloat(cs.fontSize) * 0.74;
    this.count = 9 / (lineH / r.height);
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const k = this.dpr * this.scale;
    this.canvas.width = Math.round(r.width * k); this.canvas.height = Math.round(r.height * k);
    this.ow = Math.max(1, Math.round(this.canvas.width / 3)); this.oh = Math.max(1, Math.round(this.canvas.height / 3));
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.occTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.ow, this.oh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.occTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.floorLine = innerWidth < 760 ? 0.2 : 0.24;
    this.drawText();
    if (reduceMotion) this.draw(0);
  }
  toggle(on) {
    if (on && !this.running && !reduceMotion) { this.running = true; this.last = performance.now(); const f = (t) => { if (!this.running) return; this.raf = requestAnimationFrame(f); this.tick(t); }; this.raf = requestAnimationFrame(f); }
    else if (!on) { this.running = false; cancelAnimationFrame(this.raf); }
  }
  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    // abertura: 2,2 s
    const k = Math.min(1, (now - this.t0) / 2200), e = 1 - Math.pow(1 - k, 3);
    this.bright = e; this.open = 0.8 * e;
    if (k >= 1 && !this.ready) { this.ready = true; this.onReady?.(); }
    // transição de clima (~0,5 s)
    if (this.moodFrom) {
      const m = Math.min(1, (now - this.moodT) / 500), me = m * m * (3 - 2 * m);
      for (const key of ['sun', 'light', 'shade']) this.cur[key] = this.moodFrom[key].map((v, i) => v + (this.mood[key][i] - v) * me);
      if (m >= 1) this.moodFrom = null;
    }
    const home = [this.cur.sun[0] + Math.sin(now * 0.00021) * 0.025, this.cur.sun[1] + Math.sin(now * 0.00033 + 1) * 0.02 - 0.2 * (1 - e)];
    const active = this.ptr && now - this.ptrT < 2600;
    let tgt = active ? [this.ptr[0], Math.max(this.floorLine + 0.06, this.ptr[1])] : home;
    const rate = active ? 6 : 1.4;
    const a = 1 - Math.exp(-rate * dt);
    this.sun[0] += (tgt[0] - this.sun[0]) * a; this.sun[1] += (tgt[1] - this.sun[1]) * a;
    this.draw(now);
    // orçamento: 26 ms por 24 quadros seguidos -> reduz 1/8, até metade
    if (dt * 1000 > 26) { if (++this.slow >= 24 && this.scale > 0.5) { this.scale = Math.max(0.5, this.scale - 0.125); this.slow = 0; this.resize(); } } else this.slow = 0;
  }
  draw(now) {
    const gl = this.gl;
    const set = (prog) => {
      const u = prog.u;
      gl.useProgram(prog.p);
      gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform2f(u.uSun, this.sun[0], this.sun[1]);
      gl.uniform1f(u.uOpen, this.open);
      gl.uniform1f(u.uCount, this.count);
      gl.uniform1f(u.uFloor, this.floorLine);
      gl.uniform1f(u.uBright, this.bright);
      gl.uniform1f(u.uTime, now / 1000);
      gl.uniform3fv(u.uLight, this.cur.light);
      gl.uniform3fv(u.uShade, this.cur.shade);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textTex); gl.uniform1i(u.uText, 0);
    };
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.ow, this.oh);
    set(this.occ); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    set(this.main);
    gl.uniform1i(this.main.u.uSteps, this.steps);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.occTex); gl.uniform1i(this.main.u.uOcc, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
