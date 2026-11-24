// Home da VS Imports no formato de loja virtual: avisos, cabeçalho com busca,
// carrossel, categorias, prateleiras com COMPRAR, loja 3D, catálogo e endereço.
import { PRODUCTS, CATEGORIES, SUBCATS, STORE, byId, brl, img, asset } from './data/products.js';
import { initBag, bag } from './ui/bag.js';
import { initAuth } from './ui/auth.js';
import { loadCatalog, LOCAL_CATALOG } from './data/catalog.js';
import { cardHTML, productUrl } from './ui/card.js';
import { shopCardHTML } from './ui/shopcard.js';
import { renderFooter } from './ui/footer.js';
import { mountShopHead, inSub } from './ui/shophead.js';
import { reduceMotion, isMobile } from './three/perf.js';
import { supabase, hasSupabase } from './lib/supabase.js';
import { freeMin as freeMinValue } from './lib/shipping.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wa = (t = 'Olá, VS Imports! Vim pelo site.') => `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(t)}`;

/* ---------------- rolagem travada com janelas abertas ---------------- */
const lockScroll = (on) => { document.documentElement.style.overflow = on ? 'hidden' : ''; };
document.addEventListener('vs-cover', (e) => {
  const open = e.detail || !!document.querySelector('.auth:not([hidden]), .bag:not([hidden])');
  lockScroll(open);
});
const bagUI = initBag({ onOpen: () => lockScroll(true), onClose: () => lockScroll(false) });

let toastT = 0;
function toast(html) {
  const t = $('#toast'); t.innerHTML = html; t.hidden = false;
  requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => (t.hidden = true), 300); }, 2600);
}

/* ---------------- topo da loja (avisos, cabeçalho, mega menu, busca) ---------------- */
let catalog = LOCAL_CATALOG;
const head = mountShopHead({ home: true, getCatalog: () => catalog, onFilter: (cat, sub) => { setFilter(cat, sub); $('#catalogo').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); } });
$('#duo-vip').href = STORE.vipGroup;

/* ---------------- carrossel de banners ---------------- */
{
  const wrap = $('#slides'), slides = $$('.slide', wrap), dots = $('#slider-dots');
  let i = 0, timer = 0;
  dots.innerHTML = slides.map((_, k) => `<button type="button" role="tab" aria-label="Banner ${k + 1}" aria-selected="${!k}"></button>`).join('');
  const go = (k) => {
    i = (k + slides.length) % slides.length;
    wrap.style.transform = `translateX(${-i * 100}%)`;
    if (matchMedia('(max-width: 760px)').matches) wrap.style.height = slides[i].offsetHeight + 'px'; else wrap.style.height = '';
    slides.forEach((s, n) => { s.classList.toggle('on', n === i); s.inert = n !== i; });
    $$('button', dots).forEach((b, n) => b.setAttribute('aria-selected', String(n === i)));
  };
  const auto = () => { clearInterval(timer); if (!reduceMotion) timer = setInterval(() => go(i + 1), 6000); };
  $$('[data-sl]').forEach((b) => b.addEventListener('click', () => { go(i + +b.dataset.sl); auto(); }));
  dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { go($$('button', dots).indexOf(b)); auto(); } });
  // deslizar no celular
  let x0 = null;
  wrap.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; clearInterval(timer); }, { passive: true });
  wrap.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); x0 = null; auto(); });
  $('#slider').addEventListener('pointerenter', () => clearInterval(timer));
  $('#slider').addEventListener('pointerleave', auto);
  go(0); auto();
  addEventListener('resize', () => go(i));
  $('.cover-img')?.addEventListener('load', () => go(i));
}

