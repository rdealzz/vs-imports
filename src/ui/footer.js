// Rodapé compartilhado por todas as páginas: grupo VIP, canais, políticas
// e o botão flutuante de WhatsApp (pedidos, dúvidas e ajuda).
import { STORE } from '../data/products.js';

const wa = (text = 'Olá, VS Imports! Vim pelo site.') => `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}`;
const ICON = {
  wa: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/></svg>',
  tt: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16.6 3c.3 2.2 1.6 3.7 3.9 3.9v3a7 7 0 0 1-3.9-1.2v6.1A5.8 5.8 0 1 1 10.8 9v3.1a2.8 2.8 0 1 0 2.8 2.8V3h3Z"/></svg>',
};

// selos de confiança: traço fino de 1,5px (cor e espessura no CSS)
const SEAL = {
  truck: '<svg viewBox="0 0 24 24"><path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 9h13l-3.5-3.5"/><path d="M20 15H7l3.5 3.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.2v2.3"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path d="M6.5 4.5h11l3.5 5-9 10-9-10z"/><path d="M3 9.5h18"/><path d="m9.5 4.5-1.5 5 4 10 4-10-1.5-5"/></svg>',
};

export function renderFooter(el = document.getElementById('rodape'), { home = '' } = {}) {
  if (!el) return;
  el.dataset.head = 'dark';
  el.innerHTML = `
  <div class="foot-vip wrap">
    <div class="vip-copy">
      <h2>Grupo VIP <em>de ofertas</em></h2>
      <p>Lançamentos, reposições e promoções relâmpago chegam primeiro no grupo. Entre e fique sabendo antes de todo mundo.</p>
    </div>
    <a class="vip-btn" href="${STORE.vipGroup}" target="_blank" rel="noopener">${ICON.wa}Entrar no grupo VIP</a>
  </div>
  <div class="foot-promise wrap">
    <div><span class="seal" aria-hidden="true">${SEAL.truck}</span><b>Entregamos para todo o Brasil</b><span>Ou retire no mesmo dia na loja do Capão Raso.</span></div>
    <div><span class="seal" aria-hidden="true">${SEAL.swap}</span><b>Troca em até 7 dias</b><span>Na loja ou pelo WhatsApp, sem burocracia.</span></div>
    <div><span class="seal" aria-hidden="true">${SEAL.lock}</span><b>Pagamento seguro</b><span>Pix, cartão em até 3x sem juros e dinheiro na loja.</span></div>
    <div><span class="seal" aria-hidden="true">${SEAL.gem}</span><b>Linha premium e importada</b><span>Cada peça é conferida antes de ir para a arara.</span></div>
  </div>
  <div class="foot-main wrap">
    <div class="foot-brand">
      <img class="foot-logo" src="${import.meta.env.BASE_URL}brand/vs-logo.svg" alt="VS Imports" width="150" height="150">
      <p>A loja que veste os artistas.</p>
      <div class="foot-social">
        <a href="${STORE.instagramUrl}" target="_blank" rel="noopener" aria-label="Instagram @${STORE.instagram}">${ICON.ig}</a>
        <a href="${STORE.tiktokUrl}" target="_blank" rel="noopener" aria-label="TikTok @${STORE.tiktok}">${ICON.tt}</a>
        <a href="${wa()}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICON.wa}</a>
      </div>
    </div>
    <nav class="foot-col" aria-label="Loja">
      <h3>Loja</h3>
      <a href="${home}#catalogo">Produtos</a>
      <a href="${home}#loja">Loja 3D</a>
      <a href="rastreio.html">Rastreie o seu pedido</a>
      <a href="perguntas-frequentes.html">Perguntas frequentes</a>
      <a href="quem-somos.html">Quem somos nós?</a>
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
    <div class="foot-col">
      <h3>Atendimento</h3>
      <a href="${wa('Olá, VS Imports! Quero fazer um pedido.')}" target="_blank" rel="noopener">WhatsApp: pedidos e dúvidas</a>
      <a href="${STORE.instagramUrl}" target="_blank" rel="noopener">Instagram @${STORE.instagram}</a>
      <a href="${STORE.tiktokUrl}" target="_blank" rel="noopener">TikTok @${STORE.tiktok}</a>
      <a href="${STORE.vipGroup}" target="_blank" rel="noopener">Grupo VIP de ofertas</a>
      <span>${STORE.hours}</span>
    </div>
  </div>
  <div class="foot-seal wrap" aria-hidden="true">
    <span class="rule"></span>
    <img src="${import.meta.env.BASE_URL}brand/vs-icon.svg" alt="" width="52" height="52">
    <span class="rule"></span>
  </div>
  <div class="foot-legal wrap">
    <span id="foot-company"></span>
    <span class="pay" aria-label="Formas de pagamento">Pix · Visa · Mastercard · Elo · Dinheiro</span>
  </div>
`;
  el.querySelector('#foot-company').innerHTML = `© ${new Date().getFullYear()} ${STORE.company} · CNPJ ${STORE.cnpj} · ${STORE.city}`;
  // botão flutuante de WhatsApp (uma vez por página)
  if (!document.querySelector('.wa-float')) {
    document.body.insertAdjacentHTML('beforeend', `<a class="wa-float" href="${wa()}" target="_blank" rel="noopener" aria-label="Falar com a VS Imports no WhatsApp: pedidos, dúvidas e ajuda" title="WhatsApp: pedidos e dúvidas">${ICON.wa}</a>`);
  }
}
