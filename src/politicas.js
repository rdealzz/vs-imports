import { STORE } from './data/products.js';
import { initBag } from './ui/bag.js';
import { initAuth } from './ui/auth.js';
import { renderFooter } from './ui/footer.js';

initAuth();
initBag();
renderFooter(undefined, { home: './' });
document.getElementById('upd').textContent = '18/11/2026';
document.getElementById('contato').innerHTML = `
  <h2>Fale com a gente</h2>
  <p>${STORE.company} · CNPJ ${STORE.cnpj}<br>${STORE.address ? STORE.address + ', ' : ''}${STORE.city}</p>
  <div class="row"><a class="pill solid" href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener">WhatsApp</a><a class="pill" href="mailto:${STORE.email}">${STORE.email}</a></div>`;
// destaca a seção atual no índice
const links = [...document.querySelectorAll('.pol-toc a')];
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) links.forEach((a) => (a.hash === '#' + e.target.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
}), { rootMargin: '-30% 0px -60% 0px' });
document.querySelectorAll('.pol-text section[id]').forEach((s) => io.observe(s));