/* ---------------- capa: slides vivos com as peças reais ---------------- */
function renderHeroLive(list) {
  const real = list.filter((p) => p.photos?.length && p.available);
  if (!real.length) return;
  const pick = (cats, n) => { const out = []; for (const c of cats) { const p = real.find((x) => x.cat === c && !out.includes(x)); if (p) out.push(p); } for (const p of real) { if (out.length >= n) break; if (!out.includes(p)) out.push(p); } return out.slice(0, n); };
  // frete grátis: leque de peças com preço
  const fan = pick(['calcados', 'camisetas', 'bones', 'bermudas', 'polos'], 5);
  $('#ship-fan').innerHTML = fan.map((p, i) => `<figure class="fan-card f${i}" style="--i:${i}"><img src="${p.thumbs[0]}" alt="" loading="lazy" width="480" height="600"><figcaption><span>${esc(p.name)}</span><b>${brl(p.finalPrice)}</b></figcaption></figure>`).join('');
  // 5% OFF: parede de fotos em colunas que deslizam
  const cols = $$('#first-wall .fw-col');
  const pics = real.slice(0, 32);
  cols.forEach((c, k) => { const mine = pics.filter((_, i) => i % cols.length === k); c.innerHTML = [...mine, ...mine].map((p) => `<img src="${p.thumbs[0]}" alt="" loading="lazy" width="400" height="500">`).join(''); });
  // cards: Loja 3D e Grupo VIP
  $('#d2-pecas').textContent = list.length;
  $('#d2-thumbs').innerHTML = pick(['camisetas', 'bermudas', 'calcados', 'bones', 'polos', 'acessorios'], 6).map((p) => `<img src="${p.thumbs[0]}" alt="" loading="lazy" width="80" height="100">`).join('');
  const promos = real.filter((p) => p.compareAt).slice(0, 3);
  const news = real.filter((p) => !p.compareAt).slice(0, 2);
  const msgs = [
    ...promos.map((p) => `<div class="msg"><img src="${p.thumbs[0]}" alt="" loading="lazy" width="200" height="200"><p><b>🔥 Promoção relâmpago</b>${esc(p.name)}<br><s>${brl(p.compareAt)}</s> <strong>${brl(p.finalPrice)}</strong></p><time>agora</time></div>`),
    ...news.map((p) => `<div class="msg"><img src="${p.thumbs[0]}" alt="" loading="lazy" width="200" height="200"><p><b>✨ Chegou reposição</b>${esc(p.name)} · <strong>${brl(p.finalPrice)}</strong></p><time>hoje</time></div>`),
  ];
  $('#vip-chat').innerHTML = msgs.join('');
}
// leque do frete grátis segue o mouse (só com mouse e sem "reduzir movimento")
if (!reduceMotion && matchMedia('(hover: hover)').matches) {
  const st = $('#ship-stage');
  st?.closest('.slide').addEventListener('pointermove', (e) => {
    const r = st.getBoundingClientRect();
    st.style.setProperty('--rx', ((e.clientY - r.top) / r.height - 0.5) * -10 + 'deg');
    st.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 14 + 'deg');
  });
}
freeMinValue().then((v) => $$('[data-free-min]').forEach((b) => (b.textContent = brl(v))));

// animações param quando a seção sai da tela (menos trabalho para o celular)
{
  const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('offscreen', !e.isIntersecting)), { rootMargin: '100px 0px' });
  ['#slider', '.duo2', '.cbanners', '#reels', '.story'].forEach((s) => { const el = $(s); if (el) io.observe(el); });
}

/* ---------------- categorias em círculo ---------------- */
function renderCats(list) {
  const pic = (c) => { const p = list.find((x) => x.cat === c.id && x.photos?.length && x.available) || list.find((x) => x.cat === c.id); return p ? (p.thumbs?.[0] || img(p.id, 'card-sm')) : null; };
  $('#cats').innerHTML = CATEGORIES.filter((c) => list.some((x) => x.cat === c.id)).map((c) => `<li><a href="#catalogo" data-filter="${c.id}"><span class="ci"><img src="${pic(c)}" alt="" loading="lazy" width="480" height="600"></span><b>${c.name}</b></a></li>`).join('')
    + `<li><a href="#loja"><span class="ci ci-3d"><img src="${asset('loja-entrada-m')}" alt="" loading="lazy" width="900" height="1400"></span><b>Loja 3D</b></a></li>`
    + `<li><a href="#catalogo" data-filter="todos"><span class="ci ci-all"><img src="/brand/vs-icon.svg" alt="" width="60" height="60"></span><b>Ver tudo</b></a></li>`;
}

