// Card de vitrine (prateleiras): foto, selos, preço, 3x, tamanhos e COMPRAR.
import { brl, img } from '../data/products.js';
import { discountPct, variantStock } from '../data/catalog.js';
import { productUrl } from './card.js';

export const FREE_SHIPPING = 349.9;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function shopCardHTML(p) {
  const photo = p.thumbs?.[0] || p.photos?.[0] || img(p.id, 'card');
  const photo2 = p.thumbs?.[1] || p.photos?.[1] || (p.photos?.length ? '' : (p.colors.length > 1 ? img(p.id, 'card-1') : ''));
  const pct = discountPct(p);
  const color = p.colors[0]?.n || '';
  const sizes = p.sizes?.length ? p.sizes : ['Único'];
  const sizeBtns = sizes.map((s) => {
    const st = variantStock(p, color, s);
    const out = st === 0;
    return `<button type="button" class="sz" data-size="${esc(s)}"${out ? ' disabled aria-label="' + esc(s) + ' esgotado"' : ''} aria-pressed="false">${esc(s)}</button>`;
  }).join('');
  const labels = [
    !p.available ? '<span class="lb lb-out">Esgotado</span>' : '',
    pct ? `<span class="lb lb-off">${pct}% OFF</span>` : '',
    p.finalPrice >= FREE_SHIPPING ? '<span class="lb lb-ship">Frete grátis</span>' : '',
  ].join('');
  return `<li class="pcard${p.available ? '' : ' out'}" data-id="${esc(p.id)}" data-cat="${esc(p.cat)}">
    <a class="pc-ph" href="${productUrl(p.id)}" aria-label="${esc(p.name)}">
      <img src="${photo}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="800" height="1000">
      ${photo2 ? `<img class="pc-ph2" src="${photo2}" alt="" loading="lazy" decoding="async" width="800" height="1000">` : ''}
      <span class="pc-labels">${labels}</span>
    </a>
    <div class="pc-body">
      <a class="pc-name" href="${productUrl(p.id)}">${esc(p.name)}</a>
      <p class="pc-price">${p.compareAt ? `<s>${brl(p.compareAt)}</s>` : ''}<b>${brl(p.finalPrice)}</b></p>
      <p class="pc-inst">3x de ${brl(p.finalPrice / 3)} sem juros</p>
      ${p.available ? `<div class="pc-sizes" role="group" aria-label="Tamanho">${sizeBtns}</div>
      <button class="pc-buy" type="button" data-buy>Comprar</button>` : `<a class="pc-buy ghost" href="${productUrl(p.id)}">Ver peça</a>`}
    </div>
  </li>`;
}
