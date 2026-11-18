// Loja 3D navegável. Layout herdado do projeto da sala (5 × 9 m, Capão Raso).
// Desempenho: geometria estática fundida por material, peças instanciadas
// por variante, sombra calculada uma vez e render só quando algo muda.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRODUCTS, byId } from '../data/products.js';
import { makeProduct, makeTee, makeCap, makeShoe, makeShorts } from './models.js';
import { AdaptiveScale, isMobile, reduceMotion, clamp, watchVisible } from './perf.js';

const FONT = '"Archivo", "Arial Narrow", Arial, sans-serif';

export function layout(W = 5, D = 9, H = 2.7) {
  const z0 = D / 2, zb = -D / 2, xl = -W / 2, xr = W / 2;
  const win = { x1: xl + 0.3, x2: xr - 0.35, y1: 1.05, y2: H - 0.25 };
  const caixa = { x: -0.3, z: zb + 1.3, w: clamp(W - 2.6, 1.4, 2.4), d: 0.6 };
  const provW = 1.2, provD = 1.2;
  const door = { x: xr - 0.75, w: 0.9 };
  const est = { x1: xl + provW + 0.08, w: clamp(door.x - door.w / 2 - 0.25 - (xl + provW + 0.08), 0.8, 1.6), d: 0.6 };
  const aZ2 = zb + 2.0, aZ1 = Math.min(z0 - provD - 0.6, aZ2 + 3.6);
  const arL = { z1: aZ1, z2: aZ2, len: Math.max(1, aZ1 - aZ2), mid: (aZ1 + aZ2) / 2, x: xl + 0.5 };
  const logoZ = aZ2 + 1.0;
  const rz1 = logoZ + 0.95, rz2 = Math.min(z0 - provD - 0.15, rz1 + 2.4);
  const rip = { z1: rz1, z2: rz2, len: Math.max(0, rz2 - rz1), mid: (rz1 + rz2) / 2 };
  const sZ2 = zb + 2.2, sZ1 = Math.max(sZ2 + 1.2, Math.min(z0 - 2.0, sZ2 + 5.5));
  const est2 = { z1: sZ1, z2: sZ2, len: sZ1 - sZ2, mid: (sZ1 + sZ2) / 2 };
  const mid = (z0 + zb) / 2;
  const tw = clamp(W - 3.5, 1.0, 1.4);
  const mesa1 = { x: 0, z: mid + 0.75, w: tw, d: 0.8, h: 0.72 }, mesa2 = { x: 0, z: mid - 0.45, w: tw - 0.2, d: 0.6, h: 0.95 };
  const mirror = { z: z0 - 1.4 };
  const frase = { z: zb + 1.05 };
  return { W, D, H, z0, zb, xl, xr, win, caixa, provW, provD, door, est, arL, logoZ, rip, est2, mesa1, mesa2, mirror, frase };
}

function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeMats() {
  const rnd = rng(21);
  const floor = canvasTex(512, 512, (x, w, h) => {
    const n = 10, pw = w / n;
    for (let c = 0; c < n; c++) {
      let y = -rnd() * h * 0.8;
      while (y < h) {
        const L = h * (0.45 + rnd() * 0.5);
        const b = [84 + rnd() * 22, 60 + rnd() * 14, 42 + rnd() * 10].map(Math.round);
        x.fillStyle = `rgb(${b})`; x.fillRect(c * pw, y, pw, L);
        for (let g = 0; g < 28; g++) { x.fillStyle = `rgba(45,26,12,${rnd() * 0.14})`; x.fillRect(c * pw + rnd() * pw, y, 1, L); }
        x.fillStyle = 'rgba(28,16,8,.55)'; x.fillRect(c * pw, y, pw, 1.5); y += L;
      }
      x.fillStyle = 'rgba(28,16,8,.5)'; x.fillRect(c * pw, 0, 1.2, h);
    }
  }, true);
  const outside = canvasTex(1024, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h * 0.6); g.addColorStop(0, '#C9D4DB'); g.addColorStop(1, '#EEF1F2'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#B9BEC2'; x.fillRect(w * 0.55, h * 0.05, w * 0.08, h * 0.5); x.fillStyle = '#A9AEB2'; x.fillRect(w * 0.1, h * 0.28, w * 0.35, h * 0.25);
    x.fillStyle = '#8E9398'; x.fillRect(w * 0.05, h * 0.48, w * 0.9, h * 0.06);
    x.fillStyle = '#D8B85E'; x.fillRect(0, h * 0.55, w, h * 0.45);
  });
  const S = (c, r = 0.8, mt = 0, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt, ...extra });
  const M = {
    wall: S(0x1D1E20, 0.92), ceil: S(0xECEAE5, 1), floor: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, map: floor, clearcoat: 0.35, clearcoatRoughness: 0.22 }),
    black: S(0x1A1B1D, 0.5, 0.4), matte: S(0x1B1C1E, 0.75), slat: S(0x111214, 0.6), alu: S(0xC9CCCF, 0.4, 0.6), white: S(0xF2F2F0, 0.6),
    glass: new THREE.MeshStandardMaterial({ color: 0xD4E4E6, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    outside: new THREE.MeshBasicMaterial({ map: outside }),
    blind: S(0xF1F1EE, 0.7), led: new THREE.MeshBasicMaterial({ color: 0xFFE1A8, toneMapped: false }), ledSoft: new THREE.MeshBasicMaterial({ color: 0xF7D9A2 }),
    curtain: S(0x1E1F21, 0.95, 0, { side: THREE.DoubleSide }), green: S(0x4F6B34, 0.85), green2: S(0x6C8A42, 0.85), pot: S(0x1C1C1E, 0.6),
    mirror: S(0xCFD9DD, 0.08, 0.9), door: S(0x3A3C40, 0.7), gold: S(0xC9A25A, 0.3, 0.85), screen: S(0x2B3540, 0.3),
  };
  const logo = canvasTex(1024, 760, (x, w, h) => {
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#F7F2EA'; x.shadowColor = 'rgba(255,214,150,.9)'; x.shadowBlur = 26;
    x.font = `italic 900 360px ${FONT}`; x.fillText('VS', w / 2, h * 0.3); x.font = `600 140px ${FONT}`; x.fillText('Imports', w / 2, h * 0.66);
    x.shadowBlur = 10; x.font = `600 42px ${FONT}`; x.fillText('A LOJA QUE VESTE OS ARTISTAS', w / 2, h * 0.9); x.fillRect(w * 0.04, h * 0.9 - 2, w * 0.13, 4); x.fillRect(w * 0.83, h * 0.9 - 2, w * 0.13, 4);
  });
  M.logo = new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false, depthWrite: false });

  const frase = canvasTex(1024, 700, (x, w, h) => {
    x.save(); x.translate(w / 2, h / 2); x.rotate(-0.16); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeStyle = '#C9A045'; x.lineWidth = 22; x.lineCap = 'round'; x.beginPath(); x.moveTo(-w * 0.36, h * 0.25); x.quadraticCurveTo(-w * 0.05, h * 0.14, w * 0.33, h * 0.13); x.stroke();
    x.fillStyle = '#EDEAE3'; x.font = `italic 800 108px ${FONT}`; x.fillText('ESTILO E QUALIDADE', 0, -h * 0.14); x.fillText('É COM A VS', w * 0.06, h * 0.04); x.restore();
  });
  M.frase = new THREE.MeshBasicMaterial({ map: frase, transparent: true, depthWrite: false });
  const plaque = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#1C1D20'; x.fillRect(0, 0, w, h); x.fillStyle = '#F2EDE4'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `italic 900 110px ${FONT}`; x.fillText('VS', w / 2, h * 0.4); x.font = `500 40px ${FONT}`; x.fillText('Imports', w / 2, h * 0.78);
  });
  M.plaque = S(0xffffff, 0.6, 0, { map: plaque });
  // troca pelo SVG oficial assim que carregar (vetor -> textura nítida de 2048 px)
  M.onLogo = null;
  const svgImg = new Image();
  svgImg.onload = () => {
    const paint = (tex, size, bg) => {
      tex.dispose(); // o tamanho muda: recria a textura na GPU
      const c = tex.image; c.width = c.height = size;
      const x = c.getContext('2d'); x.clearRect(0, 0, size, size);
      if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
      x.drawImage(svgImg, 0, 0, size, size);
      tex.needsUpdate = true;
    };
    paint(logo, 2048); paint(plaque, 512, '#0B0B0B');
    M.onLogo?.();
  };
  svgImg.src = `${import.meta.env.BASE_URL}brand/vs-logo.svg`;
  M.product = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  return M;
}

