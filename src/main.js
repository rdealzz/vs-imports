import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { PRODUCTS, CATEGORIES, STORE, byId, brl, img, asset } from './data/products.js';
import { initBag } from './ui/bag.js';
import { initAuth } from './ui/auth.js';
import { loadCatalog, LOCAL_CATALOG } from './data/catalog.js';
import { cardHTML, productUrl } from './ui/card.js';
import { renderFooter } from './ui/footer.js';
import { reduceMotion, isMobile } from './three/perf.js';

gsap.registerPlugin(ScrollTrigger);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------- rolagem suave (só mouse/trackpad; toque é nativo) ---------------- */
let lenis = null;
if (!reduceMotion) {
  lenis = new Lenis({ lerp: 0.11, smoothWheel: true, anchors: { offset: -64 } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const lockScroll = (on) => { if (lenis) on ? lenis.stop() : lenis.start(); document.documentElement.style.overflow = on ? 'hidden' : ''; };
// login/criar conta e sacola abertos: o fundo fica parado (não rola atrás da janela)
document.addEventListener('vs-cover', (e) => {
  const open = e.detail || !!document.querySelector('.auth:not([hidden]), .bag:not([hidden])') || document.body.classList.contains('in-store');
  lockScroll(open);
});

const bagUI = initBag({ onOpen: () => lockScroll(true), onClose: () => lockScroll(false) });

/* ---------------- cabeçalho ---------------- */
const head = $('.site-head');
let lastY = 0;
const onScroll = () => {
  const y = scrollY;
  head.classList.toggle('solid', y > 8);
  head.classList.toggle('on-dark', y < innerHeight * 0.9); // sobre a fachada escura
  head.classList.toggle('hide', y > innerHeight * 1.2 && y > lastY + 2 && !document.documentElement.style.overflow);
  if (y < lastY - 2) head.classList.remove('hide');
  lastY = y;
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------------- 1. capa ---------------- */
document.body.classList.add('ready');
$('#sign-hours').textContent = `Aberto ${STORE.hours.replace('Seg a sáb', 'de segunda a sábado').replace(/(\d+)h às (\d+)h/, 'das $1h às $2h')}`;
// luz quente saindo de trás do letreiro (leve; sem WebGL2 fica só o letreiro)
import('./fx/heroRays.js')
  .then(({ HeroRays }) => new HeroRays($('#abertura'), $('.sign-rays'), $('.sign-logo img')))
  .catch((err) => { console.warn('Luz da capa indisponível:', err); $('.sign-rays')?.remove(); });

/* ---------------- 2. anel de peças ---------------- */
const orbit = $('.ring-orbit');
const tileProducts = PRODUCTS.slice(0, 10);
const tiles = tileProducts.map((p, i) => {
  const t = document.createElement('div');
  t.className = 'tile';
  t.innerHTML = `<img src="${img(p.id, 'card-sm')}" alt="" decoding="async" width="480" height="600">`;
  orbit.appendChild(t);
  return { el: t, a: (i / tileProducts.length) * Math.PI * 2 };
});
const ringState = { spin: 0, spread: 1, scale: 1, fade: 1 };
let ringVisible = false;
new IntersectionObserver(([e]) => (ringVisible = e.isIntersecting)).observe($('.ring-pin'));
const drawRing = () => {
  const R = 0.38 * ringState.spread; // fração do tamanho do anel
  tiles.forEach((t, i) => {
    const a = t.a + ringState.spin;
    const x = Math.cos(a) * R * 100 / 0.15, y = Math.sin(a) * R * 100 / 0.15; // em % do próprio tile
    t.el.style.transform = `translate3d(${x.toFixed(1)}%, ${y.toFixed(1)}%, 0) rotate(${(45 + Math.sin(a * 2 + i) * 8).toFixed(1)}deg) scale(${ringState.scale.toFixed(3)})`;
    if (t.op !== ringState.fade) { t.el.style.opacity = ringState.fade; t.op = ringState.fade; }
  });
};
drawRing();
if (!reduceMotion) gsap.ticker.add((_, dt) => { if (!ringVisible) return; ringState.spin += dt * 0.00012; drawRing(); });

const mm = gsap.matchMedia();
mm.add('(prefers-reduced-motion: no-preference)', () => {
  const tl = gsap.timeline({
    scrollTrigger: { trigger: '.ring-pin', start: 'top top', end: '+=180%', pin: true, scrub: 0.6, anticipatePin: 1 },
  });
  tl.to(ringState, { spread: 2.4, scale: 1.4, fade: 0, ease: 'power2.in', duration: 0.5, onUpdate: drawRing }, 0)
    .to('.ring-center', { y: '-28vh', scale: 0.6, opacity: 0, ease: 'power2.in', duration: 0.45 }, 0)
    .to('.ring-text, .ring-side', { opacity: 0, y: -30, duration: 0.25 }, 0.05)
    .set('.ring-expand', { visibility: 'visible' }, 0.22)
    .fromTo('.ring-expand', { clipPath: 'polygon(46% 44%, 54% 42%, 54% 56%, 46% 58%)' }, { clipPath: 'polygon(14% 8%, 92% 0%, 86% 92%, 6% 100%)', ease: 'power2.inOut', duration: 0.35 }, 0.22)
    .to('.ring-expand', { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', ease: 'power2.out', duration: 0.2 }, 0.57)
    .fromTo('.ring-expand img', { scale: 1.35 }, { scale: 1, ease: 'none', duration: 0.6 }, 0.22)
    .fromTo('.expand-copy', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.18 }, 0.66)
    .to({}, { duration: 0.16 });
});
mm.add('(prefers-reduced-motion: reduce)', () => { gsap.set('.ring-expand', { visibility: 'visible', clipPath: 'none', position: 'relative', height: '70svh' }); });

/* ---------------- 3. loja 3D (carrega perto da tela) ----------------
   Fora: imagem viva da loja, sem capturar gestos (a página rola livre).
   "Entrar na loja": o palco cresce sobre a página (fundo desfocado),
   o scroll trava e todos os gestos passam a controlar a câmera.          */
const stage = $('#stage'), tag = $('#tag');
const slot = document.createElement('div'); slot.className = 'stage-slot';
stage.before(slot); slot.appendChild(stage);
let store = null, storeReady = null, inside = false;
const loadStore = () => storeReady ??= (async () => {
  try {
    const { Store3D } = await import('./three/store.js');
    store = new Store3D($('#viewer'), {
      view: 'entrada',
      onView: (v) => $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v))),
      onHover: (it) => showTag(it, false),
      onSelect: (it) => showTag(it, true),
      onOpen: (it) => openProduct(it.pid, it.ci),
      onFrame: () => placeTag(),
    });
    buildStoreList();
    return store;
  } catch (err) {
    console.warn('Loja 3D indisponível:', err);
    $('#viewer').innerHTML = `<img src="${asset('loja-entrada')}" alt="Interior da loja VS Imports" style="width:100%;height:100%;object-fit:cover">`;
    $('#stage-cover').hidden = true;
    return null;
  }
})();
new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); loadStore(); } }, { rootMargin: '150% 0px' }).observe(slot);
const idle = (fn, t = 1500) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: t + 2000 }) : setTimeout(fn, t));
// o 3D pesado monta no tempo ocioso depois de carregar, mas nunca com uma
// janela aberta (login, sacola): se houver, espera fechar
let lastInput = 0;
['pointerdown', 'keydown', 'touchstart'].forEach((t) => addEventListener(t, () => { lastInput = performance.now(); }, { passive: true, capture: true }));
const whenFree = (fn) => {
  const busy = () => document.querySelector('.auth:not([hidden]), .bag:not([hidden])') || performance.now() - lastInput < 1500;
  if (!busy()) { fn(); return; }
  setTimeout(() => whenFree(fn), 700);
};
addEventListener('load', () => setTimeout(() => whenFree(loadStore), 1200));

