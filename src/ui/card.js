import { brl, img } from '../data/products.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export const productUrl = (id, extra = '') => `produto.html?id=${encodeURIComponent(id)}${extra}`;

export function cardHTML(p) {
  const second = p.colors.length > 1 ? `<img src="${img(p.id, 'card-1')}" alt="" loading="lazy" width="800" height="1000">` : `<img src="${img(p.id, 'mood')}" alt="" loading="lazy" width="900" height="1200">`;
  return `<li class="card" data-cat="${p.cat}"><a href="${productUrl(p.id)}">
    <div class="ph"><img src="${img(p.id)}" alt="${p.name}" loading="lazy" width="800" height="1000">${second}</div>
    <div class="meta"><b>${p.name}</b><span>${brl(p.price)}</span></div>
    <div class="dots" aria-label="${p.colors.length} cores">${p.colors.map((c) => `<i style="background:${hex(c.c)}" title="${c.n}"></i>`).join('')}</div>
  </a></li>`;
}
