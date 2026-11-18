// Modelos 3D procedurais das peças. São provisórios: quando houver
// modelos reais (GLB) ou fotos 360, troque `makeProduct` por um loader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FONT = '"Archivo", "Arial Narrow", Arial, sans-serif';
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

/* ---------- texturas de estampa ---------- */
const texCache = new Map();
function printTexture(kind, base, accent, text) {
  const key = [kind, base, accent, text].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = hex(base);
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = hex(accent);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (kind === 'tee') {
    if (text === 'VS') {
      x.font = `italic 900 150px ${FONT}`;
      x.fillText('VS', 256, 236);
      x.font = `600 34px ${FONT}`;
      x.fillText('IMPORTS', 256, 330);
    } else if (text === 'ESTILO') {
      x.save(); x.translate(256, 256); x.rotate(-0.16);
      x.strokeStyle = hex(accent); x.lineWidth = 16; x.lineCap = 'round';
      x.beginPath(); x.moveTo(-170, 90); x.quadraticCurveTo(-20, 60, 160, 58); x.stroke();
      x.font = `italic 800 62px ${FONT}`;
      x.fillText('ESTILO E', 0, -50); x.fillText('QUALIDADE', 0, 18);
      x.restore();
    } else if (text === 'ARTISTAS') {
      x.font = `600 30px ${FONT}`;
      x.fillText('A LOJA QUE VESTE', 256, 200);
      x.font = `italic 900 92px ${FONT}`;
      x.fillText('ARTISTAS', 256, 270);
      x.fillRect(150, 330, 212, 5);
    } else {
      x.font = `italic 900 120px ${FONT}`;
      x.fillText(text, 256, 256);
    }
  } else if (kind === 'cap') {
    // textura da copa (esfera): frente em u = 0.25
    c.width = 1024; c.height = 256;
    x.fillStyle = hex(base); x.fillRect(0, 0, 1024, 256);
    x.fillStyle = hex(accent); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `italic 900 92px ${FONT}`;
    x.save(); x.translate(256, 150); x.scale(0.62, 1); x.fillText('VS', 0, 0); x.restore();
    // costuras dos gomos
    x.fillStyle = 'rgba(0,0,0,.22)';
    for (let i = 0; i < 6; i++) x.fillRect((i / 6) * 1024 + 85, 0, 3, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const matCache = new Map();
export function fabric(color, rough = 0.92, extra = {}) {
  const key = color + '|' + rough + '|' + JSON.stringify(Object.keys(extra));
  if (!Object.keys(extra).length && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
  if (!Object.keys(extra).length) matCache.set(key, m);
  return m;
}

/* ---------- camiseta ---------- */
// Silhueta com origem na gola, y para baixo até -0.72 m.
function teeShape(oversized = false) {
  const s = new THREE.Shape();
  const sw = oversized ? 0.34 : 0.31; // ponta da manga
  const bw = oversized ? 0.27 : 0.245; // largura da barra
  s.moveTo(-0.085, 0);
  s.quadraticCurveTo(0, -0.07, 0.085, 0);
  s.lineTo(0.2, -0.03);
  s.lineTo(sw, -0.13);
  s.lineTo(sw - 0.07, -0.27);
  s.lineTo(0.225, -0.215);
  s.quadraticCurveTo(0.235, -0.45, bw, -0.72);
  s.quadraticCurveTo(0, -0.735, -bw, -0.72);
  s.quadraticCurveTo(-0.235, -0.45, -0.225, -0.215);
  s.lineTo(-(sw - 0.07), -0.27);
  s.lineTo(-sw, -0.13);
  s.lineTo(-0.2, -0.03);
  s.closePath();
  return s;
}
const geoCache = new Map();
export function teeGeometry(oversized = false, detail = 1) {
  const key = 'tee' + oversized + detail;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new THREE.ExtrudeGeometry(teeShape(oversized), {
    depth: 0.012, curveSegments: detail > 0.5 ? 10 : 4,
    bevelEnabled: true, bevelThickness: detail > 0.5 ? 0.06 : 0.012, bevelSize: 0.022, bevelSegments: detail > 0.5 ? 7 : 1,
  });
  g.translate(0, 0, -0.006);
  // uv das faces da frente: estampa no peito (x -0.13..0.13, y -0.34..-0.08)
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) + 0.13) / 0.26, (pos.getY(i) + 0.34) / 0.26);
  }
  geoCache.set(key, g);
  return g;
}
export function teeMaterials(color, accent, print) {
  const map = printTexture('tee', color, accent, print || 'VS');
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const front = fabric(color, 0.95, { map });
  const side = fabric(color, 0.95);
  return [front, side];
}
export function makeTee(color, accent, print, opts = {}) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(teeGeometry(opts.oversized, 1), teeMaterials(color, accent, print));
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  if (opts.hanger !== false) g.add(hanger());
  return g;
}
function hanger() {
  const m = fabric(0x15161a, 0.4, { metalness: 0.6 });
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.38, 4, 8), m);
  bar.rotation.z = Math.PI / 2; bar.position.y = -0.03;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16, Math.PI * 1.3), m);
  hook.position.y = 0.04; hook.rotation.z = -0.3;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), m);
  neck.position.y = 0.0;
  g.add(bar, hook, neck);
  return g;
}

