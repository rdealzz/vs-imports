// Avisos da SuperFrete (etiqueta gerada, postada, entregue, cancelada).
// Não confia no conteúdo do aviso: usa só o id e consulta a SuperFrete direto para saber o status real.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SF_URL = Deno.env.get('SUPERFRETE_URL') || 'https://sandbox.superfrete.com';
const SF_TOKEN = Deno.env.get('SUPERFRETE_TOKEN') || '';
const SF_UA = Deno.env.get('SUPERFRETE_UA') || 'VS Imports 1.0 (contato@vsimports.com.br)';
const STATUS: Record<string, string> = { posted: 'entregue', delivered: 'entregue' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.data?.id || '').slice(0, 80);
    if (!id || !SF_TOKEN) return new Response('ignorado', { status: 200 });
    const r = await fetch(`${SF_URL}/api/v0/order/info/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${SF_TOKEN}`, 'User-Agent': SF_UA, accept: 'application/json' } });
    if (!r.ok) return new Response('desconhecido', { status: 200 });
    const info = await r.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const upd: Record<string, unknown> = { shipping_status: info.status };
    if (info.tracking) upd.tracking_code = info.tracking;
    // entregue no destino: o pedido vira "entregue"
    if (info.status === 'delivered') upd.status = STATUS.delivered;
    await admin.from('orders').update(upd).eq('superfrete_id', id);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response('erro', { status: 200 });
  }
});
