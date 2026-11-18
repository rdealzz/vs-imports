// Gera as imagens provisórias (cards, fotos de clima, coleções e loja)
// renderizando os modelos 3D. Rode com `npm run assets`.
import * as THREE from 'three';
import { PRODUCTS, CATEGORIES } from '../src/data/products.js';
import { makeProduct } from '../src/three/models.js';
import { studio } from '../src/three/viewer.js';
import { Store3D } from '../src/three/store.js';

const out = [];
const only = new URLSearchParams(location.search).get('only');
await document.fonts.load('italic 900 100px "Archivo"'); await document.fonts.load('800 100px "Archivo"'); await document.fonts.load('600 100px "Archivo"');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

function shot(scene, camera, w, h, bg) {
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (bg) bg(x, w, h);
  x.drawImage(renderer.domElement, 0, 0);
  if (bg) { // grão leve, para não parecer render liso
    const id = x.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(id, 0, 0);
  }
  return c.toDataURL('image/webp', 0.86);
}
const darkBg = (x, w, h) => { const g = x.createRadialGradient(w * 0.45, h * 0.38, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75); g.addColorStop(0, '#F1EDE6'); g.addColorStop(0.6, '#E0DAD0'); g.addColorStop(1, '#CEC6B9'); x.fillStyle = g; x.fillRect(0, 0, w, h); };
const sandBg = (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#d9c7a8'); g.addColorStop(0.5, '#b9946a'); g.addColorStop(1, '#5a3f28'); x.fillStyle = g; x.fillRect(0, 0, w, h); const r = x.createRadialGradient(w * 0.25, h * 0.2, 0, w * 0.25, h * 0.2, w * 0.9); r.addColorStop(0, 'rgba(255,236,200,.55)'); r.addColorStop(1, 'rgba(255,236,200,0)'); x.fillStyle = r; x.fillRect(0, 0, w, h); };

function productScene(p, ci, { pedestal = false } = {}) {
  const scene = studio(renderer, { floor: !pedestal, warm: pedestal ? 1.3 : 1 });
  const g = makeProduct(p, ci, { hanger: false });
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(g);
  if (pedestal) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0xc9b08a, roughness: 0.95 }));
    ped.position.y = -0.75; ped.receiveShadow = true; ped.castShadow = true; scene.add(ped);
  }
  return { scene, g };
}

const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
for (const p of PRODUCTS) {
  if (only && !p.id.includes(only)) continue;
  for (let ci = 0; ci < p.colors.length; ci++) {
    const { scene, g } = productScene(p, ci);
    g.rotation.y = p.model === 'shoe' ? -0.55 : p.model === 'cap' ? -0.6 : -0.32;
    cam.position.set(0, 0.3, 3.7); cam.lookAt(0, 0.02, 0);
    out.push({ name: ci ? `${p.id}-card-${ci}` : `${p.id}-card`, data: shot(scene, cam, 800, 1000, darkBg) });
  }
  const m = productScene(p, 0, { pedestal: true });
  m.g.rotation.y = p.model === 'shoe' ? 0.5 : -0.4;
  cam.position.set(-0.4, 0.6, 3.6); cam.lookAt(0, -0.05, 0);
  out.push({ name: `${p.id}-mood`, data: shot(m.scene, cam, 900, 1200, sandBg) });
  document.getElementById('s').textContent = 'Produtos: ' + out.length;
}
// coleções: três peças da categoria lado a lado
for (const c of CATEGORIES) {
  if (only && only !== 'cat') continue;
  const list = PRODUCTS.filter((p) => p.cat === c.id).slice(0, 3);
  const scene = studio(renderer, { floor: true });
  list.forEach((p, i) => { const g = makeProduct(p, 0, { hanger: false }); g.position.x = (i - (list.length - 1) / 2) * 1.05; g.position.z = -Math.abs(i - 1) * 0.3; g.rotation.y = -0.4 + i * 0.25; g.scale.multiplyScalar(0.8); g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); scene.add(g); });
  cam.position.set(0, 0.5, 4.6); cam.lookAt(0, -0.05, 0);
  out.push({ name: `cat-${c.id}`, data: shot(scene, cam, 1000, 1000, darkBg) });
}
// camiseta do centro do anel (fundo transparente)
if (!only) {
  const p = PRODUCTS[0];
  const scene = studio(renderer, { floor: false });
  const g = makeProduct(p, 0, { hanger: true }); g.rotation.y = -0.15; scene.add(g);
  cam.position.set(0, 0.15, 3.4); cam.lookAt(0, 0.1, 0);
  out.push({ name: 'anel-centro', data: shot(scene, cam, 800, 1000, null) });
}
// loja
if (!only || only === 'loja') {
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1000px;visibility:hidden'; document.body.appendChild(host);
  const store = new Store3D(host, { capture: true, view: 'entrada' });
  await new Promise((r) => { const prev = store.M.onLogo; store.M.onLogo = () => { prev?.(); r(); }; setTimeout(r, 4000); });
  const snap = (name, w, h, view) => {
    host.style.width = w + 'px'; host.style.height = h + 'px'; store.resize(); store.setView(view, 0); store.renderOnce();
    out.push({ name, data: store.renderer.domElement.toDataURL('image/webp', 0.86) });
  };
  snap('loja-entrada', 1600, 1000, 'entrada');
  snap('loja-entrada-m', 900, 1400, 'entrada');
  snap('loja-geral', 1600, 1000, 'geral');
  snap('loja-estante', 1200, 1200, 'estante');
  snap('loja-logo', 1200, 1200, 'logo');
  // capa: parede do logo em retrato, câmera um pouco mais baixa e próxima
  host.style.width = '1500px'; host.style.height = '1900px'; store.resize();
  const L = store.L;
  store.flyTo([L.xr - 1.0, 1.45, L.logoZ + 2.0], [L.xl, 1.62, L.logoZ - 0.1], 0); store.renderOnce();
  out.push({ name: 'capa-loja', data: store.renderer.domElement.toDataURL('image/webp', 0.9) });
}
// versões pequenas (480 px) dos cards, para celular e grade do catálogo
for (const a of out.filter((o) => o.name.includes('-card')).slice()) {
  const im = new Image(); im.src = a.data; await im.decode();
  const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(480 * im.height / im.width);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
  out.push({ name: a.name + '-sm', data: c.toDataURL('image/webp', 0.84) });
}
document.getElementById('s').textContent = 'Pronto: ' + out.length;
window.__assets = out;
