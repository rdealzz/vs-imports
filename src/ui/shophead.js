// Topo da loja, igual em todas as páginas: barra de avisos, cabeçalho
// (busca, logo, conta, sacola), menu com "Produtos" em mega menu separado
// por marca/tipo, gaveta do celular e busca ao vivo no catálogo.
import { CATEGORIES, SUBCATS, STORE, brl, img } from '../data/products.js';
import { productUrl } from './card.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// a peça pertence à subcategoria? (palavras-chave no nome)
export const inSub = (p, sub) => !sub || sub.kw.some((k) => norm(p.name).includes(k));
const ICON = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
};

/**
 * home: true na página inicial (links de categoria filtram ali mesmo);
 * nas outras páginas os links levam para ./?cat=...&sub=...#catalogo
 */
export function mountShopHead({ home = false, getCatalog = () => [], onFilter = null } = {}) {
  const base = import.meta.env.BASE_URL;
  const catHref = (cat, sub) => home ? '#catalogo' : `${base}?cat=${cat}${sub ? '&sub=' + sub : ''}#catalogo`;
  const page = (p) => `${base}${p}`;
  const groups = (list) => CATEGORIES.map((c) => {
    const subs = (SUBCATS[c.id] || []).filter((s) => !list.length || list.some((p) => p.cat === c.id && inSub(p, s)));
    if (list.length && !list.some((p) => p.cat === c.id)) return '';
    return `<div class="mm-group"><a class="mm-h" href="${catHref(c.id)}" data-filter="${c.id}">${c.name}</a>${subs.map((s) => `<a href="${catHref(c.id, s.id)}" data-filter="${c.id}" data-sub="${s.id}">${s.name}</a>`).join('')}</div>`;
  }).join('');

  document.body.insertAdjacentHTML('afterbegin', `
<div class="adbar" role="region" aria-label="Avisos da loja">
  <button class="adbar-arrow" type="button" data-ad="-1" aria-label="Aviso anterior">‹</button>
  <ul class="adbar-list" id="adbar">
    <li class="on">Frete grátis acima de <b>R$ 349,90</b></li>
    <li><b>5% OFF</b> na primeira compra pelo site</li>
    <li>Cartão em até <b>3x sem juros</b> · Pix</li>
    <li>Retire no <b>mesmo dia</b> no Capão Raso</li>
  </ul>
  <button class="adbar-arrow" type="button" data-ad="1" aria-label="Próximo aviso">›</button>
</div>
<header class="site-head shop-head" id="top" data-head="dark">
  <div class="sh-row">
    <div class="sh-left">
      <button class="sh-icon sh-menu" type="button" id="menu-open" aria-label="Abrir menu" aria-expanded="false" aria-controls="drawer">${ICON.menu}</button>
      <button class="sh-icon" type="button" id="search-open" aria-label="Buscar produtos" aria-expanded="false" aria-controls="search">${ICON.search}</button>
    </div>
    <a class="sh-logo" href="${base}" aria-label="VS Imports, início"><img src="${base}brand/vs-logo.svg" alt="VS Imports" width="64" height="64"></a>
    <div class="sh-right">
      <button class="bag-btn sh-bag" type="button" data-bag-open aria-label="Abrir sacola">${ICON.bag}<b data-bag-count>0</b></button>
    </div>
  </div>
  <nav class="sh-nav site-nav" aria-label="Principal">
    <a href="${base}">Início</a>
    <div class="sh-drop">
      <a href="${catHref('todos')}" class="sh-drop-btn" aria-haspopup="true" aria-expanded="false">Produtos ${ICON.down}</a>
      <div class="sh-drop-panel mega" id="mega">${groups([])}</div>
    </div>
    <a href="${home ? '#loja' : page('#loja')}">Loja 3D</a>
    <a href="${page('rastreio.html')}">Rastreie o seu pedido</a>
    <a href="${page('perguntas-frequentes.html')}">Perguntas frequentes</a>
    <a href="${page('quem-somos.html')}">Quem somos nós?</a>
  </nav>
  <div class="sh-search" id="search" hidden>
    <form class="sh-search-form" role="search" onsubmit="return false">${ICON.search}
      <input id="search-q" type="search" placeholder="O que você está buscando?" autocomplete="off" aria-label="Buscar produtos">
      <button class="sh-icon" type="button" id="search-close" aria-label="Fechar busca">×</button>
    </form>
    <ul class="sh-results" id="search-results"></ul>
  </div>
</header>
<div class="drawer" id="drawer" hidden>
  <nav class="drawer-panel" aria-label="Menu">
    <div class="drawer-top"><img src="${base}brand/vs-logo.svg" alt="" width="48" height="48"><button class="sh-icon" type="button" id="menu-close" aria-label="Fechar menu">×</button></div>
    <a href="${base}">Início</a>
    <p class="drawer-h">Produtos</p>
    <div id="drawer-cats"></div>
    <a href="${home ? '#loja' : page('#loja')}">Loja 3D</a>
    <a href="${page('rastreio.html')}">Rastreie o seu pedido</a>
    <a href="${page('perguntas-frequentes.html')}">Perguntas frequentes</a>
    <a href="${page('quem-somos.html')}">Quem somos nós?</a>
    <a href="https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent('Olá, VS Imports! Quero tirar uma dúvida.')}" target="_blank" rel="noopener">WhatsApp</a>
  </nav>
</div>`);
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const lock = (on) => { document.documentElement.style.overflow = on ? 'hidden' : ''; };

  // gaveta: categorias com subcategorias que abrem e fecham
  const drawerCats = (list) => CATEGORIES.filter((c) => !list.length || list.some((p) => p.cat === c.id)).map((c) => {
    const subs = (SUBCATS[c.id] || []).filter((s) => !list.length || list.some((p) => p.cat === c.id && inSub(p, s)));
    return subs.length
      ? `<details class="dr-cat"><summary>${c.name}</summary><a href="${catHref(c.id)}" data-filter="${c.id}">Ver tudo em ${c.name.toLowerCase()}</a>${subs.map((s) => `<a href="${catHref(c.id, s.id)}" data-filter="${c.id}" data-sub="${s.id}">${s.name}</a>`).join('')}</details>`
      : `<a class="dr-single" href="${catHref(c.id)}" data-filter="${c.id}">${c.name}</a>`;
  }).join('');
  $('#drawer-cats').innerHTML = drawerCats([]);

  // barra de avisos
  {
    const items = $$('#adbar li'); let i = 0, timer = 0;
    const show = (k) => { i = (k + items.length) % items.length; items.forEach((li, n) => li.classList.toggle('on', n === i)); };
    const auto = () => { clearInterval(timer); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => show(i + 1), 4200); };
    $$('[data-ad]').forEach((b) => b.addEventListener('click', () => { show(i + +b.dataset.ad); auto(); }));
    auto();
  }
  // mega menu "Produtos": hover no mouse, clique no toque/teclado
  {
    const drop = $('.sh-drop'), btn = $('.sh-drop-btn');
    const set = (on) => { drop.classList.toggle('open', on); btn.setAttribute('aria-expanded', String(on)); };
    drop.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') set(true); });
    drop.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') set(false); });
    btn.addEventListener('click', (e) => { if (matchMedia('(hover: none)').matches || e.detail === 0) { e.preventDefault(); set(!drop.classList.contains('open')); } });
    drop.addEventListener('focusout', (e) => { if (!drop.contains(e.relatedTarget)) set(false); });
    drop.addEventListener('click', (e) => { if (e.target.closest('.mega a')) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  }
  // gaveta do celular
  {
    const d = $('#drawer'), ob = $('#menu-open');
    const set = (on) => {
      if (on) { d.hidden = false; requestAnimationFrame(() => d.classList.add('on')); lock(true); $('#menu-close').focus(); }
      else { d.classList.remove('on'); lock(false); setTimeout(() => (d.hidden = true), 280); ob.focus({ preventScroll: true }); }
      ob.setAttribute('aria-expanded', String(on));
    };
    ob.addEventListener('click', () => set(true));
    $('#menu-close').addEventListener('click', () => set(false));
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('a')) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) set(false); });
  }
  // busca ao vivo
  {
    const box = $('#search'), q = $('#search-q'), out = $('#search-results'), ob = $('#search-open');
    const set = (on) => { box.hidden = !on; ob.setAttribute('aria-expanded', String(on)); if (on) q.focus(); else { q.value = ''; out.innerHTML = ''; } };
    ob.addEventListener('click', () => set(box.hidden));
    $('#search-close').addEventListener('click', () => set(false));
    q.addEventListener('input', () => {
      const t = norm(q.value.trim());
      if (!t) { out.innerHTML = ''; return; }
      const cat = (p) => CATEGORIES.find((c) => c.id === p.cat)?.name || '';
      const hits = getCatalog().filter((p) => norm(`${p.name} ${cat(p)}`).includes(t)).slice(0, 8);
      out.innerHTML = hits.length ? hits.map((p) => `<li><a href="${base}${productUrl(p.id)}"><img src="${p.photos?.[0] || img(p.id, 'card-sm')}" alt="" width="48" height="60"><span>${esc(p.name)}<small>${cat(p)}</small></span><b>${brl(p.finalPrice)}</b></a></li>`).join('')
        : `<li class="none">Nada encontrado para “${esc(q.value.trim())}”. <a href="https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(`Olá! Vocês têm ${q.value.trim()}?`)}" target="_blank" rel="noopener">Pergunte no WhatsApp</a></li>`;
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) set(false); });
  }
  // encolhe ao rolar
  { const head = $('.shop-head'); const on = () => head.classList.toggle('scrolled', scrollY > 40); addEventListener('scroll', on, { passive: true }); on(); }
  // na home, os links de categoria filtram ali mesmo
  if (home && onFilter) document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-filter]'); if (!a) return;
    e.preventDefault(); onFilter(a.dataset.filter, a.dataset.sub || '');
  });

  // quando o catálogo real chega: menus só com as linhas/marcas que têm peças
  return {
    refresh(list) { $('#mega').innerHTML = groups(list); $('#drawer-cats').innerHTML = drawerCats(list); },
  };
}
