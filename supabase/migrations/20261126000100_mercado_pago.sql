-- Mercado Pago (Checkout Pro): guarda a preferência e o pagamento de cada pedido do site.
-- Quem marca "pago" é só o servidor (Edge Function pagamento-webhook), depois de consultar o pagamento no Mercado Pago.
alter table public.orders
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text,
  add column if not exists mp_status text,
  add column if not exists paid_at timestamptz;
create index if not exists orders_mp_payment_idx on public.orders (mp_payment_id);
