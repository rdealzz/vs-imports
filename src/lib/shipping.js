// Frete: a tabela e o valor do frete grátis ficam no banco (o dono ajusta no
// painel). Aqui só consultamos; o pedido grava o valor oficial calculado lá.
import { supabase, hasSupabase } from './supabase.js';
import { brl } from '../data/products.js';

const FALLBACK_MIN = 349.9;
let minP = null;
export function freeMin() {
  if (!minP) minP = hasSupabase ? supabase.rpc('shipping_free_min').then(({ data }) => +(data ?? FALLBACK_MIN)).catch(() => FALLBACK_MIN) : Promise.resolve(FALLBACK_MIN);
  return minP;
}

export async function quote(cep, subtotal = 0) {
  const { data, error } = await supabase.rpc('shipping_quote', { p_cep: String(cep).replace(/\D/g, ''), p_subtotal: subtotal });
  if (error) throw error;
  return data?.[0] || null; // { zone, price, days, free, free_min }
}

// barra "faltam R$ X para o frete grátis"
export async function freeBarHTML(subtotal) {
  const m = await freeMin();
  if (!subtotal) return '';
  const pct = Math.min(100, (subtotal / m) * 100);
  const left = m - subtotal;
  return `<div class="free-bar${left <= 0 ? ' ok' : ''}"><p>${left <= 0 ? '<b>Você ganhou frete grátis!</b>' : `Faltam <b>${brl(left)}</b> para o <b>frete grátis</b>`}</p><span><i style="width:${pct}%"></i></span></div>`;
}

// calculadora de frete (página do produto): CEP -> valor e prazo
export function mountCalc(el, getSubtotal) {
  el.innerHTML = `<form class="ship-calc" novalidate>
    <label for="ship-cep">Calcular frete e prazo</label>
    <div><input id="ship-cep" name="cep" inputmode="numeric" maxlength="9" placeholder="Seu CEP" autocomplete="postal-code"><button class="pill sm" type="submit">Calcular</button></div>
    <p class="ship-out" role="status" aria-live="polite"></p>
    <a class="ship-help" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei meu CEP</a>
  </form>`;
  const f = el.querySelector('form'), out = el.querySelector('.ship-out');
  try { const saved = localStorage.getItem('vs-cep'); if (saved) f.cep.value = saved; } catch {}
  const run = async () => {
    const c = f.cep.value.replace(/\D/g, '');
    if (c.length !== 8) { out.textContent = 'Digite os 8 números do CEP.'; return; }
    out.textContent = 'Calculando…';
    try {
      const sub = getSubtotal();
      const [q, m] = await Promise.all([quote(c, sub), freeMin()]);
      try { localStorage.setItem('vs-cep', f.cep.value); } catch {}
      if (!q) { out.textContent = 'CEP fora da nossa tabela: fale com a gente no WhatsApp.'; return; }
      out.innerHTML = `<span class="ship-line"><b>${q.free ? 'Frete grátis' : brl(+q.price)}</b> · ${q.days} <small>(${q.zone})</small></span>
        <span class="ship-line"><b>Grátis</b> · retirada na loja no mesmo dia</span>
        ${q.free ? '' : `<small class="ship-free">Frete grátis em compras a partir de ${brl(m)}</small>`}`;
    } catch { out.textContent = 'Não foi possível calcular agora. Tente de novo.'; }
  };
  f.cep.addEventListener('input', () => { f.cep.value = f.cep.value.replace(/\D/g, '').replace(/^(\d{5})(\d{1,3}).*/, '$1-$2'); if (f.cep.value.length === 9) run(); });
  f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  if (f.cep.value.length === 9) run();
}