// animação FLIP entre o lugar na página e a tela cheia
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
  const p = byId(it.pid);
  tag.querySelector('img').src = img(p.id, it.ci ? 'card-' + it.ci : 'card');
  tag.querySelector('b').textContent = p.name;
  tag.querySelector('span').textContent = `${brl(p.price)} · ${p.colors[it.ci].n}${selected || isMobile ? '' : ' · clique para ver'}`;
  tag.querySelector('a').href = productUrl(p.id, `&cor=${it.ci}&de=loja`);
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
tag.querySelector('a').addEventListener('click', (e) => { if (!tagItem || !store) return; e.preventDefault(); store.open(tagItem); });

function openProduct(id, ci) {
  if (store) sessionStorage.setItem('vs-store-cam', JSON.stringify(store.getCamera()));
  $('#fade').classList.add('on');
  setTimeout(() => { location.href = productUrl(id, `&cor=${ci}&de=loja`); }, reduceMotion ? 0 : 320);
}
addEventListener('pageshow', () => $('#fade').classList.remove('on'));

$$('[data-view]').forEach((b) => b.addEventListener('click', () => { store?.setView(b.dataset.view); showTag(null); }));
$('#zin').addEventListener('click', () => store?.zoom(0.75));
$('#zout').addEventListener('click', () => store?.zoom(1.3));

