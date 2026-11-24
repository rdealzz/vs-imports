// Páginas institucionais (Quem somos, Perguntas frequentes, Rastreio):
// mesmo topo, rodapé, sacola e login da loja.
import { STORE } from './data/products.js';
import { loadCatalog, LOCAL_CATALOG } from './data/catalog.js';
import { hasSupabase } from './lib/supabase.js';
import { initBag } from './ui/bag.js';
import { initAuth, auth, openAuth } from './ui/auth.js';
import { renderFooter } from './ui/footer.js';
import { mountShopHead } from './ui/shophead.js';
import { freeMin } from './lib/shipping.js';

const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
let catalog = hasSupabase ? [] : LOCAL_CATALOG;
const head = mountShopHead({ home: false, getCatalog: () => catalog });
const lock = (on) => { document.documentElement.style.overflow = on ? 'hidden' : ''; };
document.addEventListener('vs-cover', (e) => lock(e.detail || !!document.querySelector('.auth:not([hidden]), .bag:not([hidden])')));
initBag({ onOpen: () => lock(true), onClose: () => lock(false) });
initAuth();
renderFooter(undefined, { home: './' });
loadCatalog().then((list) => { catalog = list; head.refresh(list); });

// links de contato
const wa = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent('Olá, VS Imports! Vim pelo site e tenho uma dúvida.')}`;
$$('[data-wa]').forEach((a) => (a.href = wa));
$$('[data-store-ig]').forEach((a) => (a.href = STORE.instagramUrl));
// frete grátis com o valor atual do painel
freeMin().then((v) => $$('[data-free]').forEach((b) => (b.textContent = v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))));

// rastreio: Correios ou Jadlog
const form = $('#track');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = form.code.value.replace(/\s+/g, '').toUpperCase();
    const msg = $('#track-msg');
    if (code.length < 8) { msg.textContent = 'Digite o código completo (ex.: AB123456789BR).'; form.code.focus(); return; }
    const via = e.submitter?.dataset.via || (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code) ? 'correios' : 'jadlog');
    const url = via === 'correios'
      ? `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(code)}`
      : `https://www.jadlog.com.br/jadlog/tracking?cte=${encodeURIComponent(code)}`;
    msg.textContent = `Abrindo o rastreio ${via === 'correios' ? 'dos Correios' : 'da Jadlog'}…`;
    open(url, '_blank', 'noopener');
  });
  // meus pedidos: entra na conta se precisar e abre a lista
  $('#my-orders-btn').addEventListener('click', () => {
    const show = () => document.body.insertAdjacentHTML('beforeend', '<button hidden data-my-orders id="mo-tmp"></button>') || ($('#mo-tmp').click(), $('#mo-tmp').remove());
    if (auth.user) show(); else openAuth('entrar', { reason: 'Entre para ver os seus pedidos.', then: () => setTimeout(show, 300) });
  });
}
