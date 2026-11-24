// Gera a etiqueta de um pedido na SuperFrete (só dono/dev):
// cria o frete (cart) -> paga com o saldo da carteira (checkout) -> pega o PDF (tag/print).
// Também consulta o status/rastreio (acao "status") e cancela (acao "cancelar").
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
const sf = async (path: string, body?: unknown, method = 'POST') => {
  const r = await fetch(`${SF_URL}${path}`, {
    method, headers: { Authorization: `Bearer ${SF_TOKEN}`, 'User-Agent': SF_UA, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`superfrete ${path} ${r.status}: ${out?.message || out?.error || JSON.stringify(out).slice(0, 200)}`);
  return out;
};
const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!SF_TOKEN) return json({ error: 'superfrete_sem_token' }, 400);
    const jwt = req.headers.get('Authorization') || '';
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: jwt } } });
    const { data: owner } = await user.rpc('is_owner');
    if (!owner) return json({ error: 'acesso_negado' }, 403);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { order_id, acao = 'gerar', motivo } = await req.json();
    const { data: o, error } = await admin.from('orders').select('*, order_items(name, qty, unit_price, product_id)').eq('id', order_id).maybeSingle();
    if (error || !o) return json({ error: 'pedido_nao_encontrado' }, 404);

    if (acao === 'status') {
      if (!o.superfrete_id) return json({ error: 'sem_etiqueta' }, 400);
      const info = await sf(`/api/v0/order/info/${o.superfrete_id}`, undefined, 'GET');
      const upd = { shipping_status: info.status ?? o.shipping_status, tracking_code: info.tracking || o.tracking_code };
      await admin.from('orders').update(upd).eq('id', o.id);
      return json({ ok: true, ...upd });
    }
    if (acao === 'cancelar') {
      if (!o.superfrete_id) return json({ error: 'sem_etiqueta' }, 400);
      await sf('/api/v0/order/cancel', { order: { id: o.superfrete_id, description: cut(motivo || 'Cancelado pela loja', 255) } });
      await admin.from('orders').update({ shipping_status: 'cancelled' }).eq('id', o.id);
      return json({ ok: true });
    }

    // gerar (ou reimprimir) a etiqueta
    if (o.delivery !== 'entrega' || !o.shipping_address) return json({ error: 'pedido_sem_entrega' }, 400);
    if (!['pago', 'separado'].includes(o.status)) return json({ error: 'pedido_nao_pago' }, 400);
    let sfId = o.superfrete_id as string | null;
    if (!sfId) {
      const { data: cfg } = await admin.from('store_settings').select('sender').limit(1).maybeSingle();
      const s = cfg?.sender || {};
      if (!s.postal_code || !s.address || !s.city) return json({ error: 'remetente_incompleto' }, 400);
      const a = o.shipping_address;
      // volume: o da cotação escolhida; se o pedido não tiver, recalcula com as medidas padrão
      let volume = o.shipping_volume;
      let service = o.shipping_service || 1;
      if (!volume) {
        const ids = o.order_items.map((i: { product_id: string }) => i.product_id);
        const { data: dims } = await admin.rpc('package_dims_many', { p_ids: ids });
        const dm = new Map((dims || []).map((d: { id: string }) => [d.id, d]));
        const products = o.order_items.map((i: { product_id: string; qty: number }) => { const d = dm.get(i.product_id) as Record<string, number>; return { quantity: i.qty, weight: +d.weight, height: +d.height, width: +d.width, length: +d.length }; });
        const q = await sf('/api/v0/calculator', { from: { postal_code: s.postal_code }, to: { postal_code: a.cep }, services: String(service), options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false }, products });
        const pk = Array.isArray(q) ? q.find((x) => !x.has_error)?.packages?.[0] : null;
        if (!pk) return json({ error: 'cotacao_indisponivel' }, 400);
        volume = { ...pk.dimensions, weight: pk.weight };
      }
      const phone = String(o.customer_phone || '').replace(/\D/g, '').replace(/^55/, '');
      const cart = await sf('/api/v0/cart', {
        from: { name: cut(s.name || 'VS Imports', 50), address: cut(s.address, 50), number: cut(s.number, 10), complement: cut(s.complement, 20),
          district: cut(s.district, 60), city: cut(s.city, 50), state_abbr: s.state_abbr || 'PR', postal_code: String(s.postal_code).replace(/\D/g, '') },
        to: { name: cut(a.recipient || o.customer_name, 50), address: cut(a.street, 50), number: cut(a.number, 10), complement: cut(a.complement, 20),
          district: cut(a.district, 50), city: cut(a.city, 50), state_abbr: a.state, postal_code: a.cep, document: o.customer_document,
          ...(phone.length === 11 ? { phone } : {}) },
        service,
        products: o.order_items.map((i: { name: string; qty: number; unit_price: number }) => ({ name: cut(i.name, 60), quantity: i.qty, unitary_value: Number(i.unit_price) })),
        volume: { height: +volume.height, width: +volume.width, length: +volume.length, weight: +volume.weight },
        options: { insurance_value: null, receipt: false, own_hand: false, non_commercial: true },
        tag: `Pedido ${o.number}`, platform: 'VS Imports',
      });
      sfId = cart.id;
      await admin.from('orders').update({ superfrete_id: sfId, shipping_status: cart.status || 'pending' }).eq('id', o.id);
      await sf('/api/v0/checkout', { orders: [sfId] });
    }
    const pr = await sf('/api/v0/tag/print', { orders: [sfId] });
    let tracking = o.tracking_code, status = 'released';
    try { const info = await sf(`/api/v0/order/info/${sfId}`, undefined, 'GET'); tracking = info.tracking || tracking; status = info.status || status; } catch { /* rastreio chega pelo webhook */ }
    await admin.from('orders').update({ label_url: pr.url, tracking_code: tracking, shipping_status: status, status: o.status === 'pago' ? 'separado' : o.status }).eq('id', o.id);
    return json({ ok: true, url: pr.url, tracking, superfrete_id: sfId });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