function buildStoreList() {
  const seen = new Set(); const ul = $('#store-list');
  store.items.forEach((it) => {
    if (seen.has(it.pid)) return; seen.add(it.pid);
    const p = byId(it.pid);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button"><img src="${img(p.id)}" alt="">${p.name}</button>`;
    li.firstChild.addEventListener('click', async () => {
      await enterStore();
      store.selected = it; store.setHover(it); store.focusItem(it, 900); showTag(it, true);
      $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    });
    ul.appendChild(li);
  });
}

/* ---------------- 4. coleções ---------------- */
$('#col-grid').innerHTML = CATEGORIES.map((c, i) => `<a class="col-tile" href="#catalogo" data-filter="${c.id}"><img src="${asset('cat-' + c.id)}" alt="" loading="lazy" width="1000" height="1000"><span class="num">0${i + 1}</span><span class="lbl"><b>${c.name}.</b><span>${c.blurb}</span></span></a>`).join('');
if (!reduceMotion) gsap.utils.toArray('.col-tile').forEach((t, i) => gsap.from(t, { y: 60, opacity: 0, duration: 1.1, ease: 'power3.out', delay: (i % 2) * 0.08, scrollTrigger: { trigger: t, start: 'top 92%' } }));

/* ---------------- 5. destaques ---------------- */
const featured = PRODUCTS.filter((p) => p.featured);
$('#feature-photo').innerHTML = featured.map((p, i) => `<figure class="${i ? '' : 'on'}"><img src="${img(p.id, 'mood')}" alt="${p.name}" loading="lazy"><figcaption>${p.name.split(' ').slice(0, 2).join(' ')}.</figcaption></figure>`).join('');
const finfo = $('#feature-info');
let featIdx = -1, showcase = null;
const setFeat = (i) => {
  if (i === featIdx) return; featIdx = i;
  const p = featured[i];
  $$('#feature-photo figure').forEach((f, k) => { f.classList.toggle('on', k === i); f.classList.toggle('was', k < i); });
  finfo.innerHTML = `<div><b>${p.name}</b><span>${brl(p.price)}</span></div><a class="pill sm" href="${productUrl(p.id)}">Ver peça</a><div class="bar"><i style="transform:scaleX(${(i + 1) / featured.length})"></i></div>`;
};
setFeat(0);
let showcaseReady = null;
const loadShowcase = () => showcaseReady ??= import('./three/viewer.js').then(({ Showcase }) => { showcase = new Showcase($('#feature-canvas'), featured); }).catch((err) => console.warn(err));
new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); loadShowcase(); } }, { rootMargin: '100% 0px' }).observe($('#destaques'));
addEventListener('load', () => setTimeout(() => whenFree(() => (storeReady ? storeReady.then(() => setTimeout(() => whenFree(loadShowcase), 400)) : loadShowcase())), 1800));
// navegação sem precisar rolar: setas e pontos
const fnav = $('.feature-label');
fnav.outerHTML = `<div class="feature-nav" role="group" aria-label="Destaques">
  <button type="button" class="fn-arrow" data-fd="-1" aria-label="Peça anterior">‹</button>
  ${featured.map((p, i) => `<button type="button" class="fn-dot" data-fi="${i}" aria-label="${p.name}"></button>`).join('')}
  <button type="button" class="fn-arrow" data-fd="1" aria-label="Próxima peça">›</button></div>`;
const markDots = (i) => $$('.fn-dot').forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
let featST = null;
function goFeat(i) {
  i = Math.max(0, Math.min(featured.length - 1, i));
  if (featST) {
    // leva a rolagem até a peça (a pinagem continua, só que sem esforço)
    const y = featST.start + (featST.end - featST.start) * (i / (featured.length - 1));
    if (lenis) lenis.scrollTo(y, { duration: 0.9 }); else scrollTo({ top: y, behavior: 'smooth' });
  } else { setFeat(i); showcase?.set(i); markDots(i); }
}
$('#destaques').addEventListener('click', (e) => {
  const d = e.target.closest('[data-fd]'), f = e.target.closest('[data-fi]');
  if (d) goFeat(featIdx + +d.dataset.fd); else if (f) goFeat(+f.dataset.fi);
});
markDots(0);
// celular: deslizar para o lado troca de peça
{
  let sx = 0, sy = 0;
  const box = $('.feature-3d');
  box.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) goFeat(featIdx + (dx < 0 ? 1 : -1));
  }, { passive: true });
}
mm.add('(prefers-reduced-motion: no-preference)', () => {
  featST = ScrollTrigger.create({
    // trecho fixo mais curto (≈35% de tela por peça) e encaixe automático em cada peça
    trigger: '.feature-pin', start: 'top top', end: `+=${(featured.length - 1) * 38}%`, pin: true, anticipatePin: 1,
    snap: { snapTo: 1 / (featured.length - 1), duration: { min: 0.2, max: 0.5 }, delay: 0.08, ease: 'power2.out' },
    onUpdate: (s) => { const v = s.progress * (featured.length - 1); showcase?.set(v); const k = Math.round(v); setFeat(k); markDots(k); },
  });
  return () => { featST = null; };
});