// Converte um grupo de malhas em uma geometria só, com cor por vértice.
const _c = new THREE.Color();
function bakeColored(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = [];
  group.traverse((m) => {
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.copy(mats[0].color);
    for (let i = 0; i < n; i++) _c.toArray(col, i * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(out);
  });
  return mergeGeometries(parts);
}

// Funde todas as malhas estáticas por material (dezenas de draw calls em vez de milhares).
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  root.traverse((m) => {
    if (!m.isMesh) return;
    if (m.userData.keep || Array.isArray(m.material)) { keep.push(m); return; }
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('uv', g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
    if (!buckets.has(key)) buckets.set(key, { mat: m.material, cast: m.castShadow, rec: m.receiveShadow, geos: [] });
    buckets.get(key).geos.push(out);
  });
  const merged = new THREE.Group();
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.rec; mesh.matrixAutoUpdate = false;
    merged.add(mesh);
  }
  keep.forEach((m) => { m.updateMatrixWorld(true); const c = m.clone(); c.matrix.copy(m.matrixWorld); c.matrixAutoUpdate = false; merged.add(c); });
  return merged;
}

/* ===================================================================== */

export class Store3D {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.L = layout();
    this.dirty = true;
    this.hover = null; this.selected = null;
    this.onSelect = opts.onSelect; this.onHover = opts.onHover; this.onOpen = opts.onOpen;
    const maxDpr = Math.min(devicePixelRatio || 1, isMobile ? 1.75 : 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.capture });
    this.renderer.setPixelRatio(maxDpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // sombra estática, calculada uma vez
    host.appendChild(this.renderer.domElement);
    this.scale = new AdaptiveScale({ max: maxDpr, min: 0.75, budget: 19, onChange: (v) => { this.renderer.setPixelRatio(v); this.resize(); } });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b0d);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.camera = new THREE.PerspectiveCamera(isMobile ? 62 : 52, 1, 0.05, 120);
    this.M = makeMats();
    this.M.onLogo = () => { this.dirty = true; };
    this.build();
    this.orbit = { target: new THREE.Vector3(), r: 5, theta: 0, phi: 1.2 };
    this.anim = null;
    this.raycaster = new THREE.Raycaster();
    this.ptr = new THREE.Vector2(); this.ptrIn = false; this.needPick = false;
    this.setView(opts.view || 'entrada', 0);
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(host);
    this.attach();
    this.running = false;
    if (!opts.capture) watchVisible(host, (v) => (v ? this.start() : this.stop()));
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /* ------------------------------------------------------------- cena */
  build() {
    const { M, L } = this;
    const { W, D, H, z0, zb, xl, xr } = L;
    const st = new THREE.Group(); // estático, será fundido
    const rnd = rng(5);
    const box = (w, h, d, mat, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; m.castShadow = o.cast !== false; m.receiveShadow = true; (o.parent || st).add(m); return m; };
    const cyl = (rt, rb, h, mat, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16), mat); m.position.set(x, y + h / 2, z); m.castShadow = o.cast !== false; m.receiveShadow = true; (o.parent || st).add(m); return m; };
    const plane = (w, h, mat, x, y, z, ry = 0, rx = 0, o = {}) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.set(rx, ry, 0); m.position.set(x, y, z); m.receiveShadow = o.receive !== false; m.castShadow = false; (o.parent || st).add(m); return m; };

    // luzes
    const lights = new THREE.Group();
    lights.add(new THREE.HemisphereLight(0xFFF4E6, 0x6b5a48, 0.55));
    const sun = new THREE.DirectionalLight(0xEAF2FF, 1.1);
    sun.position.set(0.8, H + 1.2, zb - 4); sun.target.position.set(0, 0, zb + 3);
    sun.castShadow = true;
    const sz = Math.max(W, D) * 0.7;
    Object.assign(sun.shadow.camera, { left: -sz, right: sz, top: sz, bottom: -sz, near: 0.5, far: 40 });
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    lights.add(sun, sun.target);
    [z0 - 1.6, (z0 + zb) / 2, zb + 1.8].forEach((z) => { const p = new THREE.PointLight(0xFFD9A8, 3.2, Math.max(W, D) * 1.1, 1.4); p.position.set(0, H - 0.3, z); lights.add(p); });
    // luz das araras (spots quentes)
    const spotL = new THREE.SpotLight(0xFFD7A0, 9, 6, 0.75, 0.6, 1.3); spotL.position.set(xl + 1.5, H - 0.05, L.arL.mid); spotL.target.position.set(xl + 0.4, 1.0, L.arL.mid);
    const spotR = new THREE.SpotLight(0xFFD7A0, 9, 6, 0.75, 0.6, 1.3); spotR.position.set(xr - 1.5, H - 0.05, L.est2.mid); spotR.target.position.set(xr - 0.3, 1.4, L.est2.mid);
    const gl = new THREE.PointLight(0xFFE0B0, 1.6, 2.6, 2); gl.position.set(xl + 0.5, H - 0.6, L.logoZ);
    lights.add(spotL, spotL.target, spotR, spotR.target, gl);
    this.scene.add(lights);

    // piso, teto, paredes
    M.floor.map.repeat.set(W / 2, D / 2);
    plane(W, D, M.floor, 0, 0, 0, 0, -Math.PI / 2);
    const ceil = plane(W, D, M.ceil, 0, H, 0, 0, Math.PI / 2); ceil.receiveShadow = false;
    plane(D, H, M.wall, xl, H / 2, 0, Math.PI / 2);
    plane(D, H, M.wall, xr, H / 2, 0, -Math.PI / 2);
    plane(W, H, M.wall, 0, H / 2, z0, Math.PI);
    const wn = L.win;
    plane(W, wn.y1, M.wall, 0, wn.y1 / 2, zb);
    plane(W, H - wn.y2, M.wall, 0, (H + wn.y2) / 2, zb);
    plane(wn.x1 - xl, wn.y2 - wn.y1, M.wall, (xl + wn.x1) / 2, (wn.y1 + wn.y2) / 2, zb);
    plane(xr - wn.x2, wn.y2 - wn.y1, M.wall, (xr + wn.x2) / 2, (wn.y1 + wn.y2) / 2, zb);
    const ww = wn.x2 - wn.x1, wh = wn.y2 - wn.y1, wcx = (wn.x1 + wn.x2) / 2;
    this.outside = plane(ww + 3, wh + 2.5, M.outside, wcx, (wn.y1 + wn.y2) / 2 + 0.2, zb - 1.6, 0, 0, { receive: false, parent: this.scene });
    const glass = plane(ww, wh, M.glass, wcx, (wn.y1 + wn.y2) / 2, zb - 0.02, 0, 0, { receive: false, parent: this.scene });
    glass.renderOrder = 2;
    box(ww + 0.04, 0.04, 0.22, M.alu, wcx, wn.y1 - 0.04, zb + 0.06, { cast: false });
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => box(0.04, wh, 0.06, M.alu, wn.x1 + ww * f, wn.y1, zb, { cast: false }));
    box(ww, 0.04, 0.06, M.alu, wcx, wn.y1 + wh * 0.35, zb, { cast: false }); box(ww, 0.05, 0.06, M.alu, wcx, wn.y2 - 0.05, zb, { cast: false });
    for (let by = wn.y2 - 0.06; by > wn.y2 - wh * 0.4; by -= 0.045) box(ww - 0.04, 0.012, 0.05, M.blind, wcx, by, zb + 0.07, { cast: false });
    box(0.1, 0.03, D + 0.2, M.black, xl - 0.05, H, 0, { cast: false }); box(0.1, 0.03, D + 0.2, M.black, xr + 0.05, H, 0, { cast: false });
    box(W + 0.2, 0.03, 0.1, M.black, 0, H, zb - 0.05, { cast: false }); box(W + 0.2, 0.03, 0.1, M.black, 0, H, z0 + 0.05, { cast: false });
    box(0.015, 0.08, D, M.black, xl + 0.008, 0, 0, { cast: false }); box(0.015, 0.08, D, M.black, xr - 0.008, 0, 0, { cast: false });
    [[xl + 0.02, zb + 0.02], [xr - 0.02, zb + 0.02]].forEach((p) => box(0.012, H - 0.02, 0.012, M.led, p[0], 0.01, p[1], { cast: false }));

    // porta
    box(L.door.w, 2.1, 0.04, M.door, L.door.x, 0, z0 - 0.02, { cast: false });
    box(0.025, 0.025, 0.12, M.gold, L.door.x - L.door.w / 2 + 0.1, 1.0, z0 - 0.06, { cast: false });
    plane(0.34, 0.34, M.plaque, L.door.x, 1.55, z0 - 0.045, Math.PI, 0, { receive: false });

    // teto: trilho, spots e perfis lineares (somem quando a câmera passa do teto)
    const tracks = new THREE.Group();
    const tx = Math.max(0.6, W / 2 - 0.85), tz1 = zb + 0.8, tz2 = z0 - 0.8, tl = tz2 - tz1;
    [-tx, tx].forEach((x) => box(0.04, 0.035, tl, M.black, x, H - 0.035, (tz1 + tz2) / 2, { parent: tracks, cast: false }));
    [tz1, tz2].forEach((z) => box(2 * tx, 0.035, 0.04, M.black, 0, H - 0.035, z, { parent: tracks, cast: false }));
    const nSp = Math.ceil(W * D / 3.2), per = Math.ceil(nSp / 2);
    [-tx, tx].forEach((x) => {
      for (let k = 0; k < per; k++) {
        const z = tz1 + tl * (k + 0.5) / per;
        const g = new THREE.Group(); g.position.set(x, H - 0.05, z); g.rotation.z = (x < 0 ? 1 : -1) * 0.5; tracks.add(g);
        cyl(0.035, 0.035, 0.13, M.black, 0, -0.16, 0, { parent: g, cast: false, seg: 12 });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.027, 12), M.led); disc.rotation.x = Math.PI / 2; disc.position.y = -0.162; g.add(disc);
      }
    });
    [tz1 + tl * 0.17, tz1 + tl * 0.5, tz1 + tl * 0.83].forEach((z) => { box(2 * tx - 0.2, 0.03, 0.06, M.black, 0, H - 0.06, z, { parent: tracks, cast: false }); box(2 * tx - 0.24, 0.006, 0.035, M.led, 0, H - 0.066, z, { parent: tracks, cast: false }); });

    // arara de chão (esquerda)
    const A = L.arL, ax = A.x;
    [A.z2, A.z1].forEach((z) => { box(0.03, 1.62, 0.03, M.black, ax, 0, z); box(0.5, 0.03, 0.03, M.black, ax, 0, z); });
    const bar = cyl(0.014, 0.014, A.len, M.black, 0, 0, 0, { seg: 10 }); bar.rotation.x = Math.PI / 2; bar.position.set(ax, 1.6, A.mid);
    box(0.03, 0.03, A.len, M.black, ax - 0.22, 0, A.mid); box(0.03, 0.03, A.len, M.black, ax + 0.22, 0, A.mid);

    // logo e ripado
    const lw = Math.min(1.25, A.len * 0.55), lh = lw; // logo quadrada (losango)
    plane(lw, lh, M.logo, xl + 0.03, H - 0.12 - lh / 2, L.logoZ, Math.PI / 2, 0, { receive: false, parent: this.scene }).renderOrder = 3;
    if (L.rip.len > 0.3) {
      const R = L.rip;
      for (let z = R.z1 + 0.02; z < R.z2 - 0.02; z += 0.07) box(0.04, H - 0.04, 0.04, M.slat, xl + 0.03, 0.02, z, { cast: false });
      box(0.014, H - 0.04, 0.014, M.led, xl + 0.06, 0.02, R.z1 - 0.02, { cast: false }); box(0.014, H - 0.04, 0.014, M.led, xl + 0.06, 0.02, R.z2 + 0.02, { cast: false });
      const shZ = R.z1 + Math.min(0.75, R.len / 2); box(0.3, 0.03, Math.min(1.1, R.len - 0.2), M.black, xl + 0.2, H - 0.75, shZ);
      box(0.29, 0.008, Math.min(1.08, R.len - 0.22), M.ledSoft, xl + 0.2, H - 0.758, shZ, { cast: false });
      this._logoShelf = { x: xl + 0.2, y: H - 0.72, z: shZ };
      hangPlant(xl + 0.18, H - 0.72, shZ - 0.3);
    }

    // estante direita
    const E = L.est2, nU = Math.max(2, Math.ceil(E.len / 1.2) + 1);
    for (let i = 0; i < nU; i++) { const uz = E.z2 + E.len * i / (nU - 1); box(0.03, 2.2, 0.03, M.black, xr - 0.46, 0, uz); box(0.03, 2.2, 0.03, M.black, xr - 0.04, 0, uz); }
    [1.62, 1.98].forEach((y) => { box(0.44, 0.03, E.len, M.black, xr - 0.25, y, E.mid); box(0.4, 0.008, E.len - 0.04, M.ledSoft, xr - 0.25, y - 0.008, E.mid, { cast: false }); });
    const rail = cyl(0.014, 0.014, E.len, M.black, 0, 0, 0, { seg: 10 }); rail.rotation.x = Math.PI / 2; rail.position.set(xr - 0.27, 1.48, E.mid);

    // frase e espelho
    plane(1.55, 1.06, M.frase, xr - 0.02, 1.75, L.frase.z, -Math.PI / 2, 0, { receive: false, parent: this.scene }).renderOrder = 3;
    const mz = L.mirror.z;
    box(0.03, 1.9, 0.78, M.ledSoft, xr - 0.015, 0.1, mz, { cast: false });
    plane(0.7, 1.82, M.mirror, xr - 0.035, 1.05, mz, -Math.PI / 2, 0, { receive: false });

    // mesas
    const mesa = (t) => {
      box(t.w, 0.04, t.d, M.black, t.x, t.h - 0.04, t.z);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p) => box(0.035, t.h - 0.04, 0.035, M.black, t.x + p[0] * (t.w / 2 - 0.02), 0, t.z + p[1] * (t.d / 2 - 0.02)));
      box(t.w, 0.025, 0.025, M.black, t.x, 0.08, t.z - t.d / 2 + 0.02); box(t.w, 0.025, 0.025, M.black, t.x, 0.08, t.z + t.d / 2 - 0.02);
    };
    mesa(L.mesa1); mesa(L.mesa2);

    // caixa
    const C = L.caixa;
    box(C.w, 0.98, C.d, M.matte, C.x, 0, C.z);
    for (let sx = C.x - C.w / 2 + 0.03; sx < C.x + C.w / 2 - 0.02; sx += 0.06) box(0.035, 0.86, 0.025, M.slat, sx, 0.04, C.z + C.d / 2 + 0.012, { cast: false });
    box(C.w + 0.1, 0.05, C.d + 0.12, M.black, C.x, 0.98, C.z + 0.03);
    box(C.w, 0.012, 0.02, M.led, C.x, 0.965, C.z + C.d / 2 + 0.075, { cast: false });
    box(0.04, 0.18, 0.04, M.black, C.x + 0.25, 1.03, C.z - 0.05); box(0.5, 0.32, 0.03, M.black, C.x + 0.25, 1.18, C.z - 0.06);
    plane(0.46, 0.28, M.screen, C.x + 0.25, 1.34, C.z - 0.077, Math.PI, 0, { receive: false });
    pot(C.x - C.w / 2 + 0.25, 1.03, C.z, 0.22);
    box(0.45, 0.5, 0.45, M.black, C.x + 0.35, 0, C.z - 0.75, { cast: false });

    // provador
    const pd = L.provD, pw = L.provW;
    box(0.06, 2.3, pd, M.matte, xl + pw, 0, z0 - pd / 2);
    box(pw, 0.06, pd, M.matte, xl + pw / 2, 2.3, z0 - pd / 2, { cast: false });
    const cg = new THREE.PlaneGeometry(pw - 0.08, 2.2, 30, 1); const pos = cg.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 26) * 0.025); cg.computeVertexNormals();
    const cm = new THREE.Mesh(cg, M.curtain); cm.position.set(xl + pw / 2, 1.15, z0 - pd); cm.castShadow = true; st.add(cm);
    box(pw, 0.02, 0.02, M.black, xl + pw / 2, 2.27, z0 - pd);

    // estoque
    const es = L.est; box(es.w, 2.3, es.d, M.matte, es.x1 + es.w / 2, 0, z0 - es.d / 2);
    box(0.006, 2.2, 0.01, M.black, es.x1 + es.w / 2, 0.05, z0 - es.d - 0.003, { cast: false });
    [-0.06, 0.06].forEach((o) => box(0.015, 0.5, 0.02, M.gold, es.x1 + es.w / 2 + o, 0.95, z0 - es.d - 0.01, { cast: false }));

    floorPlant(xl + 0.35, zb + 0.45); floorPlant(xr - 0.35, zb + 0.45);

    function pot(x, y, z, h) { cyl(0.07, 0.055, 0.12, M.pot, x, y, z, { seg: 12 }); for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06 + rnd() * 0.03, 0), k % 2 ? M.green : M.green2); s.position.set(x + (rnd() - 0.5) * 0.12, y + 0.12 + h * 0.4 * rnd() + 0.05, z + (rnd() - 0.5) * 0.12); s.castShadow = true; st.add(s); } }
    function hangPlant(x, y, z) { cyl(0.08, 0.06, 0.13, M.pot, x, y, z, { seg: 12 }); for (let k = 0; k < 14; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045 + rnd() * 0.03, 0), k % 2 ? M.green : M.green2); s.position.set(x + (rnd() - 0.1) * 0.12, y + 0.12 - rnd() * 0.9, z + (rnd() - 0.5) * 0.22); st.add(s); } }
    function floorPlant(x, z) { cyl(0.16, 0.12, 0.38, M.pot, x, 0, z, { seg: 16 }); cyl(0.012, 0.016, 0.6, M.pot, x, 0.36, z, { seg: 6 }); [[0, 1.15, 0, 0.24], [0.1, 0.95, 0.05, 0.18], [-0.09, 0.9, -0.06, 0.17], [0.02, 1.32, -0.04, 0.15]].forEach((p, j) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(p[3], 1), j % 2 ? M.green2 : M.green); s.position.set(x + p[0], p[1], z + p[2]); s.castShadow = true; st.add(s); }); }

    const merged = mergeStatic(st);
    const tracksMerged = mergeStatic(tracks);
    this.scene.add(merged, tracksMerged);
    this.tracks = tracksMerged;

    this.placeProducts();
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.compile(this.scene, this.camera);
  }

  /* --------------------------------------------- peças clicáveis (instanced) */
  placeProducts() {
    const L = this.L, { xl, xr } = L;
    const slots = new Map(); // chave variante -> [{matrix, pos}]
    const add = (pid, ci, pos, rotY = 0, s = 1, kind = 'item') => {
      const key = pid + '#' + ci;
      if (!slots.has(key)) slots.set(key, []);
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(s, s, s));
      slots.get(key).push({ m, pos: pos.clone(), kind, rotY });
    };
    const tees = PRODUCTS.filter((p) => p.model === 'tee');
    // arara esquerda: camisetas em blocos por cor (preto, cinza, branco)
    const blocks = [];
    tees.forEach((p) => p.colors.forEach((c, ci) => blocks.push({ p, ci, lum: (c.c >> 16) & 255 })));
    blocks.sort((a, b) => a.lum - b.lum);
    const A = L.arL;
    const per = Math.floor((A.len - 0.2) / 0.075 / blocks.length);
    let z = A.z2 + 0.12;
    blocks.forEach((b) => { for (let i = 0; i < per; i++, z += 0.075) add(b.p.id, b.ci, new THREE.Vector3(A.x, 1.54, z), 0, 1, 'hang'); });
    // estante direita: bermudas penduradas na arara + camisetas
    const E = L.est2;
    const shorts = PRODUCTS.filter((p) => p.model === 'shorts');
    const sb = []; shorts.forEach((p) => p.colors.forEach((c, ci) => sb.push({ p, ci })));
    const perS = Math.floor((E.len * 0.55) / 0.09 / sb.length);
    z = E.z2 + 0.12;
    sb.forEach((b) => { for (let i = 0; i < perS; i++, z += 0.09) add(b.p.id, b.ci, new THREE.Vector3(xr - 0.27, 1.43, z), 0, 1, 'hang'); });
    const rest = blocks.slice().reverse();
    let bi = 0;
    while (z < E.z1 - 0.12) { const b = rest[Math.floor(bi / 6) % rest.length]; add(b.p.id, b.ci, new THREE.Vector3(xr - 0.27, 1.42, z), 0, 1, 'hang'); z += 0.075; bi++; }
    // prateleiras: tênis (1,62) e bonés (1,98)
    const shoes = []; PRODUCTS.filter((p) => p.model === 'shoe').forEach((p) => p.colors.forEach((c, ci) => shoes.push({ p, ci })));
    let k = 0;
    for (z = E.z2 + 0.22; z < E.z1 - 0.15; z += 0.42, k++) { const b = shoes[k % shoes.length]; add(b.p.id, b.ci, new THREE.Vector3(xr - 0.25, 1.65, z), Math.PI / 2, 1, 'pair'); }
    const caps = []; PRODUCTS.filter((p) => p.model === 'cap').forEach((p) => p.colors.forEach((c, ci) => caps.push({ p, ci })));
    k = 0;
    for (z = E.z2 + 0.16; z < E.z1 - 0.1; z += 0.3, k++) { const b = caps[k % caps.length]; add(b.p.id, b.ci, new THREE.Vector3(xr - 0.25, 2.01, z), -Math.PI / 2, 1, 'cap'); }
    if (this._logoShelf) add(caps[0].p.id, caps[0].ci, new THREE.Vector3(this._logoShelf.x, this._logoShelf.y, this._logoShelf.z + 0.25), Math.PI / 2, 1, 'cap');
    // mesas: pilhas dobradas e bonés
    const m1 = L.mesa1, m2 = L.mesa2;
    add('camiseta-vs-classic', 0, new THREE.Vector3(-m1.w * 0.32, m1.h, m1.z), 0, 1, 'stack');
    add('camiseta-vs-classic', 1, new THREE.Vector3(m1.w * 0.32, m1.h, m1.z), 0, 1, 'stack');
    add('bone-vs-dad', 0, new THREE.Vector3(0, m1.h, m1.z), 0.4, 1, 'cap');
    add('bermuda-jeans', 0, new THREE.Vector3(-m2.w * 0.33, m2.h, m2.z), 0, 1, 'stack');
    add('bermuda-jeans', 1, new THREE.Vector3(0, m2.h, m2.z), 0, 1, 'stack');
    add('bermuda-sarja', 0, new THREE.Vector3(m2.w * 0.33, m2.h, m2.z), 0, 1, 'stack');
    add('tenis-runner', 0, new THREE.Vector3(m1.w * 0.05, m1.h, m1.z + 0.28), 0.3, 1, 'pair');

    // geometria por variante e tipo
    const geoCache = new Map();
    const getGeo = (p, ci, kind) => {
      const key = p.id + ci + kind;
      if (geoCache.has(key)) return geoCache.get(key);
      const col = p.colors[ci];
      let g;
      if (kind === 'stack') {
        const parts = [];
        const isShort = p.model === 'shorts';
        for (let i = 0; i < 5; i++) { const b = new RoundedBoxGeometry(0.3, 0.032, isShort ? 0.32 : 0.26, 2, 0.01); b.translate((i % 2) * 0.006, 0.017 + i * 0.035, 0); parts.push(b); }
        const grp = new THREE.Group(); parts.forEach((pg) => grp.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: col.c }))));
        g = bakeColored(grp);
      } else if (kind === 'hang') {
        const grp = p.model === 'tee' ? makeTee(col.c, col.a, p.print, { oversized: p.id.includes('oversized') }) : makeShorts(col.c, col.a);
        if (p.model === 'shorts') { const h = new THREE.Group(); grp.position.y = -0.04; h.add(grp); g = bakeColored(h); } else g = bakeColored(grp);
      } else if (kind === 'pair') {
        const grp = new THREE.Group(); const a = makeShoe(col.c, col.a); a.position.z = -0.065; const b = makeShoe(col.c, col.a); b.position.set(0.02, 0, 0.065); grp.add(a, b);
        g = bakeColored(grp);
      } else if (kind === 'cap') {
        g = bakeColored(makeCap(col.c, col.a, { flat: p.id.includes('reta') || p.id.includes('trucker') }));
      }
      g.computeBoundingSphere();
      geoCache.set(key, g);
      return g;
    };

    this.items = []; // { mesh, index, pid, ci, pos, base }
    this.pickables = [];
    const byKind = new Map();
    for (const [key, list] of slots) {
      const [pid, ciS] = key.split('#'); const ci = +ciS; const p = byId(pid);
      list.forEach((s) => { const k2 = key + '|' + s.kind; if (!byKind.has(k2)) byKind.set(k2, { p, ci, kind: s.kind, list: [] }); byKind.get(k2).list.push(s); });
    }
    for (const { p, ci, kind, list } of byKind.values()) {
      const mesh = new THREE.InstancedMesh(getGeo(p, ci, kind), this.M.product, list.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      list.forEach((s, i) => { mesh.setMatrixAt(i, s.m); this.items.push({ mesh, index: i, pid: p.id, ci, pos: s.pos, base: s.m.clone(), kind, rotY: s.rotY }); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.items = this.items.filter((it) => it.mesh === mesh);
      this.scene.add(mesh);
      this.pickables.push(mesh);
    }
  }

  itemFrom(hit) { return hit ? hit.object.userData.items[hit.instanceId] : null; }

  // tira a peça da arara (ou levanta da prateleira) ao passar o mouse
  setHover(item) {
    if (item === this.hover) return;
    const prev = this.hover; this.hover = item;
    this.hoverAnim = { from: prev, to: item, t0: performance.now() };
    this.dirty = true;
    this.onHover?.(item);
  }
  applyHoverPose(item, k) {
    if (!item) return;
    const off = new THREE.Vector3();
    if (item.kind === 'hang') off.x = (item.pos.x < 0 ? 0.16 : -0.16) * k;
    else off.y = 0.05 * k;
    const m = item.base.clone();
    const rot = new THREE.Matrix4().makeRotationY(item.kind === 'cap' || item.kind === 'pair' ? Math.sin(k * Math.PI) * 0.0 + k * 0.25 : 0);
    m.multiply(rot);
    m.setPosition(item.pos.clone().add(off));
    item.mesh.setMatrixAt(item.index, m);
    item.mesh.instanceMatrix.needsUpdate = true;
  }

  /* --------------------------------------------------------- câmera */
  views() {
    const L = this.L;
    return {
      entrada: { p: [0.1, 1.6, L.z0 - 0.35], t: [0, 1.25, L.zb] },
      camisetas: { p: [L.xr - 0.9, 1.65, L.arL.mid + 1.7], t: [L.xl + 0.4, 1.2, L.arL.mid - 0.4] },
      logo: { p: [L.xr - 0.8, 1.65, L.logoZ + 2.4], t: [L.xl, 1.75, L.logoZ - 0.2] },
      estante: { p: [L.xl + 0.95, 1.6, L.est2.mid + 1.2], t: [L.xr, 1.55, L.est2.mid - 0.5] },
      caixa: { p: [L.xl + 1.05, 1.6, Math.min(L.caixa.z + 2.7, L.z0 - 0.4)], t: [L.caixa.x + 0.3, 1.1, L.zb] },
    };
  }
  // caixa onde a câmera pode ficar: só o lado de dentro da sala
  bounds() {
    const L = this.L;
    // corredor livre: longe das araras/estante e na altura dos olhos
    return { x0: L.xl + 0.9, x1: L.xr - 0.75, y0: 1.1, y1: L.H - 0.25, z0: L.zb + 0.35, z1: L.z0 - 0.2 };
  }
  clampTarget(t) {
    const b = this.bounds();
    t.x = clamp(t.x, b.x0, b.x1); t.y = clamp(t.y, 0.2, this.L.H - 0.2); t.z = clamp(t.z, b.z0, b.z1);
  }
  applyOrbit() {
    const o = this.orbit, c = this.camera, sp = Math.sin(o.phi);
    this.clampTarget(o.target);
    const d = new THREE.Vector3(sp * Math.sin(o.theta), Math.cos(o.phi), sp * Math.cos(o.theta));
    // distância máxima até bater numa parede, piso ou teto
    const b = this.bounds(), t = o.target;
    let max = Infinity;
    for (const [k, lo, hi] of [['x', b.x0, b.x1], ['y', b.y0, b.y1], ['z', b.z0, b.z1]]) {
      if (d[k] > 1e-4) max = Math.min(max, (hi - t[k]) / d[k]);
      else if (d[k] < -1e-4) max = Math.min(max, (lo - t[k]) / d[k]);
    }
    o.r = clamp(o.r, 0.3, Math.max(0.3, max));
    c.position.copy(t).addScaledVector(d, o.r);
    c.lookAt(t);
  }
  syncOrbit(p, t) {
    const o = p.clone().sub(t);
    this.orbit.target.copy(t); this.orbit.r = o.length();
    this.orbit.theta = Math.atan2(o.x, o.z); this.orbit.phi = Math.acos(clamp(o.y / this.orbit.r, -1, 1));
  }
  flyTo(p, t, dur = 1100, done) {
    const P = new THREE.Vector3(...p), T = new THREE.Vector3(...t);
    if (reduceMotion || !dur) { this.syncOrbit(P, T); this.applyOrbit(); this.anim = null; this.dirty = true; done?.(); return; }
    this.anim = { fromP: this.camera.position.clone(), fromT: this.orbit.target.clone(), toP: P, toT: T, t0: performance.now(), dur, done };
    this.dirty = true;
  }
  setView(name, dur) {
    const v = this.views()[name]; if (!v) return;
    this.currentView = name;
    this.flyTo(v.p, v.t, dur ?? 1100);
    this.opts.onView?.(name);
  }
  focusItem(item, dur = 700, done) {
    const L = this.L, p = item.pos;
    const inward = p.x < 0 ? 1 : -1;
    const t = [p.x + inward * 0.05, p.y - (item.kind === 'hang' ? 0.32 : 0), p.z];
    const b = this.bounds();
    const cam = [clamp(p.x + inward * 1.25, b.x0, b.x1), clamp(Math.max(1.35, p.y - 0.1), b.y0, b.y1), clamp(p.z + 0.9, b.z0, b.z1)];
    if (item.kind === 'stack') { cam[0] = p.x + 0.6; cam[1] = 1.55; cam[2] = p.z + 1.1; }
    this.flyTo(cam, t, dur, done);
  }
  getCamera() { return { p: this.camera.position.toArray(), t: this.orbit.target.toArray() }; }

  /* -------------------------------------------------------- controles */
  attach() {
    const el = this.renderer.domElement;
    const pts = new Map(); let last = null, pinch = null, downAt = null, moved = 0;
    this.engaged = false;
    const stopAnim = () => { if (this.anim) { this.anim = null; this.syncOrbit(this.camera.position.clone(), this.orbit.target.clone()); } };
    const setPtr = (e) => { const r = el.getBoundingClientRect(); this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    el.addEventListener('pointerdown', (e) => {
      this.engaged = true; el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey };
      downAt = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType }; moved = 0;
      if (pts.size === 2) { const a = [...pts.values()]; pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 }; }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { setPtr(e); this.ptrIn = true; this.needPick = true; this.dirty = true; }
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        stopAnim();
        const a = [...pts.values()]; const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        this.orbit.r = clamp(this.orbit.r * pinch.d / d, 0.3, 7);
        const mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2; this.pan(mx - pinch.mx, my - pinch.my);
        pinch = { d, mx, my }; moved += 10; this.dirty = true; return;
      }
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 4) return;
      stopAnim();
      if (last.b === 2 || last.shift) this.pan(dx, dy);
      else this.look(dx, dy);
      last.x = e.clientX; last.y = e.clientY; this.dirty = true;
      this.opts.onView?.(null);
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        if (downAt && moved < 8 && performance.now() - downAt.t < 500) this.tap(e);
        last = null; downAt = null;
      } else { const a = [...pts.values()][0]; last = { x: a.x, y: a.y, b: 0 }; }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = null; if (!pts.size) { last = null; downAt = null; } });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.ptrIn = false; this.setHover(null); } if (!pts.size) this.engaged = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      if (!this.fullscreen) return; // fora da loja, a roda rola a página
      e.preventDefault(); stopAnim();
      this.orbit.r = clamp(this.orbit.r * (1 + clamp(e.deltaY, -120, 120) * 0.0012), 0.3, 7); this.dirty = true; this.opts.onView?.(null);
    }, { passive: false });
  }
  look(dx, dy) {
    const o = this.orbit, cam = this.camera.position.clone();
    o.theta += dx * 0.0042;
    o.phi = clamp(o.phi + dy * 0.0036, 0.75, 2.25); // ~±40° para cima e para baixo
    o.r = 1.5; // a mira fica logo à frente: nunca sai da sala
    const sp = Math.sin(o.phi);
    const d = new THREE.Vector3(sp * Math.sin(o.theta), Math.cos(o.phi), sp * Math.cos(o.theta));
    o.target.copy(cam).addScaledVector(d, -o.r);
    this.clampTarget(o.target);
  }
  zoom(f) { if (this.anim) { this.anim = null; this.syncOrbit(this.camera.position.clone(), this.orbit.target.clone()); } this.orbit.r = clamp(this.orbit.r * f, 0.3, 7); this.dirty = true; }
  pan(dx, dy) {
    const k = this.orbit.r * 0.0016;
    const right = new THREE.Vector3(Math.cos(this.orbit.theta), 0, -Math.sin(this.orbit.theta));
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    this.clampTarget(this.orbit.target);
  }
  pick() {
    this.raycaster.setFromCamera(this.ptr, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return this.itemFrom(hit);
  }
  tap(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const item = this.pick();
    if (!item) {
      this.selected = null; this.setHover(null); this.onSelect?.(null);
      // toque no piso: anda até o ponto
      this.raycaster.setFromCamera(this.ptr, this.camera);
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const pt = this.raycaster.ray.intersectPlane(floor, new THREE.Vector3());
      const L = this.L;
      if (pt && pt.x > L.xl + 0.3 && pt.x < L.xr - 0.3 && pt.z > L.zb + 0.3 && pt.z < L.z0 - 0.2) {
        const dir = new THREE.Vector3().subVectors(this.orbit.target, this.camera.position).setY(0).normalize();
        const cam = [pt.x, 1.6, pt.z];
        const tgt = [pt.x + dir.x * 1.5, 1.35, pt.z + dir.z * 1.5];
        this.flyTo(cam, tgt, 800); this.opts.onView?.(null);
      }
      return;
    }
    // mouse: clique abre direto. Toque: 1º toque seleciona, 2º abre.
    if (e.pointerType === 'mouse' || this.selected === item) { this.open(item); return; }
    this.selected = item; this.setHover(item); this.onSelect?.(item);
  }
  open(item) {
    this.selected = item; this.setHover(item);
    this.focusItem(item, 650, () => this.onOpen?.(item));
  }
  // ponto 2D de uma peça para o rótulo
  project(item) {
    const v = item.pos.clone(); v.y += item.kind === 'hang' ? 0.1 : 0.22;
    v.project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * this.host.clientWidth, y: (1 - v.y) / 2 * this.host.clientHeight };
  }

  /* --------------------------------------------------------------- loop */
  start() { if (this.running) return; this.running = true; this.scale.reset(); this.dirty = true; const f = (t) => { if (!this.running) return; this.raf = requestAnimationFrame(f); this.frame(t); }; this.raf = requestAnimationFrame(f); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  frame(now) {
    if (this.anim) {
      const a = this.anim, k = clamp((now - a.t0) / a.dur, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(a.fromP, a.toP, e);
      { const b = this.bounds(), cp = this.camera.position; cp.set(clamp(cp.x, b.x0, b.x1), clamp(cp.y, b.y0, b.y1), clamp(cp.z, b.z0, b.z1)); }
      const t = new THREE.Vector3().lerpVectors(a.fromT, a.toT, e);
      this.camera.lookAt(t); this.orbit.target.copy(t);
      if (k >= 1) { this.syncOrbit(a.toP, a.toT); this.anim = null; a.done?.(); }
      this.dirty = true;
    } else if (this.dirty) this.applyOrbit();
    if (this.hoverAnim) {
      const h = this.hoverAnim, k = clamp((now - h.t0) / 220, 0, 1), e = 1 - Math.pow(1 - k, 3);
      if (h.from) this.applyHoverPose(h.from, 1 - e);
      if (h.to) this.applyHoverPose(h.to, e);
      if (k >= 1) this.hoverAnim = null;
      this.dirty = true;
    }
    if (this.needPick && this.ptrIn && !this.anim) { this.needPick = false; this.setHover(this.pick()); this.renderer.domElement.style.cursor = this.hover ? 'pointer' : 'grab'; }
    if (!this.dirty) { this.scale.reset(); return; }
    this.dirty = false;
    const L = this.L;
    this.tracks.visible = this.camera.position.y < L.H - 0.05;
    this.outside.visible = this.camera.position.y < L.H + 0.3 && this.camera.position.z > L.zb;
    this.renderer.render(this.scene, this.camera);
    this.scale.tick(now);
    this.opts.onFrame?.();
  }
  renderOnce() { this.dirty = true; this.applyOrbit(); this.frame(performance.now()); }
}
