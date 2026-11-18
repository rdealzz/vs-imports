import { PRODUCTS, CATEGORIES, STORE, byId, brl, installments, img } from './data/products.js';
import { initBag, bag } from './ui/bag.js';
import { cardHTML } from './ui/card.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const p = byId(qs.get('id')) || PRODUCTS[0];
let ci = Math.min(+(qs.get('cor') || 0), p.colors.length - 1);
let size = p.sizes.length === 1 ? p.sizes[0] : '';
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

initBag();
document.title = `${p.name} | VS Imports`;
const cat = CATEGORIES.find((c) => c.id === p.cat);
$('#crumb').innerHTML = `<a href="./#catalogo">Catálogo</a> / ${cat.name}`;
$('#name').textContent = p.name;
$('#price').textContent = brl(p.price);
$('#inst').textContent = installments(p.price);
$('#desc').textContent = p.desc;
if (qs.get('de') !== 'loja') $('#back').textContent = '← Ver na loja 3D';

// cores
const colors = $('#colors');
colors.innerHTML = p.colors.map((c, i) => `<button type="button" style="background:${hex(c.c)}" aria-label="${c.n}" aria-pressed="${i === ci}" data-i="${i}"></button>`).join('');
const setColor = (i) => {
  ci = i;
  colors.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
  $('#color-name').textContent = p.colors[i].n;
  viewer?.setProduct(p, i);
  showView('3d');
  updateWhats();
  const u = new URL(location.href); u.searchParams.set('cor', i); history.replaceState(null, '', u);
};
colors.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setColor(+b.dataset.i); });
$('#color-name').textContent = p.colors[ci].n;

// tamanhos
const sizes = $('#sizes');
sizes.innerHTML = p.sizes.map((s) => `<button type="button" aria-pressed="${s === size}">${s}</button>`).join('');
sizes.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; size = b.textContent; sizes.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('#msg').textContent = ''; updateWhats(); });

function updateWhats() {
  const msg = `Olá, VS Imports! Tenho interesse em: ${p.name} (${p.colors[ci].n}${size ? ', tamanho ' + size : ''}) ${brl(p.price)}`;
  $('#whats').href = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(msg)}`;
}
updateWhats();
$('#add').addEventListener('click', () => {
  if (!size) { $('#msg').textContent = 'Escolha um tamanho.'; sizes.querySelector('button')?.focus(); return; }
  bag.add(p.id, ci, size);
  $('#msg').textContent = `${p.name} na sacola.`;
});

// 3D + fotos
let viewer = null;
const media = $('.pdp-media');
const thumbs = $('#thumbs');
thumbs.innerHTML = `<button type="button" data-v="3d" aria-pressed="true" aria-label="Modelo 3D"><img src="${img(p.id)}" alt=""></button><button type="button" data-v="mood" aria-pressed="false" aria-label="Foto"><img src="${img(p.id, 'mood')}" alt=""></button>`;
function showView(v) {
  thumbs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  let ph = media.querySelector('.pdp-photo');
  if (v === 'mood') { if (!ph) { ph = document.createElement('div'); ph.className = 'pdp-photo'; ph.innerHTML = `<img src="${img(p.id, 'mood')}" alt="${p.name}">`; media.insertBefore(ph, $('.pdp-media-ui')); } }
  else ph?.remove();
}
thumbs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); });
import('./three/viewer.js').then(({ ProductViewer }) => { viewer = new ProductViewer($('#pdp-3d'), p, ci); })
  .catch(() => { $('#pdp-3d').innerHTML = `<img src="${img(p.id)}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover">`; });

// relacionados: outras linhas primeiro
const rel = PRODUCTS.filter((x) => x.id !== p.id).sort((a, b) => (a.cat === p.cat) - (b.cat === p.cat)).slice(0, 4);
$('#related').innerHTML = rel.map(cardHTML).join('');
