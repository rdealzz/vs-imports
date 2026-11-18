// Sacola simples guardada no navegador. Finaliza pelo WhatsApp da loja.
import { byId, brl, img, STORE } from '../data/products.js';

const KEY = 'vs-bag-v1';
let items = [];
try { items = JSON.parse(localStorage.getItem(KEY) || '[]').filter((i) => byId(i.id)); } catch { items = []; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} };
const listeners = new Set();

export const bag = {
  get items() { return items; },
  add(id, ci = 0, size = '') {
    const ex = items.find((i) => i.id === id && i.ci === ci && i.size === size);
    if (ex) ex.qty++; else items.push({ id, ci, size, qty: 1 });
    save(); emit();
  },
  remove(idx) { items.splice(idx, 1); save(); emit(); },
  total() { return items.reduce((s, i) => s + byId(i.id).price * i.qty, 0); },
  count() { return items.reduce((s, i) => s + i.qty, 0); },
  on(fn) { listeners.add(fn); },
};
function emit() { listeners.forEach((f) => f()); render(); }

function whatsappLink() {
  const lines = items.map((i) => { const p = byId(i.id); return `• ${i.qty}x ${p.name} (${p.colors[i.ci].n}${i.size ? ', ' + i.size : ''}) ${brl(p.price * i.qty)}`; });
  const msg = `Olá, VS Imports! Quero fechar este pedido:\n${lines.join('\n')}\nTotal: ${brl(bag.total())}`;
  return `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(msg)}`;
}

let el;
function render() {
  document.querySelectorAll('[data-bag-count]').forEach((b) => (b.textContent = bag.count()));
  if (!el) return;
  const list = el.querySelector('#bag-list');
  list.innerHTML = items.length ? items.map((i, k) => {
    const p = byId(i.id);
    return `<li><img src="${img(p.id, i.ci ? 'card-' + i.ci : 'card')}" alt=""><div><b>${p.name}</b><span>${p.colors[i.ci].n}${i.size ? ' · ' + i.size : ''} · ${i.qty}x</span></div><div><span>${brl(p.price * i.qty)}</span><br><button data-rm="${k}">Remover</button></div></li>`;
  }).join('') : '<li class="bag-empty">Sua sacola está vazia.</li>';
  el.querySelector('#bag-total').textContent = brl(bag.total());
  const w = el.querySelector('#bag-whats');
  w.href = items.length ? whatsappLink() : '#';
  w.toggleAttribute('aria-disabled', !items.length);
}

export function initBag({ onOpen, onClose } = {}) {
  el = document.getElementById('bag');
  let lastFocus;
  const open = () => { lastFocus = document.activeElement; el.hidden = false; render(); onOpen?.(); el.querySelector('[data-bag-close]').focus(); };
  const close = () => { el.hidden = true; onClose?.(); lastFocus?.focus?.(); };
  document.querySelectorAll('[data-bag-open]').forEach((b) => b.addEventListener('click', open));
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-bag-close]')) close();
    const rm = e.target.closest('[data-rm]'); if (rm) bag.remove(+rm.dataset.rm);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
  render();
  return { open, close };
}
