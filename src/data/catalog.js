// Catálogo vivo: lê produtos, preços (com promoção), fotos e estoque do
// Supabase. Sem conexão, usa o catálogo local (src/data/products.js).
import { PRODUCTS as LOCAL } from './products.js';
import { supabase, hasSupabase } from '../lib/supabase.js';

const toNum = (h) => (typeof h === 'number' ? h : parseInt(String(h || '#888888').replace('#', ''), 16));
const local = LOCAL.map((p) => ({ ...p, finalPrice: p.price, compareAt: null, photos: [], variants: [], available: true }));
let cache = null;

export const photoUrl = (path) => supabase ? supabase.storage.from('produtos').getPublicUrl(path).data.publicUrl : path;

export async function loadCatalog({ includeInactive = false, fresh = false } = {}) {
  if (!hasSupabase) return local;
  if (cache && !includeInactive && !fresh) return cache;
  try {
    let q = supabase.from('products').select('*, product_images(path, position), product_variants(color, size, stock)').order('created_at');
    if (!includeInactive) q = q.eq('active', true);
    const [{ data, error }, { data: av }] = await Promise.all([q, supabase.from('product_availability').select('id, final_price, compare_at, available')]);
    if (error) throw error;
    const avail = new Map((av || []).map((a) => [a.id, a]));
    const list = data.map((r) => {
      const l = LOCAL.find((x) => x.id === r.id);
      const a = avail.get(r.id);
      return {
        id: r.id, cat: r.category, model: r.model, name: r.name, desc: r.description || l?.desc || '',
        price: +r.price, finalPrice: a ? +a.final_price : +r.price, compareAt: a?.compare_at ? +a.compare_at : null,
        promoUntil: r.promo_until, active: r.active,
        sizes: r.sizes?.length ? r.sizes : (l?.sizes || ['Único']),
        colors: (r.colors?.length ? r.colors : [{ n: 'Única', c: '#28282b', a: '#f1ede4' }]).map((c) => ({ n: c.n, c: toNum(c.c), a: toNum(c.a) })),
        print: r.print, featured: r.featured, stock: r.stock,
        available: a ? a.available : r.stock == null || r.stock > 0,
        photos: (r.product_images || []).sort((x, y) => x.position - y.position).map((i) => photoUrl(i.path)),
        variants: r.product_variants || [],
        hasLocalImages: !!l,
      };
    });
    if (!includeInactive) cache = list;
    return list;
  } catch (err) {
    console.warn('Catálogo local (sem conexão com o banco):', err.message || err);
    return local;
  }
}

// estoque de uma cor + tamanho (null = não controlado)
export function variantStock(p, color, size) {
  if (!p.variants?.length) return p.stock == null ? null : p.stock;
  const v = p.variants.find((x) => x.color === color && x.size === size);
  return v ? v.stock : 0;
}
export function colorAvailable(p, color) {
  if (!p.variants?.length) return p.available;
  return p.variants.some((v) => v.color === color && v.stock > 0);
}
export const discountPct = (p) => (p.compareAt ? Math.round((1 - p.finalPrice / p.compareAt) * 100) : 0);
export { local as LOCAL_CATALOG };