/* ---------- boné ---------- */
export function makeCap(color, accent, opts = {}) {
  const g = new THREE.Group();
  const map = printTexture('cap', color, accent, 'VS');
  const crownMat = fabric(color, 0.9, { map });
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), crownMat);
  crown.scale.set(1, 0.78, 1.12);
  crown.castShadow = true;
  // aba
  const flat = !!opts.flat;
  const bs = new THREE.Shape();
  bs.absarc(0, 0, 0.1, Math.PI, 0, true);
  bs.quadraticCurveTo(0.1, -0.1, 0, -0.105);
  bs.quadraticCurveTo(-0.1, -0.1, -0.1, 0);
  const brimGeo = new THREE.ExtrudeGeometry(bs, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 1, curveSegments: 16 });
  if (!flat) { // curvatura da aba
    const p = brimGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - p.getX(i) * p.getX(i) * 2.2);
    brimGeo.computeVertexNormals();
  }
  const brim = new THREE.Mesh(brimGeo, fabric(flat ? accent : color, 0.85));
  brim.rotation.x = Math.PI / 2 + (flat ? 0.02 : 0.16);
  brim.position.set(0, 0.008, 0.1);
  brim.castShadow = true;
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), fabric(color, 0.8));
  btn.position.y = 0.078;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 32, 1, true), fabric(new THREE.Color(color).multiplyScalar(0.7).getHex(), 0.9));
  band.scale.set(1, 1, 1.12); band.position.y = 0.006;
  g.add(crown, brim, btn, band);
  return g;
}

/* ---------- tênis ---------- */
function shoeProfile() {
  const s = new THREE.Shape();
  s.moveTo(-0.14, 0.022);
  s.lineTo(-0.145, 0.07);
  s.quadraticCurveTo(-0.148, 0.108, -0.122, 0.11);
  s.quadraticCurveTo(-0.09, 0.09, -0.055, 0.1);
  s.lineTo(-0.02, 0.118);
  s.lineTo(0.0, 0.1);
  s.quadraticCurveTo(0.06, 0.075, 0.105, 0.055);
  s.quadraticCurveTo(0.148, 0.04, 0.145, 0.022);
  s.closePath();
  return s;
}
export function makeShoe(color, accent, opts = {}) {
  const g = new THREE.Group();
  const upperGeo = new THREE.ExtrudeGeometry(shoeProfile(), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.012, bevelSegments: 4, curveSegments: 10 });
  upperGeo.translate(0, 0, -0.035);
  // afina a ponta e o calcanhar
  const p = upperGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const k = 1 - Math.max(0, (x - 0.05) / 0.1) * 0.25 - Math.max(0, (y - 0.08) / 0.04) * 0.35;
    p.setZ(i, p.getZ(i) * k);
  }
  upperGeo.computeVertexNormals();
  const upper = new THREE.Mesh(upperGeo, fabric(color, 0.55));
  upper.castShadow = true;
  // sola
  const ss = new THREE.Shape();
  ss.moveTo(-0.15, 0); ss.lineTo(0.14, 0); ss.quadraticCurveTo(0.162, 0.002, 0.158, 0.028); ss.lineTo(-0.152, 0.028); ss.quadraticCurveTo(-0.162, 0.014, -0.15, 0);
  const soleGeo = new THREE.ExtrudeGeometry(ss, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2 });
  soleGeo.translate(0, 0, -0.045);
  const soleColor = opts.soleColor ?? (color === 0x28282b ? 0x232427 : 0xf3f1ea);
  const sole = new THREE.Mesh(soleGeo, fabric(soleColor, 0.7));
  sole.castShadow = true;
  // faixa lateral (detalhe da casa)
  const st = new THREE.Shape();
  st.moveTo(-0.07, 0.035); st.quadraticCurveTo(0.0, 0.05, 0.07, 0.08); st.lineTo(0.08, 0.07); st.quadraticCurveTo(0.0, 0.035, -0.06, 0.03); st.closePath();
  const stripeGeo = new THREE.ExtrudeGeometry(st, { depth: 0.1, bevelEnabled: false });
  stripeGeo.translate(0, 0, -0.05);
  const stripe = new THREE.Mesh(stripeGeo, fabric(accent, 0.5));
  // boca do tênis
  const collar = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), fabric(0x101012, 1));
  collar.scale.set(1.7, 1, 1); collar.rotation.x = -Math.PI / 2; collar.position.set(-0.09, 0.108, 0);
  // cadarços
  const laceMat = fabric(color === 0x28282b ? 0x2a2b2e : 0xffffff, 0.8);
  const laces = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4, x = -0.01 + t * 0.09, y = 0.112 - t * 0.04;
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.07), laceMat);
    l.position.set(x, y, 0); l.rotation.z = -0.45;
    laces.push(l);
  }
  g.add(sole, upper, stripe, collar, ...laces);
  return g;
}

