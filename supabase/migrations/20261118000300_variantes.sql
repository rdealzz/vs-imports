-- variantes (cor + tamanho) com estoque próprio. O estoque do produto vira a
-- soma das variantes; a peça só esgota quando todas zeram.

-- promoção: preço normal (price) e promocional (promo_price) até promo_until (opcional)
alter table public.products add column promo_price numeric(10,2) check (promo_price >= 0),
  add column promo_until timestamptz,
  add constraint promo_menor_que_preco check (promo_price is null or promo_price < price);
grant update (promo_price, promo_until) on public.products to authenticated;

create function public.effective_price(p public.products) returns numeric
language sql stable set search_path = '' as $$
  select case when p.promo_price is not null and (p.promo_until is null or p.promo_until > now()) then p.promo_price else p.price end;
$$;

create table public.product_variants (
  id bigint generated always as identity primary key,
  product_id text not null references public.products (id) on delete cascade,
  color text not null default '',
  size text not null default '',
  stock int not null default 0 check (stock >= 0),
  sku text unique,
  unique (product_id, color, size)
);
create index product_variants_product_idx on public.product_variants (product_id);
alter table public.product_variants enable row level security;
create policy "variantes: todos leem" on public.product_variants for select to anon, authenticated using (true);
-- escrita só pelas funções (venda, entrada, ajuste, cancelamento)
revoke insert, update, delete on public.product_variants from authenticated, anon;

alter table public.order_items add column variant_id bigint references public.product_variants (id) on delete set null;
create index order_items_variant_idx on public.order_items (variant_id);
grant select (variant_id) on public.order_items to authenticated;
alter table public.stock_moves add column variant_id bigint references public.product_variants (id) on delete set null;
create index stock_moves_variant_idx on public.stock_moves (variant_id);

-- estoque do produto = soma das variantes
create function public._sync_product_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid text := coalesce(new.product_id, old.product_id);
begin
  update public.products set stock = (select sum(stock) from public.product_variants where product_id = pid), updated_at = now()
  where id = pid;
  return null;
end $$;
create trigger product_variants_sync after insert or update of stock or delete on public.product_variants
  for each row execute function public._sync_product_stock();

