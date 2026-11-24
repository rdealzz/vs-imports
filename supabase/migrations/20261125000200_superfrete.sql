-- SuperFrete: peso/medidas das peças, cotações seguras e dados de envio no pedido.

-- peso (kg) e medidas (cm) por peça; sem valor, vale o padrão da linha
alter table public.products add column if not exists weight_kg numeric(6,3) check (weight_kg > 0),
  add column if not exists height_cm numeric(6,1) check (height_cm > 0),
  add column if not exists width_cm numeric(6,1) check (width_cm > 0),
  add column if not exists length_cm numeric(6,1) check (length_cm > 0);
grant update (weight_kg, height_cm, width_cm, length_cm) on public.products to authenticated;

create or replace function public.package_dims(p public.products, out weight numeric, out height numeric, out width numeric, out length numeric)
language sql stable set search_path = '' as $$
  select coalesce(p.weight_kg, d.w), coalesce(p.height_cm, d.h), coalesce(p.width_cm, d.wi), coalesce(p.length_cm, d.l)
  from (select case p.category
      when 'camisetas' then 0.30 when 'polos' then 0.35 when 'bermudas' then 0.40 when 'calcas' then 0.70
      when 'conjuntos' then 0.90 when 'inverno' then 0.90 when 'bones' then 0.25 when 'calcados' then 1.20 else 0.30 end w,
    case p.category when 'calcados' then 12 when 'bones' then 12 when 'inverno' then 8 when 'conjuntos' then 8 else 4 end h,
    case p.category when 'calcados' then 20 when 'bones' then 20 else 25 end wi,
    case p.category when 'calcados' then 32 when 'bones' then 25 else 30 end l) d
$$;

-- cotações feitas no servidor (o cliente não consegue mudar o preço do frete)
create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  cep text not null check (cep ~ '^\d{8}$'),
  subtotal numeric(10,2) not null,
  service int not null,
  service_name text not null,
  company text,
  price numeric(10,2) not null check (price >= 0),
  days int,
  volume jsonb,
  source text not null default 'superfrete' check (source in ('superfrete', 'tabela')),
  created_at timestamptz not null default now()
);
create index if not exists shipping_quotes_user_idx on public.shipping_quotes (user_id, created_at desc);
alter table public.shipping_quotes enable row level security;
create policy "cotações: dono da cotação lê" on public.shipping_quotes for select to authenticated using ((select auth.uid()) = user_id or (select public.is_owner()));
grant select on public.shipping_quotes to authenticated;

-- dados do envio no pedido
alter table public.orders add column if not exists customer_document text check (customer_document ~ '^\d{11}$|^\d{14}$'),
  add column if not exists shipping_service int,
  add column if not exists shipping_service_name text,
  add column if not exists shipping_days int,
  add column if not exists shipping_volume jsonb,
  add column if not exists superfrete_id text,
  add column if not exists tracking_code text,
  add column if not exists label_url text,
  add column if not exists shipping_status text;
grant select (customer_document, shipping_service, shipping_service_name, shipping_days, superfrete_id, tracking_code, label_url, shipping_status) on public.orders to authenticated;

-- valida CPF (dígitos verificadores)
create or replace function public.cpf_valid(c text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(c, ''), '\D', '', 'g'); s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if; if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if; return r = substr(d, 11, 1)::int;
end $$;

-- pedido com a cotação escolhida (frete grátis continua acima do valor do painel)
create or replace function public.place_order(items jsonb, p_delivery text default 'retirada', p_notes text default null, p_address_id bigint default null,
  p_quote_id uuid default null, p_document text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  me public.profiles;
  addr jsonb;
  q public.shipping_quotes;
  doc text := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
  sub numeric(10,2); disc numeric(10,2) := 0; pct numeric; first boolean; ship numeric(10,2) := 0;
  m numeric := (select free_shipping_min from public.store_settings limit 1);
  o public.orders;
begin
  if uid is null then raise exception 'login_required' using errcode = '28000'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 30 then
    raise exception 'itens_invalidos' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(items) x left join public.products p on p.id = x ->> 'id' where p.id is null or not p.active) then
    raise exception 'produto_indisponivel' using errcode = '22023';
  end if;
  select * into me from public.profiles where id = uid;
  if p_delivery = 'entrega' then
    select to_jsonb(a) - 'user_id' - 'id' - 'created_at' - 'is_default' into addr from public.addresses a where a.id = p_address_id and a.user_id = uid;
    if addr is null then raise exception 'endereco_obrigatorio' using errcode = '22023'; end if;
    if doc is null or not public.cpf_valid(doc) then raise exception 'cpf_invalido' using errcode = '22023'; end if;
    if p_quote_id is not null then
      select * into q from public.shipping_quotes where id = p_quote_id and user_id = uid and created_at > now() - interval '2 hours';
      if q.id is null or q.cep <> addr ->> 'cep' then raise exception 'frete_expirado' using errcode = '22023'; end if;
    end if;
  end if;
  if (select count(*) from public.orders where user_id = uid and status = 'pendente') >= 5 then
    raise exception 'muitos_pedidos_pendentes' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if me.phone_norm is not null then perform pg_advisory_xact_lock(hashtextextended(me.phone_norm, 1)); end if;
  first := public.first_purchase_eligible();
  insert into public.orders (user_id, channel, subtotal, discount, total, delivery, notes, customer_name, customer_phone, shipping_address, customer_document)
  values (uid, 'site', 0, 0, 0, case when p_delivery = 'entrega' then 'entrega' else 'retirada' end, left(p_notes, 500),
          me.full_name, me.phone, addr, case when p_delivery = 'entrega' then doc end)
  returning * into o;
  sub := public._write_items(o.id, items, uid);
  if first then
    select percent into pct from public.coupons where code = 'PRIMEIRA5' and active;
    if pct is not null then disc := round(sub * pct / 100, 2); end if;
  end if;
  if p_delivery = 'entrega' then
    if q.id is not null then ship := case when sub >= m then 0 else q.price end;
    else select z.price into ship from public.shipping_quote(addr ->> 'cep', sub) z; ship := coalesce(ship, 0);
    end if;
  end if;
  update public.orders set subtotal = sub, discount = disc, shipping = ship, total = sub - disc + ship,
         coupon_code = case when disc > 0 then 'PRIMEIRA5' end,
         shipping_service = q.service, shipping_service_name = q.service_name, shipping_days = q.days, shipping_volume = q.volume
  where id = o.id returning * into o;
  return o;
end $$;
drop function if exists public.place_order(jsonb, text, text, bigint);
revoke all on function public.place_order(jsonb, text, text, bigint, uuid, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, bigint, uuid, text) to authenticated;

-- remetente das etiquetas (endereço da loja) e medidas em lote para a cotação
alter table public.store_settings add column if not exists sender jsonb;
grant update (sender) on public.store_settings to authenticated;
create or replace function public.package_dims_many(p_ids text[])
returns table (id text, weight numeric, height numeric, width numeric, length numeric)
language sql stable security definer set search_path = '' as $$
  select p.id, d.weight, d.height, d.width, d.length from public.products p, lateral public.package_dims(p) d where p.id = any(p_ids)
$$;
revoke all on function public.package_dims_many(text[]) from public, anon, authenticated;