/* ---------------- vídeos do Instagram (links cadastrados no painel) ---------------- */
// cada link vira o player oficial do Instagram, carregado só perto da tela
const igCode = (url) => { const m = String(url).match(/instagram\.com\/(reels?|p|tv)\/([\w-]+)/); return m ? { kind: m[1] === 'p' ? 'p' : 'reel', code: m[2] } : null; };
async function renderReels() {
  const row = $('#reels-row');
  $('#reels-handle').href = STORE.instagramUrl;
  let links = [];
  if (hasSupabase) {
    const { data } = await supabase.from('home_reels').select('url').eq('active', true).order('position').order('id').limit(12);
    links = (data || []).map((r) => igCode(r.url)).filter(Boolean);
  }
  if (links.length) {
    row.innerHTML = links.map((l) => `<li class="reel" data-src="https://www.instagram.com/${l.kind}/${l.code}/embed/"><div class="reel-ph" aria-hidden="true"><span class="reel-play"></span></div></li>`).join('');
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; io.unobserve(e.target);
      e.target.insertAdjacentHTML('beforeend', `<iframe src="${e.target.dataset.src}" title="Vídeo do Instagram da VS Imports" loading="lazy" allowtransparency="true" allow="encrypted-media; autoplay; clipboard-write; picture-in-picture" scrolling="no"></iframe>`);
    }), { rootMargin: '0px 300px 400px 300px' });
    $$('.reel', row).forEach((li) => io.observe(li));
  } else {
    // ainda sem links: cards com fotos reais das peças levando para o perfil + convite
    const real = catalog.filter((p) => p.photos?.length && p.available);
    const picks = real.length ? real.slice(0, 6) : [...PRODUCTS.filter((p) => p.featured), ...PRODUCTS.filter((p) => !p.featured)].slice(0, 6);
    row.innerHTML = picks.map((p) => `<li class="reel reel-empty"><a href="${STORE.instagramUrl}" target="_blank" rel="noopener" aria-label="Ver vídeos de ${esc(p.name)} no Instagram"><img src="${p.thumbs?.[1] || p.thumbs?.[0] || img(p.id, 'mood')}" alt="" loading="lazy" width="900" height="1200"><span class="reel-play" aria-hidden="true"></span><span class="reel-cap">Assista no Instagram</span></a></li>`).join('')
      + `<li class="reel reel-follow"><a href="${STORE.instagramUrl}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor"/></svg><b>Siga @${esc(STORE.instagram)}</b><span>Provador, lançamentos e os looks da semana</span></a></li>`;
  }
  updateArrows(row);
}