-- itens: com variantes, trava e baixa a variante (cor + tamanho)
create or replace function public._write_items(p_order uuid, items jsonb, p_by uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  p public.products;
  v public.product_variants;
  q int;
  col text;
  sz text;
  sub numeric(10,2) := 0;
begin
  for it in select * from jsonb_array_elements(items) loop
    select * into p from public.products where id = it ->> 'id' for update;
    if not found then raise exception 'produto_inexistente: %', it ->> 'id' using errcode = '22023'; end if;
    q := coalesce((it ->> 'qty')::int, 0);
    if q < 1 or q > 20 then raise exception 'quantidade_invalida' using errcode = '22023'; end if;
    col := coalesce(it ->> 'color', ''); sz := coalesce(it ->> 'size', '');
    v := null;
    if exists (select 1 from public.product_variants where product_id = p.id) then
      select * into v from public.product_variants where product_id = p.id and color = col and size = sz for update;
      if not found then raise exception 'variante_inexistente: % % %', p.name, col, sz using errcode = '22023'; end if;
      if v.stock < q then
        raise exception 'estoque_insuficiente: % % % (restam %)', p.name, col, sz, v.stock using errcode = 'P0001';
      end if;
      update public.product_variants set stock = stock - q where id = v.id;
      insert into public.stock_moves (product_id, variant_id, qty, reason, created_by) values (p.id, v.id, -q, 'venda', p_by);
    elsif p.stock is not null then
      if p.stock < q then raise exception 'estoque_insuficiente: % (restam %)', p.name, greatest(p.stock, 0) using errcode = 'P0001'; end if;
      update public.products set stock = stock - q, updated_at = now() where id = p.id;
      insert into public.stock_moves (product_id, qty, reason, created_by) values (p.id, -q, 'venda', p_by);
    end if;
    insert into public.order_items (order_id, product_id, variant_id, name, color, size, qty, unit_price, unit_cost)
    values (p_order, p.id, v.id, p.name, nullif(left(col, 40), ''), nullif(left(sz, 10), ''), q, public.effective_price(p),
            coalesce((select c.cost from public.product_costs c where c.product_id = p.id), 0));
    sub := sub + public.effective_price(p) * q;
  end loop;
  return sub;
end $$;

-- cancelar devolve à variante certa
create or replace function public.cancel_order(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  if not public.is_staff() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'pedido_inexistente' using errcode = '22023'; end if;
  if o.status = 'cancelado' then return o; end if;
  update public.product_variants v set stock = v.stock + x.qty
  from (select variant_id, sum(qty) as qty from public.order_items where order_id = o.id and variant_id is not null group by 1) x
  where v.id = x.variant_id;
  update public.products p set stock = p.stock + x.qty, updated_at = now()
  from (select product_id, sum(qty) as qty from public.order_items where order_id = o.id and variant_id is null group by 1) x
  where p.id = x.product_id and p.stock is not null
    and not exists (select 1 from public.product_variants pv where pv.product_id = p.id);
  insert into public.stock_moves (product_id, variant_id, qty, reason, created_by)
  select i.product_id, i.variant_id, i.qty, 'devolucao', (select auth.uid()) from public.order_items i where i.order_id = o.id;
  update public.orders set status = 'cancelado' where id = o.id returning * into o;
  return o;
end $$;

-- entrada de mercadoria por variante (cria a variante se ainda não existir)
drop function public.stock_entry(text, int, numeric, text);
create function public.stock_entry(p_product text, p_qty int, p_unit_cost numeric, p_note text default null,
  p_color text default '', p_size text default '')
returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  p public.products;
  vid bigint;
  old_cost numeric;
  old_qty int;
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10000 or p_unit_cost is null or p_unit_cost < 0 then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  select * into p from public.products where id = p_product for update;
  if not found then raise exception 'produto_inexistente' using errcode = '22023'; end if;
  select cost into old_cost from public.product_costs where product_id = p.id;
  old_qty := greatest(coalesce(p.stock, 0), 0);
  insert into public.product_costs (product_id, cost, updated_at)
  values (p.id, case when old_cost is null or old_qty = 0 then p_unit_cost
                     else round((old_cost * old_qty + p_unit_cost * p_qty) / (old_qty + p_qty), 2) end, now())
  on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  insert into public.product_variants (product_id, color, size, stock)
  values (p.id, coalesce(p_color, ''), coalesce(p_size, ''), p_qty)
  on conflict (product_id, color, size) do update set stock = public.product_variants.stock + excluded.stock
  returning id into vid;
  insert into public.stock_moves (product_id, variant_id, qty, reason, unit_cost, note, created_by)
  values (p.id, vid, p_qty, 'compra', p_unit_cost, left(p_note, 200), (select auth.uid()));
  select * into p from public.products where id = p.id;
  return p;
end $$;

-- ajuste por contagem física de uma variante
drop function public.stock_set(text, int, text);
create function public.stock_set(p_product text, p_stock int, p_note text default null, p_color text default '', p_size text default '')
returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  p public.products;
  v public.product_variants;
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_stock is null or p_stock < 0 or p_stock > 100000 then raise exception 'estoque_invalido' using errcode = '22023'; end if;
  select * into p from public.products where id = p_product for update;
  if not found then raise exception 'produto_inexistente' using errcode = '22023'; end if;
  select * into v from public.product_variants where product_id = p.id and color = coalesce(p_color, '') and size = coalesce(p_size, '') for update;
  if found then
    insert into public.stock_moves (product_id, variant_id, qty, reason, note, created_by)
    values (p.id, v.id, p_stock - v.stock, 'ajuste', left(p_note, 200), (select auth.uid()));
    update public.product_variants set stock = p_stock where id = v.id;
  else
    insert into public.product_variants (product_id, color, size, stock) values (p.id, coalesce(p_color, ''), coalesce(p_size, ''), p_stock)
    returning * into v;
    insert into public.stock_moves (product_id, variant_id, qty, reason, note, created_by)
    values (p.id, v.id, p_stock, 'ajuste', left(p_note, 200), (select auth.uid()));
  end if;
  select * into p from public.products where id = p.id;
  return p;
end $$;

create or replace view public.product_availability with (security_invoker = on) as
  select p.id, p.price, p.stock, (p.stock is null or p.stock > 0) as available,
         public.effective_price(p) as final_price,
         case when public.effective_price(p) < p.price then p.price end as compare_at,
         p.promo_until
  from public.products p where p.active;

-- disponibilidade pública por variante (o site marca "Esgotado" por cor/tamanho)
create view public.variant_availability with (security_invoker = on) as
  select v.product_id, v.color, v.size, v.stock, v.stock > 0 as available
  from public.product_variants v join public.products p on p.id = v.product_id where p.active;
grant select on public.variant_availability to anon, authenticated;

-- relatório: itens agrupados por peça, com as cores e tamanhos vendidos
create or replace function public.sales_report(p_from date, p_to date)
returns table (number bigint, created_at timestamptz, channel text, status text, payment text, customer text,
               items text, subtotal numeric, discount numeric, total numeric, cost numeric, profit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  with g as (
    select i.order_id, i.name, sum(i.qty) as qty, sum(i.qty * i.unit_cost) as cost,
           string_agg(i.qty || 'x ' || concat_ws(' ', i.color, i.size), ', ' order by i.id) as detail
    from public.order_items i group by i.order_id, i.product_id, i.name
  )
  select o.number, o.created_at, o.channel, o.status::text, o.payment,
         coalesce(o.customer_name, p.full_name, '—'),
         string_agg(g.qty || 'x ' || g.name || ' (' || g.detail || ')', '; ' order by g.name),
         o.subtotal, o.discount, o.total,
         coalesce(sum(g.cost), 0),
         case when o.status = 'cancelado' then 0 else o.total - coalesce(sum(g.cost), 0) end
  from public.orders o
  left join g on g.order_id = o.id
  left join public.profiles p on p.id = o.user_id
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  group by o.id, p.full_name
  order by o.created_at;
end $$;

-- vendas por variante (qual cor/tamanho sai mais)
create function public.top_variants(p_from date, p_to date, p_product text default null)
returns table (product_id text, name text, color text, size text, qty bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select i.product_id, max(i.name), i.color, i.size, sum(i.qty)::bigint, sum(i.qty * i.unit_price)
  from public.order_items i join public.orders o on o.id = i.order_id
  where o.status <> 'cancelado' and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
    and (p_product is null or i.product_id = p_product)
  group by i.product_id, i.color, i.size order by 5 desc;
end $$;

revoke all on function public._sync_product_stock() from public, anon, authenticated;
grant execute on function public.effective_price(public.products) to anon, authenticated;
revoke all on function public.stock_entry(text, int, numeric, text, text, text) from public, anon;
grant execute on function public.stock_entry(text, int, numeric, text, text, text) to authenticated;
revoke all on function public.stock_set(text, int, text, text, text) from public, anon;
grant execute on function public.stock_set(text, int, text, text, text) to authenticated;
revoke all on function public.top_variants(date, date, text) from public, anon;
grant execute on function public.top_variants(date, date, text) to authenticated;