/* ---------- bermuda ---------- */
function shortsShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.23, 0);
  s.lineTo(0.23, 0);
  s.quadraticCurveTo(0.26, -0.25, 0.28, -0.5);
  s.lineTo(0.03, -0.53);
  s.lineTo(0, -0.24);
  s.lineTo(-0.03, -0.53);
  s.lineTo(-0.28, -0.5);
  s.quadraticCurveTo(-0.26, -0.25, -0.23, 0);
  return s;
}
export function makeShorts(color, accent) {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(shortsShape(), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.012, bevelSegments: 4, curveSegments: 8 });
  geo.translate(0, 0, -0.01);
  const body = new THREE.Mesh(geo, fabric(color, 0.95));
  body.castShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.055, 0.1), fabric(color, 0.85));
  band.position.y = -0.025;
  const stitchMat = fabric(accent, 0.6);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.004, 0.101), stitchMat); s1.position.y = -0.053;
  const cord1 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), stitchMat);
  cord1.position.set(-0.025, -0.11, 0.055); cord1.rotation.z = 0.12;
  const cord2 = cord1.clone(); cord2.position.x = 0.025; cord2.rotation.z = -0.12;
  // bolsos
  const pk = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.13, 0.002), stitchMat);
  pk.position.set(-0.17, -0.12, 0.053); pk.rotation.z = -0.5;
  const pk2 = pk.clone(); pk2.position.x = 0.17; pk2.rotation.z = 0.5;
  g.add(body, band, s1, cord1, cord2, pk, pk2);
  return g;
}

/* ---------- produto genérico ---------- */
// Retorna um grupo centrado na origem, com altura ~1 e "frente" para +z.
export function makeProduct(product, colorIndex = 0, opts = {}) {
  const col = product.colors[colorIndex] || product.colors[0];
  let obj, scale = 1;
  switch (product.model) {
    case 'tee': obj = makeTee(col.c, col.a, product.print, { oversized: product.id.includes('oversized'), hanger: opts.hanger }); obj.position.y = 0.36; scale = 1.25; break;
    case 'cap': obj = makeCap(col.c, col.a, { flat: product.id.includes('reta') || product.id.includes('trucker') }); obj.position.y = -0.03; obj.rotation.y = 0; scale = 3.6; break;
    case 'shoe': obj = makeShoe(col.c, col.a); obj.position.y = -0.06; scale = 2.7; break;
    case 'shorts': obj = makeShorts(col.c, col.a); obj.position.y = 0.26; scale = 1.5; break;
  }
  const g = new THREE.Group();
  g.add(obj);
  g.scale.setScalar(scale);
  g.userData.product = product.id;
  return g;
}

export function disposeTree(o) {
  o.traverse((n) => { if (n.geometry && !geoCache.has(n.geometry)) n.geometry.dispose?.(); });
}

export { mergeGeometries };
