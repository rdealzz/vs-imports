-- VS Imports: contas, catálogo, estoque, pedidos do site e do balcão,
-- cupom de 5% na primeira compra e controle financeiro (custo, despesas, lucro).
-- Regras de dinheiro rodam no banco: o navegador nunca decide preço ou desconto.

-- ===================================================================== perfis
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  marketing_opt_in boolean not null default false,
  role text not null default 'cliente' check (role in ('cliente', 'vendedor', 'dono')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('vendedor', 'dono'));
$$;
create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'dono');
$$;

create policy "perfil: o próprio ou a equipe lê" on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_staff()));
create policy "perfil: o próprio atualiza" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- o cliente altera só nome, telefone e opt-in; o papel muda só pela função set_role
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, marketing_opt_in) on public.profiles to authenticated;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 120), left(new.raw_user_meta_data ->> 'phone', 30));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==================================================================== catálogo
create table public.products (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  category text not null check (category in ('camisetas', 'bones', 'tenis', 'bermudas', 'acessorios')),
  model text not null default 'tee' check (model in ('tee', 'cap', 'shoe', 'shorts')),
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  stock int, -- null = estoque não controlado
  sizes text[] not null default '{}',
  colors jsonb not null default '[]', -- [{"n": "Preto", "c": "#28282b", "a": "#f1ede4"}]
  image_url text,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create policy "produtos: todos leem os ativos, equipe lê todos" on public.products for select to anon, authenticated
  using (active or (select public.is_staff()));
create policy "produtos: equipe altera" on public.products for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "produtos: dono cadastra" on public.products for insert to authenticated
  with check ((select public.is_owner()));
-- estoque só muda pelas funções (venda, entrada, ajuste, cancelamento): fica tudo no histórico
revoke update on public.products from authenticated, anon;
grant update (name, description, price, category, model, sizes, colors, image_url, featured, active, updated_at) on public.products to authenticated;

-- o site consulta disponibilidade aqui (esgotado quando o estoque controlado chega a zero)
create view public.product_availability with (security_invoker = on) as
  select id, price, stock, (stock is null or stock > 0) as available from public.products where active;
grant select on public.product_availability to anon, authenticated;

-- custo de compra: tabela separada, só a equipe vê (nunca vai para o cliente)
create table public.product_costs (
  product_id text primary key references public.products (id) on delete cascade,
  cost numeric(10,2) not null default 0 check (cost >= 0),
  supplier text,
  updated_at timestamptz not null default now()
);
alter table public.product_costs enable row level security;
create policy "custos: equipe lê" on public.product_costs for select to authenticated using ((select public.is_staff()));
create policy "custos: dono grava" on public.product_costs for insert to authenticated with check ((select public.is_owner()));
create policy "custos: dono altera" on public.product_costs for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- entradas e ajustes de estoque (histórico)
create table public.stock_moves (
  id bigint generated always as identity primary key,
  product_id text not null references public.products (id) on delete cascade,
  qty int not null, -- positivo = entrada, negativo = saída/ajuste
  reason text not null check (reason in ('compra', 'ajuste', 'venda', 'devolucao')),
  unit_cost numeric(10,2),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_moves_product_idx on public.stock_moves (product_id);
create index stock_moves_created_by_idx on public.stock_moves (created_by);
alter table public.stock_moves enable row level security;
create policy "estoque: equipe lê" on public.stock_moves for select to authenticated using ((select public.is_staff()));

-- ====================================================================== cupons
create table public.coupons (
  code text primary key,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  first_purchase_only boolean not null default false,
  active boolean not null default true,
  description text
);
alter table public.coupons enable row level security;
create policy "cupons: equipe lê" on public.coupons for select to authenticated using ((select public.is_staff()));
insert into public.coupons (code, percent, first_purchase_only, description)
values ('PRIMEIRA5', 5, true, '5% de desconto na primeira compra');

-- ===================================================================== pedidos
create type public.order_status as enum ('pendente', 'pago', 'separado', 'entregue', 'cancelado');
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  user_id uuid references auth.users (id) on delete set null, -- vazio em venda de balcão sem cadastro
  channel text not null default 'site' check (channel in ('site', 'loja', 'instagram', 'whatsapp')),
  payment text check (payment in ('pix', 'credito', 'debito', 'dinheiro')),
  customer_name text,
  customer_phone text,
  created_by uuid references auth.users (id) on delete set null,
  status public.order_status not null default 'pendente',
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  coupon_code text references public.coupons (code),
  delivery text not null default 'retirada' check (delivery in ('retirada', 'entrega')),
  notes text,
  created_at timestamptz not null default now()
);
create index orders_user_id_idx on public.orders (user_id);
create index orders_created_by_idx on public.orders (created_by);
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_coupon_idx on public.orders (coupon_code);

-- cada item guarda preço e custo do momento da venda (o lucro histórico não muda)
create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id),
  name text not null,
  color text,
  size text,
  qty int not null check (qty between 1 and 20),
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) not null default 0
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy "pedidos: cliente lê os seus, equipe lê todos" on public.orders for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_staff()));
create policy "pedidos: equipe atualiza" on public.orders for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
revoke update on public.orders from authenticated, anon;
grant update (status, notes) on public.orders to authenticated; -- valores nunca mudam depois de criados
create policy "itens: cliente lê os seus, equipe lê todos" on public.order_items for select to authenticated
  using ((select public.is_staff()) or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
-- o custo do item não vai para o cliente
revoke select on public.order_items from authenticated, anon;
grant select (id, order_id, product_id, name, color, size, qty, unit_price) on public.order_items to authenticated;

-- ==================================================================== despesas
create table public.expenses (
  id bigint generated always as identity primary key,
  spent_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  category text not null check (category in ('aluguel', 'energia', 'agua', 'internet', 'salarios', 'impostos', 'marketing', 'manutencao', 'taxas', 'outros')),
  description text,
  amount numeric(10,2) not null check (amount > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_spent_on_idx on public.expenses (spent_on);
create index expenses_created_by_idx on public.expenses (created_by);
alter table public.expenses enable row level security;
create policy "despesas: dono lê" on public.expenses for select to authenticated using ((select public.is_owner()));
create policy "despesas: dono lança" on public.expenses for insert to authenticated with check ((select public.is_owner()));
create policy "despesas: dono altera" on public.expenses for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "despesas: dono apaga" on public.expenses for delete to authenticated using ((select public.is_owner()));

-- ================================================================== regras
create function public.first_purchase_eligible() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and not exists (
    select 1 from public.orders o where o.user_id = (select auth.uid()) and o.status <> 'cancelado');
$$;

-- grava os itens (preço e custo do banco) e baixa o estoque; uso interno
create function public._write_items(p_order uuid, items jsonb, p_by uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  p public.products;
  q int;
  sub numeric(10,2) := 0;
begin
  for it in select * from jsonb_array_elements(items) loop
    -- trava a linha do produto: duas vendas simultâneas não vendem a mesma peça
    select * into p from public.products where id = it ->> 'id' for update;
    if not found then raise exception 'produto_inexistente: %', it ->> 'id' using errcode = '22023'; end if;
    q := coalesce((it ->> 'qty')::int, 0);
    if q < 1 or q > 20 then raise exception 'quantidade_invalida' using errcode = '22023'; end if;
    if p.stock is not null and p.stock < q then
      raise exception 'estoque_insuficiente: % (restam %)', p.name, greatest(p.stock, 0) using errcode = 'P0001';
    end if;
    insert into public.order_items (order_id, product_id, name, color, size, qty, unit_price, unit_cost)
    values (p_order, p.id, p.name, left(it ->> 'color', 40), left(it ->> 'size', 10), q, p.price,
            coalesce((select c.cost from public.product_costs c where c.product_id = p.id), 0));
    if p.stock is not null then
      update public.products set stock = stock - q, updated_at = now() where id = p.id;
      insert into public.stock_moves (product_id, qty, reason, created_by) values (p.id, -q, 'venda', p_by);
    end if;
    sub := sub + p.price * q;
  end loop;
  return sub;
end $$;

-- pedido do site: exige login, aplica 5% na primeira compra
-- items: [{"id": "camiseta-vs-classic", "qty": 1, "color": "Preto", "size": "M"}]
create function public.place_order(items jsonb, p_delivery text default 'retirada', p_notes text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  sub numeric(10,2);
  disc numeric(10,2) := 0;
  pct numeric;
  first boolean;
  o public.orders;
begin
  if uid is null then raise exception 'login_required' using errcode = '28000'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 30 then
    raise exception 'itens_invalidos' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(items) x left join public.products p on p.id = x ->> 'id' where p.id is null or not p.active) then
    raise exception 'produto_indisponivel' using errcode = '22023';
  end if;
  -- trava por cliente: dois pedidos ao mesmo tempo não levam o desconto duas vezes
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  first := public.first_purchase_eligible();
  insert into public.orders (user_id, channel, subtotal, discount, total, delivery, notes)
  values (uid, 'site', 0, 0, 0, case when p_delivery = 'entrega' then 'entrega' else 'retirada' end, left(p_notes, 500))
  returning * into o;
  sub := public._write_items(o.id, items, uid);
  if first then
    select percent into pct from public.coupons where code = 'PRIMEIRA5' and active;
    if pct is not null then disc := round(sub * pct / 100, 2); end if;
  end if;
  update public.orders set subtotal = sub, discount = disc, total = sub - disc,
    coupon_code = case when disc > 0 then 'PRIMEIRA5' end
  where id = o.id returning * into o;
  return o;
end $$;

-- venda no balcão (PDV): equipe registra em um passo, já paga
create function public.register_store_sale(items jsonb, p_payment text, p_customer_name text default null,
  p_customer_phone text default null, p_customer_id uuid default null, p_discount_percent numeric default 0,
  p_channel text default 'loja', p_delivery text default 'retirada', p_notes text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  staff uuid := (select auth.uid());
  sub numeric(10,2);
  disc numeric(10,2);
  max_pct numeric;
  pct numeric := coalesce(p_discount_percent, 0);
  code text;
  o public.orders;
begin
  if not public.is_staff() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_payment is null or p_payment not in ('pix', 'credito', 'debito', 'dinheiro') then raise exception 'pagamento_invalido' using errcode = '22023'; end if;
  if p_channel is null or p_channel not in ('loja', 'instagram', 'whatsapp') then raise exception 'canal_invalido' using errcode = '22023'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 50 then
    raise exception 'itens_invalidos' using errcode = '22023';
  end if;
  -- desconto manual: vendedor até 10%, dono até 30%
  max_pct := 10;
  if public.is_owner() then max_pct := 30; end if;
  if pct < 0 or pct > max_pct then raise exception 'desconto_acima_do_limite' using errcode = '22023'; end if;
  if p_customer_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0)); end if;
  insert into public.orders (user_id, channel, payment, customer_name, customer_phone, created_by, status, subtotal, discount, total, delivery, notes)
  values (p_customer_id, p_channel, p_payment, left(p_customer_name, 120), left(p_customer_phone, 30), staff, 'pago', 0, 0, 0,
          case when p_delivery = 'entrega' then 'entrega' else 'retirada' end, left(p_notes, 500))
  returning * into o;
  sub := public._write_items(o.id, items, staff);
  disc := round(sub * pct / 100, 2);
  -- cliente com conta e sem compras anteriores: no mínimo os 5% da primeira compra
  if p_customer_id is not null and not exists (
      select 1 from public.orders where user_id = p_customer_id and status <> 'cancelado' and id <> o.id) then
    if disc < round(sub * 0.05, 2) then disc := round(sub * 0.05, 2); code := 'PRIMEIRA5'; end if;
  end if;
  update public.orders set subtotal = sub, discount = disc, total = sub - disc, coupon_code = code
  where id = o.id returning * into o;
  return o;
end $$;

-- cancelar devolve o estoque
create function public.cancel_order(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  if not public.is_staff() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'pedido_inexistente' using errcode = '22023'; end if;
  if o.status = 'cancelado' then return o; end if;
  update public.products p set stock = p.stock + i.qty, updated_at = now()
  from public.order_items i where i.order_id = o.id and p.id = i.product_id and p.stock is not null;
  insert into public.stock_moves (product_id, qty, reason, created_by)
  select i.product_id, i.qty, 'devolucao', (select auth.uid()) from public.order_items i
  join public.products p on p.id = i.product_id where i.order_id = o.id and p.stock is not null;
  update public.orders set status = 'cancelado' where id = o.id returning * into o;
  return o;
end $$;

-- entrada de mercadoria: soma ao estoque e atualiza o custo (média ponderada)
create function public.stock_entry(p_product text, p_qty int, p_unit_cost numeric, p_note text default null)
returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  p public.products;
  old_cost numeric;
  old_qty int;
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_qty is null or p_qty < 1 or p_unit_cost is null or p_unit_cost < 0 then raise exception 'entrada_invalida' using errcode = '22023'; end if;
  select * into p from public.products where id = p_product for update;
  if not found then raise exception 'produto_inexistente' using errcode = '22023'; end if;
  select cost into old_cost from public.product_costs where product_id = p.id;
  old_qty := greatest(coalesce(p.stock, 0), 0);
  insert into public.product_costs (product_id, cost, updated_at)
  values (p.id, case when old_cost is null or old_qty = 0 then p_unit_cost
                     else round((old_cost * old_qty + p_unit_cost * p_qty) / (old_qty + p_qty), 2) end, now())
  on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  update public.products set stock = coalesce(stock, 0) + p_qty, updated_at = now() where id = p.id returning * into p;
  insert into public.stock_moves (product_id, qty, reason, unit_cost, note, created_by)
  values (p.id, p_qty, 'compra', p_unit_cost, left(p_note, 200), (select auth.uid()));
  return p;
end $$;

-- ajuste de estoque (contagem física, perda, controle desligado com null)
create function public.stock_set(p_product text, p_stock int, p_note text default null)
returns public.products
language plpgsql security definer set search_path = '' as $$
declare p public.products;
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_stock is not null and p_stock < 0 then raise exception 'estoque_invalido' using errcode = '22023'; end if;
  select * into p from public.products where id = p_product for update;
  if not found then raise exception 'produto_inexistente' using errcode = '22023'; end if;
  if p_stock is not null then
    insert into public.stock_moves (product_id, qty, reason, note, created_by)
    values (p.id, p_stock - coalesce(p.stock, 0), 'ajuste', left(p_note, 200), (select auth.uid()));
  end if;
  update public.products set stock = p_stock, updated_at = now() where id = p.id returning * into p;
  return p;
end $$;

-- dono promove/rebaixa a equipe
create function public.set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_role not in ('cliente', 'vendedor', 'dono') then raise exception 'papel_invalido' using errcode = '22023'; end if;
  if p_user = (select auth.uid()) and p_role <> 'dono' then raise exception 'nao_pode_rebaixar_a_si_mesmo' using errcode = '22023'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

-- ================================================================ financeiro
-- resumo do período (datas no fuso de São Paulo). Lucro bruto = vendas - custo
-- das peças; lucro líquido = lucro bruto - despesas do período.
create function public.finance_summary(p_from date, p_to date)
returns table (orders bigint, items_sold bigint, revenue numeric, discounts numeric, cogs numeric,
               gross_profit numeric, gross_margin numeric, expenses numeric, net_profit numeric,
               ticket numeric, site_revenue numeric, store_revenue numeric, pending_orders bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  with o as (
    select * from public.orders
    where status <> 'cancelado' and (created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  ), i as (
    select sum(it.qty) as qty, sum(it.qty * it.unit_cost) as cost from public.order_items it join o on o.id = it.order_id
  ), e as (
    select coalesce(sum(amount), 0) as amount from public.expenses where spent_on between p_from and p_to
  )
  select count(o.*)::bigint,
         coalesce((select qty from i), 0)::bigint,
         coalesce(sum(o.total), 0),
         coalesce(sum(o.discount), 0),
         coalesce((select cost from i), 0),
         coalesce(sum(o.total), 0) - coalesce((select cost from i), 0),
         case when coalesce(sum(o.total), 0) > 0
              then round((coalesce(sum(o.total), 0) - coalesce((select cost from i), 0)) / sum(o.total) * 100, 1) else 0 end,
         (select amount from e),
         coalesce(sum(o.total), 0) - coalesce((select cost from i), 0) - (select amount from e),
         coalesce(round(avg(o.total), 2), 0),
         coalesce(sum(o.total) filter (where o.channel = 'site'), 0),
         coalesce(sum(o.total) filter (where o.channel in ('loja', 'instagram', 'whatsapp')), 0),
         (select count(*) from public.orders po where po.status = 'pendente')::bigint
  from o;
end $$;

-- série dia a dia para o gráfico
create function public.finance_daily(p_from date, p_to date)
returns table (day date, revenue numeric, cogs numeric, expenses numeric, net_profit numeric, orders bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  with d as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  s as (
    select (o.created_at at time zone 'America/Sao_Paulo')::date as day, sum(o.total) as revenue, count(*) as orders
    from public.orders o where o.status <> 'cancelado'
      and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to group by 1
  ), c as (
    select (o.created_at at time zone 'America/Sao_Paulo')::date as day, sum(it.qty * it.unit_cost) as cogs
    from public.orders o join public.order_items it on it.order_id = o.id
    where o.status <> 'cancelado' and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to group by 1
  ), x as (
    select spent_on as day, sum(amount) as amount from public.expenses where spent_on between p_from and p_to group by 1
  )
  select d.day, coalesce(s.revenue, 0), coalesce(c.cogs, 0), coalesce(x.amount, 0),
         coalesce(s.revenue, 0) - coalesce(c.cogs, 0) - coalesce(x.amount, 0), coalesce(s.orders, 0)::bigint
  from d left join s using (day) left join c using (day) left join x using (day) order by d.day;
end $$;

-- mais vendidos do período, com lucro por produto
create function public.top_products(p_from date, p_to date, p_limit int default 10)
returns table (product_id text, name text, qty bigint, revenue numeric, profit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select it.product_id, max(it.name), sum(it.qty)::bigint, sum(it.qty * it.unit_price), sum(it.qty * (it.unit_price - it.unit_cost))
  from public.order_items it join public.orders o on o.id = it.order_id
  where o.status <> 'cancelado' and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  group by it.product_id order by 3 desc limit least(greatest(p_limit, 1), 50);
end $$;

-- ================================================================== permissões
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public._write_items(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated; -- usada na política pública de produtos
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;
revoke all on function public.first_purchase_eligible() from public;
grant execute on function public.first_purchase_eligible() to anon, authenticated;
revoke all on function public.place_order(jsonb, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text) to authenticated;
revoke all on function public.register_store_sale(jsonb, text, text, text, uuid, numeric, text, text, text) from public, anon;
grant execute on function public.register_store_sale(jsonb, text, text, text, uuid, numeric, text, text, text) to authenticated;
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;
revoke all on function public.stock_entry(text, int, numeric, text) from public, anon;
grant execute on function public.stock_entry(text, int, numeric, text) to authenticated;
revoke all on function public.stock_set(text, int, text) from public, anon;
grant execute on function public.stock_set(text, int, text) to authenticated;
revoke all on function public.set_role(uuid, text) from public, anon;
grant execute on function public.set_role(uuid, text) to authenticated;
revoke all on function public.finance_summary(date, date) from public, anon;
grant execute on function public.finance_summary(date, date) to authenticated;
revoke all on function public.finance_daily(date, date) from public, anon;
grant execute on function public.finance_daily(date, date) to authenticated;
revoke all on function public.top_products(date, date, int) from public, anon;
grant execute on function public.top_products(date, date, int) to authenticated;
