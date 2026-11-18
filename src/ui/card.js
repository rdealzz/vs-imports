import { brl, img } from '../data/products.js';
import { discountPct } from '../data/catalog.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export const productUrl = (id, extra = '') => `produto.html?id=${encodeURIComponent(id)}${extra}`;

export function priceHTML(p) {
  return p.compareAt
    ? `<span class="price-was">${brl(p.compareAt)}</span> <span class="price-now">${brl(p.finalPrice)}</span>`
    : `<span>${brl(p.finalPrice ?? p.price)}</span>`;
}
export function mainImage(p, variant = 'card') {
  if (p.photos?.length) return p.photos[0];
  return img(p.id, variant);
}

export function cardHTML(p) {
  const hasGen = p.hasLocalImages !== false;
  const set = (v) => p.photos?.length ? `src="${p.photos[v === 'card-1' ? 1 : 0] || p.photos[0]}"` : `src="${img(p.id, v)}" srcset="${img(p.id, v + '-sm')} 480w, ${img(p.id, v)} 800w" sizes="(max-width: 760px) 50vw, 25vw"`;
  const hasSecond = p.photos?.length > 1 || (hasGen && !p.photos?.length && p.colors.length > 1);
  const second = matchMedia('(hover: hover)').matches && hasSecond ? `<img ${set('card-1')} alt="" loading="lazy" decoding="async" width="800" height="1000">` : '';
  const pct = discountPct(p);
  const badge = !p.available ? '<span class="badge out">Esgotado</span>' : pct ? `<span class="badge sale">-${pct}%</span>` : '';
  return `<li class="card${p.available ? '' : ' sold'}" data-cat="${p.cat}"><a href="${productUrl(p.id)}">
    <div class="ph">${badge}<img ${set('card')} alt="${p.name}" loading="lazy" decoding="async" width="800" height="1000">${second}</div>
    <div class="meta"><b>${p.name}</b><span class="price">${priceHTML(p)}</span></div>
    <div class="dots" aria-label="${p.colors.length} cores">${p.colors.map((c) => `<i style="background:${hex(c.c)}" title="${c.n}"></i>`).join('')}</div>
  </a></li>`;
}
