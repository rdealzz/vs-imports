// Sacola: fica no navegador até finalizar. O pedido é criado no banco
// (place_order), que calcula preço, promoção, estoque e os 5% da 1ª compra.
import { brl, img } from '../data/products.js';
import { loadCatalog, variantStock } from '../data/catalog.js';
import { supabase, hasSupabase } from '../lib/supabase.js';
import { auth } from './auth.js';

const KEY = 'vs-bag-v2';
let items = [];
try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { items = []; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} };
let catalog = [];
const find = (id) => catalog.find((p) => p.id === id);
let eligible = false;
let doneHTML = '';

export const bag = {
  get items() { return items; },
  // ci = índice da cor; guarda também o nome da cor (é o que o banco usa na variante)
  add(id, ci = 0, size = '') {
    const p = find(id);
    const color = p?.colors[ci]?.n || '';
    const ex = items.find((i) => i.id === id && i.ci === ci && i.size === size);
    const inBag = ex ? ex.qty : 0;
    const st = p ? variantStock(p, color, size) : null;
    if (st != null && inBag + 1 > st) return { ok: false, msg: st ? `Só temos ${st} em estoque.` : 'Esgotado nessa cor e tamanho.' };
    if (ex) ex.qty++; else items.push({ id, ci, color, size, qty: 1 });
    doneHTML = ''; save(); render(); return { ok: true };
  },
  setQty(idx, q) { if (q < 1) items.splice(idx, 1); else items[idx].qty = Math.min(q, 20); save(); render(); },
  clear() { items = []; save(); render(); },
  subtotal() { return items.reduce((s, i) => s + (find(i.id)?.finalPrice ?? 0) * i.qty, 0); },
  count() { return items.reduce((s, i) => s + i.qty, 0); },
};

async function refreshEligibility() {
  eligible = false;
  if (hasSupabase && auth.user) { const { data } = await supabase.rpc('first_purchase_eligible'); eligible = !!data; }
  render();
}

let el;
function render() {
  document.querySelectorAll('[data-bag-count]').forEach((b) => (b.textContent = bag.count()));
  if (!el) return;
  items = items.filter((i) => find(i.id) || !catalog.length);
  const list = el.querySelector('#bag-list');
  // agrupa a mesma peça (cores/tamanhos diferentes) sob um título
  const groups = new Map();
  items.forEach((i, k) => { if (!groups.has(i.id)) groups.set(i.id, []); groups.get(i.id).push([i, k]); });
  list.innerHTML = items.length ? [...groups].map(([id, rows]) => {
    const p = find(id); if (!p) return '';
    const pic = p.photos?.[0] || img(p.id, rows[0][0].ci ? 'card-' + rows[0][0].ci : 'card');
    return `<li class="bag-group"><img src="${pic}" alt=""><div class="bag-g">
      <b>${p.name}</b><span class="bag-unit">${brl(p.finalPrice)} cada</span>
      ${rows.map(([i, k]) => `<div class="bag-row"><span>${i.color || ''}${i.size ? ' · ' + i.size : ''}</span>
        <span class="qty"><button type="button" data-q="${k}" data-d="-1" aria-label="Menos">−</button><b>${i.qty}</b><button type="button" data-q="${k}" data-d="1" aria-label="Mais">+</button></span>
        <span>${brl(p.finalPrice * i.qty)}</span></div>`).join('')}
    </div></li>`;
  }).join('') : doneHTML || '<li class="bag-empty">Sua sacola está vazia.</li>';
  const sub = bag.subtotal();
  const disc = eligible ? Math.round(sub * 5) / 100 : 0;
  el.querySelector('#bag-total').textContent = brl(sub - disc);
  el.querySelector('#bag-sub').innerHTML = !items.length ? '' :
    eligible ? `<span>Subtotal ${brl(sub)}</span><span class="gold">Primeira compra −5% (${brl(disc)})</span>`
    : auth.user ? `<span>Subtotal ${brl(sub)}</span>` : `<span>Subtotal ${brl(sub)}</span><button class="link" type="button" data-login>Entre ou crie sua conta e ganhe 5% na 1ª compra</button>`;
  const go = el.querySelector('#bag-go');
  go.disabled = !items.length;
  go.textContent = 'Finalizar compra';
}

// finalizar: vai para a página única de checkout (conta, entrega, pagamento)
function checkout() {
  if (!items.length) return;
  location.href = `${import.meta.env.BASE_URL}checkout.html`;
}

async function catalogReload(fresh = false) { catalog = await loadCatalog({ fresh }); render(); }

export function initBag({ onOpen, onClose } = {}) {
  el = document.getElementById('bag');
  const foot = el.querySelector('.bag-panel > footer');
  foot.innerHTML = `
    <div class="bag-sub" id="bag-sub"></div>
    <div class="bag-total"><span>Total</span><b id="bag-total">R$ 0,00</b></div>
    <p class="bag-ship">Entregamos para todo o Brasil ou retire na loja no mesmo dia.</p>
    <button class="pill solid block" id="bag-go" type="button">Finalizar pedido</button>
    <p class="small" id="bag-msg" role="status" aria-live="polite"></p>`;
  let lastFocus;
  const open = () => { lastFocus = document.activeElement; document.dispatchEvent(new CustomEvent('vs-cover', { detail: true })); el.hidden = false; render(); onOpen?.(); el.querySelector('[data-bag-close]').focus(); };
  const close = () => { el.hidden = true; document.dispatchEvent(new CustomEvent('vs-cover', { detail: false })); onClose?.(); lastFocus?.focus?.(); };
  document.querySelectorAll('[data-bag-open]').forEach((b) => b.addEventListener('click', open));
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-bag-close]')) close();
    const q = e.target.closest('[data-q]');
    if (q) { const k = +q.dataset.q, i = items[k]; if (+q.dataset.d > 0) { const p = find(i.id); const st = p ? variantStock(p, i.color, i.size) : null; if (st != null && i.qty + 1 > st) { el.querySelector('#bag-msg').textContent = `Só temos ${st} em estoque.`; return; } } bag.setQty(k, i.qty + +q.dataset.d); }
    if (e.target.closest('#bag-go')) checkout();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
  auth.on(() => refreshEligibility());
  catalogReload();
  return { open, close };
}
