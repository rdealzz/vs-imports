-- Frete por CEP (tabela por faixa, saindo de Curitiba) e frete grátis acima de um valor.
-- Os valores são definidos pelo dono no painel (Ajustes) e o banco é quem calcula:
-- o site mostra a estimativa e o pedido grava o valor oficial.
alter table public.store_settings add column if not exists free_shipping_min numeric(10,2) not null default 349.90 check (free_shipping_min >= 0);
grant update (free_shipping_min) on public.store_settings to authenticated;

create table public.shipping_zones (
  id smallint generated always as identity primary key,
  name text not null check (length(name) <= 60),
  cep_from int not null check (cep_from between 0 and 99999999),
  cep_to int not null check (cep_to between cep_from and 99999999),
  price numeric(10,2) not null check (price >= 0),
  days text not null default '' check (length(days) <= 40),
  sort smallint not null default 0
);
alter table public.shipping_zones enable row level security;
create policy "frete: todos leem" on public.shipping_zones for select to anon, authenticated using (true);
create policy "frete: dono altera" on public.shipping_zones for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
grant select on public.shipping_zones to anon, authenticated;
grant update (price, days) on public.shipping_zones to authenticated;

insert into public.shipping_zones (name, cep_from, cep_to, price, days, sort) values
  ('Curitiba',                        80000000, 82999999, 15.00, '1 a 2 dias úteis', 1),
  ('Região metropolitana e Paraná',   83000000, 87999999, 25.00, '2 a 4 dias úteis', 2),
  ('Santa Catarina',                  88000000, 89999999, 30.00, '3 a 5 dias úteis', 3),
  ('São Paulo',                       1000000, 19999999, 32.00, '3 a 6 dias úteis', 4),
  ('Rio Grande do Sul',               90000000, 99999999, 35.00, '4 a 7 dias úteis', 5),
  ('Rio de Janeiro e Espírito Santo', 20000000, 29999999, 38.00, '4 a 7 dias úteis', 6),
  ('Minas Gerais',                    30000000, 39999999, 38.00, '4 a 7 dias úteis', 7),
  ('Centro-Oeste e Tocantins',        70000000, 79999999, 42.00, '5 a 8 dias úteis', 8),
  ('Nordeste',                        40000000, 65999999, 48.00, '6 a 10 dias úteis', 9),
  ('Norte',                           66000000, 69999999, 55.00, '7 a 12 dias úteis', 10);

-- cotação: qualquer visitante pode consultar (só devolve preço/prazo)
create function public.shipping_quote(p_cep text, p_subtotal numeric default 0)
returns table (zone text, price numeric, days text, free boolean, free_min numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare c int := nullif(regexp_replace(coalesce(p_cep, ''), '\D', '', 'g'), '')::int; m numeric := (select free_shipping_min from public.store_settings limit 1);
begin
  if c is null or length(regexp_replace(p_cep, '\D', '', 'g')) <> 8 then raise exception 'cep_invalido' using errcode = '22023'; end if;
  return query
  select z.name, case when coalesce(p_subtotal, 0) >= m then 0::numeric else z.price end, z.days, coalesce(p_subtotal, 0) >= m, m
  from public.shipping_zones z where c between z.cep_from and z.cep_to order by z.sort limit 1;
end $$;
grant execute on function public.shipping_quote(text, numeric) to anon, authenticated;

-- o pedido passa a guardar o frete e somá-lo ao total
alter table public.orders add column if not exists shipping numeric(10,2) not null default 0 check (shipping >= 0);
grant select (shipping) on public.orders to authenticated;

create or replace function public.place_order(items jsonb, p_delivery text default 'retirada', p_notes text default null, p_address_id bigint default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  me public.profiles;
  addr jsonb;
  sub numeric(10,2); disc numeric(10,2) := 0; pct numeric; first boolean; ship numeric(10,2) := 0;
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
  end if;
  if (select count(*) from public.orders where user_id = uid and status = 'pendente') >= 5 then
    raise exception 'muitos_pedidos_pendentes' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if me.phone_norm is not null then perform pg_advisory_xact_lock(hashtextextended(me.phone_norm, 1)); end if;
  first := public.first_purchase_eligible();
  insert into public.orders (user_id, channel, subtotal, discount, total, delivery, notes, customer_name, customer_phone, shipping_address)
  values (uid, 'site', 0, 0, 0, case when p_delivery = 'entrega' then 'entrega' else 'retirada' end, left(p_notes, 500),
          me.full_name, me.phone, addr)
  returning * into o;
  sub := public._write_items(o.id, items, uid);
  if first then
    select percent into pct from public.coupons where code = 'PRIMEIRA5' and active;
    if pct is not null then disc := round(sub * pct / 100, 2); end if;
  end if;
  if p_delivery = 'entrega' then
    select q.price into ship from public.shipping_quote(addr ->> 'cep', sub) q;
    ship := coalesce(ship, 0);
  end if;
  update public.orders set subtotal = sub, discount = disc, shipping = ship, total = sub - disc + ship,
         coupon_code = case when disc > 0 then 'PRIMEIRA5' end
  where id = o.id returning * into o;
  return o;
end $$;
revoke all on function public.place_order(jsonb, text, text, bigint) from public, anon;
grant execute on function public.place_order(jsonb, text, text, bigint) to authenticated;

-- valor do frete grátis (para a barra "faltam R$ X" na sacola)
create function public.shipping_free_min() returns numeric
language sql stable security definer set search_path = '' as $$ select free_shipping_min from public.store_settings limit 1 $$;
grant execute on function public.shipping_free_min() to anon, authenticated;