/* ---------------- prateleiras (carrossel horizontal) ---------------- */
function fillShelves(list) {
  const featured = list.filter((p) => p.featured), rest = list.filter((p) => !p.featured);
  const avail = (a) => [...a.filter((p) => p.available), ...a.filter((p) => !p.available)];
  const shelves = {
    mais: avail([...featured, ...rest]).slice(0, 12),
    promo: avail(list.filter((p) => p.compareAt)).slice(0, 12),
    novos: avail(list.slice().reverse()).slice(0, 12),
  };
  for (const [k, items] of Object.entries(shelves)) {
    const ul = $(`[data-shelf="${k}"]`); if (!ul) continue;
    ul.innerHTML = items.map(shopCardHTML).join('');
    ul.closest('.shelf').hidden = !items.length;
    updateArrows(ul);
  }
}
// setas das prateleiras
$$('.shelf-wrap').forEach((w) => {
  w.insertAdjacentHTML('beforeend', '<button class="shelf-arrow prev" type="button" aria-label="Anteriores">‹</button><button class="shelf-arrow next" type="button" aria-label="Próximos">›</button>');
  const row = $('.shelf-row', w);
  w.addEventListener('click', (e) => {
    const b = e.target.closest('.shelf-arrow'); if (!b) return;
    row.scrollBy({ left: (b.classList.contains('next') ? 1 : -1) * row.clientWidth * 0.9, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  row.addEventListener('scroll', () => updateArrows(row), { passive: true });
});
function updateArrows(row) {
  const w = row.closest('.shelf-wrap'); if (!w) return;
  const max = row.scrollWidth - row.clientWidth - 2;
  w.querySelector('.prev')?.toggleAttribute('disabled', row.scrollLeft <= 2);
  w.querySelector('.next')?.toggleAttribute('disabled', row.scrollLeft >= max);
}
addEventListener('resize', () => $$('.shelf-row').forEach(updateArrows));

// tamanho + COMPRAR direto do card
document.addEventListener('click', (e) => {
  const sz = e.target.closest('.pcard .sz');
  if (sz) {
    $$('.sz', sz.parentElement).forEach((b) => b.setAttribute('aria-pressed', String(b === sz)));
    sz.closest('.pcard').classList.remove('need-size');
    return;
  }
  const buy = e.target.closest('.pcard [data-buy]');
  if (!buy) return;
  const card = buy.closest('.pcard'), p = catalog.find((x) => x.id === card.dataset.id);
  const picked = $('.sz[aria-pressed="true"]', card);
  const sizes = $$('.sz:not([disabled])', card);
  const size = picked?.dataset.size || (sizes.length === 1 ? sizes[0].dataset.size : '');
  if (!size) { card.classList.add('need-size'); toast('Escolha o <b>tamanho</b> antes de comprar.'); return; }
  const r = bag.add(card.dataset.id, 0, size);
  if (!r.ok) { toast(esc(r.msg)); return; }
  toast(`<b>${esc(p?.name || 'Peça')}</b> (${esc(size)}) na sacola. <button type="button" data-bag-open-t>Ver sacola</button>`);
  buy.classList.add('done'); buy.textContent = 'Adicionado ✓';
  setTimeout(() => { buy.classList.remove('done'); buy.textContent = 'Comprar'; }, 1800);
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-bag-open-t]')) bagUI.open(); });

/* ---------------- loja 3D (carrega perto da tela) ---------------- */
const stage = $('#stage'), tag = $('#tag');
const slot = document.createElement('div'); slot.className = 'stage-slot';
stage.before(slot); slot.appendChild(stage);
let store = null, storeReady = null, inside = false;
const loadStore = () => storeReady ??= (async () => {
  try {
    const { Store3D } = await import('./three/store.js');
    const s3 = new Store3D($('#viewer'), {
      view: 'entrada',
      onView: (v) => $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v))),
      onHover: (it) => showTag(it, false),
      onSelect: (it) => showTag(it, true),
      onOpen: (it) => openProduct(it.pid, it.ci, it),
      onFrame: () => placeTag(),
    });
    store = await s3.ready;
    if (catalog.some((p) => p.photos?.length)) store.attachCatalog(catalog);
    buildStoreList();
    return store;
  } catch (err) {
    console.warn('Loja 3D indisponível:', err);
    $('#viewer').innerHTML = `<img src="${asset('loja-entrada')}" alt="Interior da loja VS Imports" style="width:100%;height:100%;object-fit:cover">`;
    $('#stage-cover').hidden = true;
    return null;
  }
})();
// a loja 3D só monta quando a pessoa chega perto dela (a abertura fica leve)
new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); loadStore(); } }, { rootMargin: '80% 0px' }).observe(slot);

function flip(el, from, to, dur = 560) {
  const sx = from.width / to.width, sy = from.height / to.height;
  el.style.transformOrigin = '0 0';
  el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
  el.getBoundingClientRect();
  el.style.transition = reduceMotion ? 'none' : `transform ${dur}ms cubic-bezier(.16,1,.3,1)`;
  el.style.transform = '';
  setTimeout(() => { el.style.transition = ''; el.style.transformOrigin = ''; }, dur + 30);
}
async function enterStore({ push = true, cam = null } = {}) {
  if (inside) return;
  const s = await loadStore();
  if (!s) return;
  inside = true;
  const from = stage.getBoundingClientRect();
  stage.classList.add('in'); document.body.classList.add('in-store');
  $('#store-backdrop').classList.add('on');
  $('#stage-cover').hidden = true; $('#stage-ui').hidden = false;
  lockScroll(true);
  s.fullscreen = true; s.resize();
  if (cam) s.flyTo(cam.p, cam.t, 0);
  flip(stage, from, stage.getBoundingClientRect());
  if (push) history.pushState({ loja: 1 }, '', '#loja');
  $('#exit').focus({ preventScroll: true });
  setTimeout(() => ($('#hint').style.opacity = 0), 7000);
}
function exitStore({ pop = false } = {}) {
  if (!inside) return;
  inside = false;
  showTag(null);
  const from = stage.getBoundingClientRect();
  stage.classList.remove('in'); document.body.classList.remove('in-store');
  $('#store-backdrop').classList.remove('on');
  $('#stage-cover').hidden = false; $('#stage-ui').hidden = true;
  lockScroll(false);
  if (store) { store.fullscreen = false; store.selected = null; store.setHover(null); store.resize(); store.setView('entrada', 0); }
  flip(stage, from, stage.getBoundingClientRect());
  if (!pop && history.state?.loja) history.back();
  $('#enter').focus({ preventScroll: true });
}
$('#enter').addEventListener('click', () => enterStore());
$('#stage-cover').addEventListener('click', (e) => { if (e.target === e.currentTarget) enterStore(); });
$('#exit').addEventListener('click', () => exitStore());
$('#store-backdrop').addEventListener('click', () => exitStore());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && inside && $('#bag').hidden) exitStore(); });
addEventListener('popstate', () => { if (inside) exitStore({ pop: true }); });

