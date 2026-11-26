// Cria o pagamento do pedido no Mercado Pago (Checkout Pro) e devolve o link da tela de pagamento.
// O valor vem do pedido no banco (já conferido pelo place_order), nunca do navegador.
// { check: true } só responde se o Mercado Pago está ligado (token salvo no servidor).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || '';
const SITE = (Deno.env.get('SITE_URL') || '').replace(/\/$/, '');
const HOURS = 47; // o pedido expira em 48 h: o link de pagamento vence antes

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.check) return json({ online: !!TOKEN, teste: TOKEN.startsWith('TEST-') });
    if (!TOKEN) return json({ error: 'mp_sem_token' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: who } = await admin.auth.getUser(jwt);
    const user = who?.user; if (!user) return json({ error: 'entre_na_conta' }, 401);

    const { data: o } = await admin.from('orders').select('id, number, total, status, created_at, customer_name, order_items(name, qty)')
      .eq('id', String(body.order_id || '')).eq('user_id', user.id).maybeSingle();
    if (!o) return json({ error: 'pedido_nao_encontrado' }, 404);
    if (o.status !== 'pendente') return json({ error: 'pedido_nao_pendente', status: o.status }, 400);
    const expira = new Date(new Date(o.created_at).getTime() + HOURS * 3600e3);
    if (expira < new Date(Date.now() + 10 * 60e3)) return json({ error: 'pedido_expirado' }, 400);

    // volta para o site de onde o cliente veio (ou o SITE_URL)
    // (aceita a página enviada pelo navegador só se for do mesmo site que fez a chamada)
    const origin = req.headers.get('origin') || '';
    const page = String(body.back || '').split('?')[0];
    const base = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) && page.startsWith(origin + '/') && page.endsWith('/checkout.html') ? page
      : `${SITE}/checkout.html`;
    const back = `${base}?pedido=${o.id}`;
    const pref = {
      items: [{ id: o.id, title: `Pedido #${o.number} · VS Imports`, quantity: 1, currency_id: 'BRL', unit_price: Number(o.total),
        description: o.order_items.map((i: { name: string; qty: number }) => `${i.qty}x ${i.name}`).join(', ').slice(0, 250) }],
      payer: { email: user.email, name: String(o.customer_name || '').slice(0, 60) || undefined },
      external_reference: o.id,
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagamento-webhook`,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
      // sem boleto (demora dias e a reserva é de 48 h); cartão em até 3x
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 3 },
      expires: true, expiration_date_from: new Date().toISOString(), expiration_date_to: expira.toISOString(),
      date_of_expiration: expira.toISOString(),
      statement_descriptor: 'VS IMPORTS',
    };
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(pref),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.init_point) { console.error('mp preference', r.status, JSON.stringify(out).slice(0, 400)); return json({ error: 'mp_falhou' }, 502); }
    await admin.from('orders').update({ mp_preference_id: out.id }).eq('id', o.id);
    return json({ ok: true, url: TOKEN.startsWith('TEST-') ? out.sandbox_init_point || out.init_point : out.init_point });
  } catch (e) {
    console.error(e);
    return json({ error: 'falha_pagamento' }, 500);
  }
});
