// Avisos do Mercado Pago. Não confia no conteúdo do aviso: pega só o id do pagamento e consulta
// o Mercado Pago direto. Pagamento aprovado + valor certo + pedido pendente => pedido "pago".
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || '';
const TYPE: Record<string, string> = { credit_card: 'credito', debit_card: 'debito', prepaid_card: 'debito', bank_transfer: 'pix', account_money: 'pix' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const type = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic');
    const id = String(body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '').replace(/\D/g, '').slice(0, 30);
    if (type !== 'payment' || !id || !TOKEN) return new Response('ignorado', { status: 200 });

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) return new Response('desconhecido', { status: 200 });
    const p = await r.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: o } = await admin.from('orders').select('id, status, total, notes, mp_payment_id').eq('id', String(p.external_reference || '')).maybeSingle();
    if (!o) return new Response('sem pedido', { status: 200 });
    // pedido já resolvido por outro pagamento: não sobrescreve; se for um 2º pagamento aprovado, avisa a loja
    if (o.status !== 'pendente' && o.mp_payment_id && o.mp_payment_id !== String(p.id)) {
      if (p.status === 'approved' && !String(o.notes || '').includes(String(p.id))) {
        await admin.from('orders').update({ notes: [o.notes, `ATENÇÃO: pagamento ${p.id} em duplicidade. Estorne no Mercado Pago.`].filter(Boolean).join(' · ') }).eq('id', o.id);
      }
      return new Response('ok', { status: 200 });
    }

    const upd: Record<string, unknown> = { mp_payment_id: String(p.id), mp_status: p.status };
    const valorOk = Number(p.transaction_amount) + 0.01 >= Number(o.total);
    if (p.status === 'approved') {
      if (o.status === 'pendente' && valorOk) {
        Object.assign(upd, { status: 'pago', paid_at: p.date_approved || new Date().toISOString(), payment: TYPE[p.payment_type_id] || 'pix' });
      } else if (o.status === 'cancelado') {
        upd.notes = [o.notes, `ATENÇÃO: pagamento ${p.id} aprovado depois do pedido expirar. Confira o estoque ou estorne no Mercado Pago.`].filter(Boolean).join(' · ');
      } else if (!valorOk) {
        upd.notes = [o.notes, `ATENÇÃO: pagamento ${p.id} com valor diferente do pedido. Confira no Mercado Pago.`].filter(Boolean).join(' · ');
      }
    }
    await admin.from('orders').update(upd).eq('id', o.id);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response('erro', { status: 200 });
  }
});