let tagItem = null;
function showTag(it, selected) {
  tagItem = it;
  if (!it || !inside) { tag.hidden = true; tag.classList.remove('sel'); return; }
  const r = it.real;
  if (r) {
    tag.querySelector('img').src = r.thumbs?.[0] || img(r.id, 'card-sm');
    tag.querySelector('b').textContent = r.name;
    tag.querySelector('span').innerHTML = `${r.compareAt ? `<s>${brl(r.compareAt)}</s> ` : ''}<strong>${brl(r.finalPrice)}</strong>${r.available ? '' : ' · esgotado'}${selected || isMobile ? '' : ' · clique para ver'}`;
    tag.querySelector('a').textContent = 'Ver peça';
    tag.querySelector('a').href = productUrl(r.id, '&de=loja');
  } else {
    const c = storeCat(it.pid);
    tag.querySelector('img').src = img(it.pid, 'card-sm');
    tag.querySelector('b').textContent = c.name;
    tag.querySelector('span').textContent = `${catalog.filter((x) => x.cat === c.id).length} peças`;
    tag.querySelector('a').textContent = `Ver ${c.name.toLowerCase()}`;
    tag.querySelector('a').href = '#catalogo';
  }
  tag.classList.toggle('sel', !!selected);
  tag.hidden = false;
  placeTag();
}
function placeTag() {
  if (!tagItem || !store || tag.hidden) return;
  const pt = store.project(tagItem);
  if (!pt) { tag.style.opacity = 0; return; }
  const w = tag.offsetWidth, h = tag.offsetHeight, W = stage.clientWidth;
  const x = Math.max(8, Math.min(W - w - 8, pt.x - w / 2)), y = Math.max(64, pt.y - h - 14);
  tag.style.opacity = 1;
  tag.style.transform = `translate(${x}px, ${y}px)`;
}
tag.querySelector('a').addEventListener('click', (e) => { if (!tagItem) return; e.preventDefault(); openProduct(tagItem.pid, tagItem.ci, tagItem); });
// a loja 3D usa peças ilustrativas: tocar numa peça abre as peças reais daquela linha
const STORE_CAT = { tenis: 'calcados' };
function storeCat(pid) { const id = STORE_CAT[byId(pid)?.cat] || byId(pid)?.cat; return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0]; }
function openProduct(id, ci, it = tagItem) {
  if (it?.real) {
    if (store) sessionStorage.setItem('vs-store-cam', JSON.stringify(store.getCamera()));
    $('#fade').classList.add('on');
    setTimeout(() => { location.href = productUrl(it.real.id, '&de=loja'); }, reduceMotion ? 0 : 320);
    return;
  }
  const c = storeCat(id);
  exitStore();
  setTimeout(() => { setFilter(c.id); $('#catalogo').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); }, 400);
}
addEventListener('pageshow', () => $('#fade').classList.remove('on'));
$$('[data-view]').forEach((b) => b.addEventListener('click', () => { store?.setView(b.dataset.view); showTag(null); }));
$('#zin').addEventListener('click', () => store?.zoom(0.75));
$('#zout').addEventListener('click', () => store?.zoom(1.3));
function buildStoreList() {
  const seen = new Set(); const ul = $('#store-list');
  store.items.forEach((it) => {
    const key = storeCat(it.pid).id; if (seen.has(key)) return; seen.add(key); // um botão por linha
    const p = byId(it.pid);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button"><img src="${img(p.id, 'card-sm')}" alt="">${storeCat(p.id).name}</button>`;
    li.firstChild.addEventListener('click', async () => {
      await enterStore();
      store.selected = it; store.setHover(it); store.focusItem(it, 900); showTag(it, true);
      $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    });
    ul.appendChild(li);
  });
}

