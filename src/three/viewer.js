// Visualizador de produto: estúdio escuro com luz quente, arrastar para girar.
// Usado na página do produto, na vitrine de destaques e para gerar as imagens.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeProduct, disposeTree } from './models.js';
import { AdaptiveScale, isMobile, reduceMotion, clamp, damp, watchVisible, warmup } from './perf.js';

export function studio(renderer, { background = null, floor = true, warm = 1 } = {}) {
  const scene = new THREE.Scene();
  if (background != null) scene.background = new THREE.Color(background);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0xfff1df, 0x1a1410, 0.5));
  const key = new THREE.DirectionalLight(0xffd6a0, 2.6 * warm);
  key.position.set(-2.2, 3.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 12 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0xffe2b8, 1.6);
  rim.position.set(2.5, 1.5, -2.5);
  const fill = new THREE.DirectionalLight(0xb9c6d6, 0.35);
  fill.position.set(2, 0.5, 3);
  scene.add(key, rim, fill);
  if (floor) {
    const f = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
    f.rotation.x = -Math.PI / 2; f.position.y = -0.5; f.receiveShadow = true;
    scene.add(f);
    scene.userData.floor = f;
  }
  return scene;
}

export function setupRenderer(canvasOrHost, { alpha = true, preserve = false, maxDpr } = {}) {
  const dpr = Math.min(devicePixelRatio || 1, maxDpr ?? (isMobile ? 1.5 : 2));
  const r = new THREE.WebGLRenderer({ antialias: true, alpha, powerPreference: 'high-performance', preserveDrawingBuffer: preserve });
  r.debug.checkShaderErrors = import.meta.env.DEV; // sem espera síncrona da GPU em produção
  r.setPixelRatio(dpr);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  if (canvasOrHost) canvasOrHost.appendChild(r.domElement);
  return r;
}

// Visualizador de um produto (página do produto)
export class ProductViewer {
  constructor(host, product, colorIndex = 0) {
    this.host = host;
    this.renderer = setupRenderer(host);
    this.scale = new AdaptiveScale({ max: this.renderer.getPixelRatio(), min: 0.75, onChange: (v) => { this.renderer.setPixelRatio(v); this.resize(); } });
    this.scene = studio(this.renderer);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    this.camera.position.set(0, 0.25, 3.6);
    this.camera.lookAt(0, 0.05, 0);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.rotY = -0.5; this.vel = 0; this.tilt = 0; this.dragging = false; this.idle = 0;
    this.zoom = 1;
    this.setProduct(product, colorIndex);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
    this.attach();
    this.renderer.shadowMap.needsUpdate = true;
    watchVisible(host, (v) => (v ? this.start() : this.stop()));
  }
  setProduct(product, colorIndex = 0) {
    if (this.obj) { this.pivot.remove(this.obj); disposeTree(this.obj); }
    this.obj = makeProduct(product, colorIndex, { hanger: false });
    this.obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    this.pivot.add(this.obj);
    this.pop = performance.now();
    this.dirty = true;
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 38 : 30;
    this.camera.updateProjectionMatrix();
  }
  attach() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'pan-y';
    let lx = 0, ly = 0, lt = 0;
    el.addEventListener('pointerdown', (e) => { this.dragging = true; lx = e.clientX; ly = e.clientY; lt = performance.now(); el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const now = performance.now(), dt = Math.max(1, now - lt);
      const dx = e.clientX - lx, dy = e.clientY - ly;
      this.rotY += dx * 0.01; this.vel = (dx * 0.01) / dt * 16;
      this.tilt = clamp(this.tilt + dy * 0.004, -0.5, 0.6);
      lx = e.clientX; ly = e.clientY; lt = now; this.idle = 0;
    });
    const up = () => { this.dragging = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', () => { this.zoom = this.zoom > 1 ? 1 : 1.6; });
  }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); const f = (t) => { if (!this.running) return; this.raf = requestAnimationFrame(f); this.frame(t); }; this.raf = requestAnimationFrame(f); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.dragging) {
      this.idle += dt;
      this.rotY += this.vel; this.vel *= Math.pow(0.04, dt);
      if (!reduceMotion && this.idle > 1.2) this.rotY += dt * 0.45;
      this.tilt = damp(this.tilt, 0, 2, dt);
    }
    const pk = clamp((now - this.pop) / 600, 0, 1), pe = 1 - Math.pow(1 - pk, 3);
    this.pivot.rotation.y = this.rotY;
    this.pivot.rotation.x = this.tilt * 0.6;
    this.pivot.scale.setScalar(0.85 + 0.15 * pe);
    this.camera.zoom = damp(this.camera.zoom, this.zoom, 8, dt); this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    this.scale.tick(now);
  }
}

// Vitrine: vários produtos numa fileira, controlada pelo progresso do scroll.
export class Showcase {
  constructor(host, products) {
    this.host = host;
    this.renderer = setupRenderer(host);
    this.scale = new AdaptiveScale({ max: this.renderer.getPixelRatio(), min: 0.7, onChange: (v) => { this.renderer.setPixelRatio(v); this.resize(); } });
    this.scene = studio(this.renderer, { floor: false });
    this.renderer.shadowMap.enabled = false;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    this.camera.position.set(0, 0.1, 4.6);
    this.items = products.map((p, i) => {
      const g = new THREE.Group(); const o = makeProduct(p, 0, { hanger: false }); g.add(o); this.scene.add(g);
      return { g, spin: i * 1.3 };
    });
    this.progress = 0; this.target = 0;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
    // shaders compilados em paralelo; só começa a desenhar quando estiverem prontos
    this.renderer.compileAsync(this.scene, this.camera).catch(() => {}).then(() => {
      watchVisible(host, (v) => (v ? this.start() : this.stop()));
      if (!this.running) warmup(this.renderer, this.scene, this.camera);
    });
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 40 : 30; this.camera.updateProjectionMatrix();
  }
  set(p) { this.target = p; if (reduceMotion) this.progress = p; }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); const f = (t) => { if (!this.running) return; this.raf = requestAnimationFrame(f); this.frame(t); }; this.raf = requestAnimationFrame(f); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.progress = damp(this.progress, this.target, 7, dt);
    const narrow = this.camera.aspect < 0.9;
    const gap = narrow ? 1.25 : 1.55;
    this.items.forEach((it, i) => {
      const d = i - this.progress, ad = Math.abs(d);
      it.g.position.set(d * gap, -Math.min(ad, 1.5) * 0.12, -ad * 0.9);
      const s = 1 - Math.min(ad, 1) * 0.42;
      it.g.scale.setScalar(s);
      if (!reduceMotion) it.spin += dt * (0.5 + Math.max(0, 1 - ad) * 0.3);
      it.g.rotation.y = it.spin;
      it.g.visible = ad < 2.2;
    });
    this.renderer.render(this.scene, this.camera);
    this.scale.tick(now);
  }
}