/* ---------------- 8. catálogo ---------------- */
const grid = $('#grid');
grid.innerHTML = LOCAL_CATALOG.map(cardHTML).join('');
let currentFilter = 'todos';
const filters = $('#filters');
filters.innerHTML = [{ id: 'todos', name: 'Todos' }, ...CATEGORIES].map((c, i) => `<button class="chip" data-f="${c.id}" aria-pressed="${!i}">${c.name}</button>`).join('');
function setFilter(id) {
  currentFilter = id;
  $$('[data-f]', filters).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === id)));
  $$('.card', grid).forEach((c) => { c.hidden = id !== 'todos' && c.dataset.cat !== id; });
  ScrollTrigger.refresh();
}
filters.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) setFilter(b.dataset.f); });
$$('[data-filter]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault(); setFilter(a.dataset.filter);
  if (lenis) lenis.scrollTo('#catalogo', { offset: -64 }); else $('#catalogo').scrollIntoView();
}));

// catálogo vivo do banco: preços, promoções, fotos, esgotados e peças novas
loadCatalog().then((list) => {
  grid.innerHTML = list.map(cardHTML).join('');
  setFilter(currentFilter);
  if (!reduceMotion) {
    const below = $$('.card', grid).filter((c) => c.getBoundingClientRect().top > innerHeight);
    gsap.set(below, { opacity: 0, y: 40 });
    ScrollTrigger.batch(below, { start: 'top 96%', once: true, onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.06, overwrite: true }) });
  }
});
initAuth();

/* ---------------- 9. endereço + mapa ---------------- */
const place = STORE.address ? `${STORE.address}, ${STORE.city}` : STORE.city;
const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
$('#visit-info').innerHTML = [
  ['Endereço', STORE.address ? `${STORE.address}<br>${STORE.city}` : `${STORE.city}<br><span class="soon">Endereço exato em breve</span>`],
  ['Horário', STORE.hours],
  ['Atendimento', `<a href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener">WhatsApp</a> · <a href="${STORE.instagramUrl}" target="_blank" rel="noopener">@${STORE.instagram}</a> · <a href="${STORE.tiktokUrl}" target="_blank" rel="noopener">TikTok</a> · <a href="${STORE.vipGroup}" target="_blank" rel="noopener">Grupo VIP</a>`],
  ['Retirada', 'Compre aqui e retire na loja no mesmo dia.'],
].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
// o mapa só carrega perto da tela (não pesa a abertura)
new IntersectionObserver(([e], io) => {
  if (!e.isIntersecting) return; io.disconnect();
  $('#map iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(place)}&z=${STORE.address ? 17 : 14}&output=embed`;
}, { rootMargin: '60% 0px' }).observe($('#map'));
$('#map-cap').innerHTML = `<span>${STORE.address ? 'Como chegar' : 'Região da loja'}</span><a class="pill sm" href="${mapUrl}" target="_blank" rel="noopener">Abrir no Google Maps</a>`;

renderFooter();

// links do menu com rolagem suave
$$('a[href^="#"]').forEach((a) => { if (a.dataset.filter) return; a.addEventListener('click', (e) => { const id = a.getAttribute('href'); if (id.length < 2 || !lenis) return; e.preventDefault(); lenis.scrollTo(id, { offset: id === '#loja' ? -40 : -64 }); }); });

// âncoras (ex.: voltando da página do produto para #loja): só depois que os
// trechos fixados (pin) estiverem medidos, senão a página muda de altura
const goHash = () => {
  const t = location.hash && document.querySelector(location.hash);
  if (!t) return;
  const el = t.id === 'loja' ? stage : t;
  const y = el.getBoundingClientRect().top + scrollY - (t.id === 'loja' ? (innerHeight - el.offsetHeight) / 2 : 64);
  if (lenis) lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y);
};
if ('scrollRestoration' in history && location.hash) history.scrollRestoration = 'manual';
addEventListener('load', () => {
  ScrollTrigger.refresh(); requestAnimationFrame(goHash);
  const saved = JSON.parse(sessionStorage.getItem('vs-store-cam') || 'null');
  if (saved && location.hash === '#loja') { sessionStorage.removeItem('vs-store-cam'); enterStore({ push: false, cam: saved }); }
});