/* ---------------- todos os produtos (com filtro) ---------------- */
const grid = $('#grid'), filters = $('#filters');
let currentFilter = 'todos';
filters.innerHTML = [{ id: 'todos', name: 'Todos' }, ...CATEGORIES].map((c, i) => `<button class="chip" data-f="${c.id}" aria-pressed="${!i}">${c.name}</button>`).join('');
let currentSub = '';
function setFilter(id, subId = '') {
  currentFilter = id; currentSub = subId;
  const sub = (SUBCATS[id] || []).find((x) => x.id === subId);
  $$('[data-f]', filters).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === id)));
  $$('.pcard', grid).forEach((c) => { const p = catalog.find((x) => x.id === c.dataset.id); c.hidden = (id !== 'todos' && c.dataset.cat !== id) || (sub && p && !inSub(p, sub)); });
  const cat = CATEGORIES.find((c) => c.id === id);
  $('#cat-t').textContent = sub ? `${cat.name} · ${sub.name}` : cat ? cat.name : 'Todos os produtos';
}
filters.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) setFilter(b.dataset.f); });
function renderAll(list) {
  catalog = list;
  renderCats(list);
  renderHeroLive(list);
  if ($('#reels-row .reel-empty')) renderReels();
  filters.innerHTML = [{ id: 'todos', name: 'Todos' }, ...CATEGORIES.filter((c) => list.some((x) => x.cat === c.id))].map((c) => `<button class="chip" data-f="${c.id}" aria-pressed="${c.id === currentFilter}">${c.name}</button>`).join('');
  grid.innerHTML = list.map(shopCardHTML).join('');
  setFilter(currentFilter, currentSub);
  fillShelves(list);
  head.refresh(list);
  if (store && list.some((p) => p.photos?.length)) store.attachCatalog(list);
}
// com banco: mostra esqueletos até o catálogo real chegar (sem piscar peças de demonstração)
if (hasSupabase) { const sk = '<li class="pcard sk"><div class="pc-ph"></div><div class="pc-body"><i></i><i></i></div></li>'.repeat(6); $$('[data-shelf], #grid').forEach((u) => (u.innerHTML = sk)); } else renderAll(LOCAL_CATALOG);
renderReels();
// link vindo de outra página: ./?cat=camisetas&sub=lacoste#catalogo
{ const q = new URLSearchParams(location.search); if (q.get('cat')) { currentFilter = q.get('cat'); currentSub = q.get('sub') || ''; } }
// catálogo vivo do banco: preços, promoções, fotos, esgotados e peças novas
loadCatalog().then(renderAll);
initAuth();

/* ---------------- endereço + mapa ---------------- */
const place = STORE.address ? `${STORE.address}, ${STORE.city}` : STORE.city;
const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
$('#visit-info').innerHTML = [
  ['Endereço', STORE.address ? `${STORE.address}<br>${STORE.city}` : `${STORE.city}<br><span class="soon">Endereço exato em breve</span>`],
  ['Horário', STORE.hours],
  ['Atendimento', `<a href="${wa()}" target="_blank" rel="noopener">WhatsApp</a> · <a href="${STORE.instagramUrl}" target="_blank" rel="noopener">@${STORE.instagram}</a> · <a href="${STORE.tiktokUrl}" target="_blank" rel="noopener">TikTok</a> · <a href="${STORE.vipGroup}" target="_blank" rel="noopener">Grupo VIP</a>`],
  ['Retirada', 'Compre aqui e retire na loja no mesmo dia.'],
].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
new IntersectionObserver(([e], io) => {
  if (!e.isIntersecting) return; io.disconnect();
  $('#map iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(place)}&z=${STORE.address ? 17 : 14}&output=embed`;
}, { rootMargin: '60% 0px' }).observe($('#map'));
$('#map-cap').innerHTML = `<span>${STORE.address ? 'Como chegar' : 'Região da loja'}</span><a class="pill sm" href="${mapUrl}" target="_blank" rel="noopener">Abrir no Google Maps</a>`;

renderFooter();

// voltando da página do produto para #loja: reabre a loja onde estava
addEventListener('load', () => {
  const saved = JSON.parse(sessionStorage.getItem('vs-store-cam') || 'null');
  if (saved && location.hash === '#loja') { sessionStorage.removeItem('vs-store-cam'); $('#loja').scrollIntoView(); enterStore({ push: false, cam: saved }); }
});
