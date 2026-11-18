// Rodapé compartilhado por todas as páginas.
import { STORE } from '../data/products.js';

export function renderFooter(el = document.getElementById('rodape'), { home = '' } = {}) {
  if (!el) return;
  el.innerHTML = `
  <div class="foot-promise wrap">
    <div><b>Troca em até 30 dias</b><span>Na loja ou pelo WhatsApp, sem burocracia.</span></div>
    <div><b>Retirada no mesmo dia</b><span>Compre aqui e busque na loja física.</span></div>
    <div><b>Pagamento seguro</b><span>Pix, cartão em até 3x sem juros e dinheiro na loja.</span></div>
    <div><b>Peças conferidas</b><span>Cada item é revisado antes de ir para a arara.</span></div>
  </div>
  <div class="foot-main wrap">
    <div class="foot-brand">
      <img class="foot-logo" src="${import.meta.env.BASE_URL}brand/vs-logo.svg" alt="VS Imports" width="150" height="150">
      <p>A loja que veste os artistas.</p>
      <form class="news" id="news">
        <label for="news-mail">Receba os lançamentos antes de todo mundo</label>
        <div><input id="news-mail" type="email" required placeholder="seu@email.com" autocomplete="email"><button class="pill solid" type="submit">Assinar</button></div>
        <p class="small" id="news-msg" role="status" aria-live="polite"></p>
      </form>
    </div>
    <nav class="foot-col" aria-label="Loja">
      <h3>Loja</h3>
      <a href="${home}#loja">Loja 3D</a>
      <a href="${home}#colecoes">Coleções</a>
      <a href="${home}#catalogo">Catálogo</a>
      <a href="${home}#visite">Endereço</a>
    </nav>
    <nav class="foot-col" aria-label="Políticas">
      <h3>Políticas</h3>
      <a href="politicas.html#trocas">Trocas e devoluções</a>
      <a href="politicas.html#entrega">Entrega e retirada</a>
      <a href="politicas.html#pagamento">Pagamento</a>
      <a href="politicas.html#privacidade">Privacidade (LGPD)</a>
      <a href="politicas.html#termos">Termos de uso</a>
    </nav>
    <div class="foot-col" id="foot-contact">
      <h3>Atendimento</h3>
    </div>
  </div>
  <div class="foot-legal wrap">
    <span id="foot-company"></span>
    <span class="pay" aria-label="Formas de pagamento"><i>Pix</i><i>Visa</i><i>Mastercard</i><i>Elo</i><i>Dinheiro</i></span>
  </div>
  <p class="foot-giant" aria-hidden="true">VS IMPORTS</p>
`;
  el.querySelector('#foot-contact').insertAdjacentHTML('beforeend', `
    <a href="https://wa.me/${STORE.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
    <a href="https://instagram.com/${STORE.instagram}" target="_blank" rel="noopener">@${STORE.instagram}</a>
    <a href="mailto:${STORE.email}">${STORE.email}</a>
    <span>${STORE.hours}</span>`);
  el.querySelector('#foot-company').innerHTML = `© ${new Date().getFullYear()} ${STORE.company} · CNPJ ${STORE.cnpj} · ${STORE.city}`;
  const f = el.querySelector('#news');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    // sem back-end ainda: guarda localmente até ligar a um serviço de e-mail
    try { const l = JSON.parse(localStorage.getItem('vs-news') || '[]'); l.push(f.elements[0].value); localStorage.setItem('vs-news', JSON.stringify(l)); } catch {}
    el.querySelector('#news-msg').textContent = 'Pronto. Você vai saber primeiro.';
    f.reset();
  });
}
