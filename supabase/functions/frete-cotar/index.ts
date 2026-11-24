// Cotação de frete no servidor: SuperFrete quando houver token; senão, a tabela da loja.
// Guarda cada opção em shipping_quotes (o pedido usa o id, então o preço não pode ser alterado no navegador).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SF_URL = Deno.env.get('SUPERFRETE_URL') || 'https://sandbox.superfrete.com';
const SF_TOKEN = Deno.env.get('SUPERFRETE_TOKEN') || '';
const SF_UA = Deno.env.get('SUPERFRETE_UA') || 'VS Imports 1.0 (contato@vsimports.com.br)';
const SERVICES = Deno.env.get('SUPERFRETE_SERVICES') || '1,2,17,3,31';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { cep, items } = await req.json();
    const to = String(cep || '').replace(/\D/g, '');
    if (to.length !== 8) return json({ error: 'cep_invalido' }, 400);
    if (!Array.isArray(items) || !items.length || items.length > 30) return json({ error: 'itens_invalidos' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // quem está cotando (opcional: visitantes também podem ver o preço)
    let uid: string | null = null;
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (auth) { const { data } = await admin.auth.getUser(auth); uid = data.user?.id ?? null; }

    const ids = [...new Set(items.map((i: { id: string }) => String(i.id)))];
    const { data: prods, error } = await admin.from('products').select('*').in('id', ids);
    if (error) throw error;
    const byId = new Map(prods!.map((p) => [p.id, p]));
    const { data: dimsRows } = await admin.rpc('package_dims_many', { p_ids: ids });
    const dims = new Map((dimsRows || []).map((d: { id: string }) => [d.id, d]));
    let subtotal = 0;
    const products = [];
    for (const it of items) {
      const p = byId.get(String(it.id)); if (!p) continue;
      const q = Math.max(1, Math.min(20, Number(it.qty) || 1));
      const price = p.promo_price != null && (!p.promo_until || new Date(p.promo_until) > new Date()) ? Number(p.promo_price) : Number(p.price);
      subtotal += price * q;
      const d = dims.get(p.id) as { weight: number; height: number; width: number; length: number };
      products.push({ quantity: q, weight: Number(d.weight), height: Number(d.height), width: Number(d.width), length: Number(d.length) });
    }
    const { data: cfg } = await admin.from('store_settings').select('free_shipping_min, sender').limit(1).maybeSingle();
    const freeMin = Number(cfg?.free_shipping_min ?? 349.9);
    const from = String(cfg?.sender?.postal_code || '81150000').replace(/\D/g, '');

    let options: { service: number; service_name: string; company: string | null; price: number; days: number | null; volume: unknown; source: string }[] = [];
    if (SF_TOKEN) {
      const r = await fetch(`${SF_URL}/api/v0/calculator`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SF_TOKEN}`, 'User-Agent': SF_UA, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ from: { postal_code: from }, to: { postal_code: to }, services: SERVICES,
          options: { own_hand: false, receipt: false, insurance_value: Math.round(subtotal * 100) / 100, use_insurance_value: false }, products }),
      });
      const out = await r.json().catch(() => null);
      if (r.ok && Array.isArray(out)) {
        options = out.filter((o) => !o.has_error && o.price != null).map((o) => ({
          service: Number(o.id), service_name: String(o.name), company: o.company?.name ?? null, price: Number(o.price),
          days: o.delivery_range?.max ?? o.delivery_time ?? null, volume: o.packages?.[0] ? { ...o.packages[0].dimensions, weight: o.packages[0].weight } : null, source: 'superfrete',
        }));
      } else console.warn('superfrete calculator', r.status, JSON.stringify(out)?.slice(0, 300));
    }
    if (!options.length) {
      // sem SuperFrete (ou fora do ar): tabela por região do painel
      const { data: z } = await admin.rpc('shipping_quote', { p_cep: to, p_subtotal: 0 });
      if (z?.[0]) options = [{ service: 0, service_name: 'Entrega padrão', company: z[0].zone, price: Number(z[0].price), days: null, volume: null, source: 'tabela' }];
    }
    if (!options.length) return json({ error: 'sem_frete' }, 404);

    options.sort((a, b) => a.price - b.price);
    const rows = options.map((o) => ({ ...o, user_id: uid, cep: to, subtotal: Math.round(subtotal * 100) / 100 }));
    const { data: saved, error: se } = await admin.from('shipping_quotes').insert(rows).select('id, service, service_name, company, price, days, source');
    if (se) throw se;
    const free = subtotal >= freeMin;
    return json({
      free, free_min: freeMin, subtotal,
      options: saved!.map((s) => ({ id: s.id, service: s.service, name: s.service_name, company: s.company, price: free ? 0 : Number(s.price), full_price: Number(s.price), days: s.days, source: s.source })),
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'falha_frete' }, 500);
  }
});
