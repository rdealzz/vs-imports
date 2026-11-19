import { CATEGORIES, STORE, brl, installments, img } from './data/products.js';
import { loadCatalog, LOCAL_CATALOG, variantStock, colorAvailable, discountPct } from './data/catalog.js';
import { initBag, bag } from './ui/bag.js';
import { initAuth } from './ui/auth.js';
import { cardHTML, priceHTML } from './ui/card.js';
import { renderFooter } from './ui/footer.js';
import { initHeader } from './ui/header.js';
import { mountCalc } from './lib/shipping.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
renderFooter(undefined, { home: './' });
initHeader();
initAuth();
initBag();

let catalog = LOCAL_CATALOG, p = null, ci = 0, size = '', viewer = null;

function render() {
  p = catalog.find((x) => x.id === qs.get('id')) || catalog[0];
  ci = Math.min(+(qs.get('cor') || 0), p.colors.length - 1);
  // começa numa cor que tenha estoque
  if (!colorAvailable(p, p.colors[ci].n)) { const k = p.colors.findIndex((c) => colorAvailable(p, c.n)); if (k >= 0) ci = k; }
  size = p.sizes.length === 1 ? p.sizes[0] : '';
  document.title = `${p.name} | VS Imports`;
  const cat = CATEGORIES.find((c) => c.id === p.cat) || { name: p.cat };
  $('#crumb').innerHTML = `<a href="./#catalogo">Catálogo</a> / ${cat.name}`;
  $('#name').textContent = p.name;
  const pct = discountPct(p);
  $('#price').innerHTML = priceHTML(p) + (pct ? ` <span class="badge sale inline">-${pct}%</span>` : '');
  $('#inst').textContent = installments(p.finalPrice) + (p.compareAt && p.promoUntil ? ` · promoção até ${new Date(p.promoUntil).toLocaleDateString('pt-BR')}` : '');
  $('#desc').textContent = p.desc;
  if (qs.get('de') !== 'loja') $('#back').textContent = '← Ver na loja 3D';
  renderColors(); renderSizes(); renderThumbs(); updateBuy();
}

function renderColors() {
  const colors = $('#colors');
  colors.innerHTML = p.colors.map((c, i) => `<button type="button" style="background:${hex(c.c)}" aria-label="${c.n}${colorAvailable(p, c.n) ? '' : ' (esgotado)'}" aria-pressed="${i === ci}" data-i="${i}" class="${colorAvailable(p, c.n) ? '' : 'out'}"></button>`).join('');
  $('#color-name').textContent = p.colors[ci].n + (colorAvailable(p, p.colors[ci].n) ? '' : ' · esgotado');
}
function renderSizes() {
  const sizes = $('#sizes'), color = p.colors[ci].n;
  sizes.innerHTML = p.sizes.map((s) => {
    const st = variantStock(p, color, s);
    const out = st === 0;
    if (out && size === s) size = '';
    return `<button type="button" aria-pressed="${s === size}" ${out ? 'disabled aria-label="' + s + ' esgotado"' : ''} data-s="${s}">${s}${st != null && st > 0 && st <= 2 ? `<small>últimas ${st}</small>` : ''}</button>`;
  }).join('');
}
function renderThumbs() {
  const thumbs = $('#thumbs');
  const pics = p.photos?.length ? p.photos : (p.hasLocalImages !== false ? [img(p.id, 'mood')] : []);
  thumbs.innerHTML = `<button type="button" data-v="3d" aria-pressed="true" aria-label="Modelo 3D"><img src="${p.photos?.[0] || img(p.id)}" alt=""><span class="tag3d">3D</span></button>` +
    pics.map((src, k) => `<button type="button" data-v="${k}" aria-pressed="false" aria-label="Foto ${k + 1}"><img src="${src}" alt=""></button>`).join('');
  thumbs.dataset.pics = JSON.stringify(pics);
}
function updateBuy() {
  const color = p.colors[ci].n;
  const anyAvail = p.sizes.some((s) => variantStock(p, color, s) !== 0);
  const add = $('#add');
  add.disabled = !p.available || !anyAvail;
  add.textContent = !p.available ? 'Esgotado' : !anyAvail ? 'Esgotado nessa cor' : 'Adicionar à sacola';
  const msg = `Olá, VS Imports! Tenho interesse em: ${p.name} (${color}${size ? ', tamanho ' + size : ''}) ${brl(p.finalPrice)}`;
  $('#whats').href = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(msg)}`;
}

$('#colors').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  ci = +b.dataset.i; renderColors(); renderSizes(); updateBuy();
  viewer?.setProduct(p, ci); showView('3d');
  const u = new URL(location.href); u.searchParams.set('cor', ci); history.replaceState(null, '', u);
});
$('#sizes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  size = b.dataset.s; $('#sizes').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('#msg').textContent = ''; updateBuy();
});
$('#add').addEventListener('click', () => {
  if (!size) { $('#msg').textContent = 'Escolha um tamanho.'; $('#sizes').querySelector('button:not(:disabled)')?.focus(); return; }
  const r = bag.add(p.id, ci, size);
  $('#msg').textContent = r.ok ? `${p.name} na sacola.` : r.msg;
});

const media = $('.pdp-media');
function showView(v) {
  const thumbs = $('#thumbs');
  thumbs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  let ph = media.querySelector('.pdp-photo');
  if (v !== '3d') {
    const src = JSON.parse(thumbs.dataset.pics || '[]')[+v];
    if (!ph) { ph = document.createElement('div'); ph.className = 'pdp-photo'; media.insertBefore(ph, $('.pdp-media-ui')); }
    ph.innerHTML = `<img src="${src}" alt="${p.name}, foto ${+v + 1}" decoding="async">`;
  } else ph?.remove();
}
$('#thumbs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); });

function related() {
  const rel = catalog.filter((x) => x.id !== p.id).sort((a, b) => (a.cat === p.cat) - (b.cat === p.cat)).slice(0, 4);
  $('#related').innerHTML = rel.map(cardHTML).join('');
}

render(); related();
mountCalc($('#ship'), () => bag.subtotal() + p.finalPrice);
import('./three/viewer.js').then(({ ProductViewer }) => { viewer = new ProductViewer($('#pdp-3d'), p, ci); })
  .catch(() => { $('#pdp-3d').innerHTML = `<img src="${img(p.id)}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover">`; });
// dados vivos do banco (preço, promoção, fotos, estoque)
loadCatalog().then((list) => {
  catalog = list;
  const keep = size;
  render(); related();
  if (keep && p.sizes.includes(keep) && variantStock(p, p.colors[ci].n, keep) !== 0) { size = keep; renderSizes(); updateBuy(); }
  viewer?.setProduct(p, ci);
  // abre na primeira foto real, se houver
  if (p.photos?.length) showView('0');
});
