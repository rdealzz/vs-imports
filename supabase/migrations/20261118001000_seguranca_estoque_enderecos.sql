-- Segurança, estoque obrigatório, contas únicas (anti-abuso do cupom),
-- endereços dos clientes, valor do estoque e pedidos abandonados.

-- =============================================================== permissões
-- O padrão do Supabase dá tudo (inclusive TRUNCATE, que ignora o RLS) para
-- anon/authenticated. Fecha tudo e libera só o que o site usa.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  for t in select viewname from pg_views where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- leitura pública do catálogo
grant select on public.products, public.product_images, public.product_variants to anon, authenticated;
grant select on public.product_availability, public.variant_availability to anon, authenticated;
-- conta do cliente
grant select on public.profiles to authenticated;
grant update (full_name, marketing_opt_in) on public.profiles to authenticated;
-- pedidos (leitura; criação só pelas funções)
grant select on public.orders to authenticated;
grant update (status, notes) on public.orders to authenticated;
grant select (id, order_id, product_id, variant_id, name, color, size, qty, unit_price) on public.order_items to authenticated;
-- painel (as políticas RLS decidem quem pode)
grant select, insert on public.products to authenticated;
grant update (name, description, price, promo_price, promo_until, category, model, sizes, colors, image_url, print, featured, active, updated_at) on public.products to authenticated; -- estoque fora: só muda por venda/compra/ajuste
grant select, insert, update on public.product_costs to authenticated;
grant select on public.stock_moves, public.coupons, public.month_closings to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.product_images to authenticated;
grant select on public.store_settings to authenticated;
grant update (month_start_day, monthly_goal, updated_at) on public.store_settings to authenticated;
-- tabelas novas daqui pra frente não nascem abertas
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ========================================================= estoque obrigatório
-- Sem estoque cadastrado = esgotado. Toda venda baixa estoque, sem exceção.
create or replace view public.product_availability with (security_invoker = on) as
  select p.id, p.price, p.stock, (coalesce(p.stock, 0) > 0) as available,
         public.effective_price(p) as final_price,
         case when public.effective_price(p) < p.price then p.price end as compare_at,
         p.promo_until
  from public.products p where p.active;
grant select on public.product_availability to anon, authenticated;

create or replace function public._write_items(p_order uuid, items jsonb, p_by uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb; p public.products; v public.product_variants; q int; col text; sz text;
  sub numeric(10,2) := 0;
begin
  for it in select * from jsonb_array_elements(items) loop
    select * into p from public.products where id = it ->> 'id' for update;
    if not found then raise exception 'produto_inexistente: %', it ->> 'id' using errcode = '22023'; end if;
    q := coalesce((it ->> 'qty')::int, 0);
    if q < 1 or q > 20 then raise exception 'quantidade_invalida' using errcode = '22023'; end if;
    col := coalesce(it ->> 'color', ''); sz := coalesce(it ->> 'size', '');
    -- trava a variante (cor + tamanho): duas vendas ao mesmo tempo não vendem a mesma peça
    select * into v from public.product_variants where product_id = p.id and color = col and size = sz for update;
    if not found then raise exception 'estoque_insuficiente: % % % (sem estoque cadastrado)', p.name, col, sz using errcode = 'P0001'; end if;
    if v.stock < q then raise exception 'estoque_insuficiente: % % % (restam %)', p.name, col, sz, v.stock using errcode = 'P0001'; end if;
    update public.product_variants set stock = stock - q where id = v.id;
    insert into public.stock_moves (product_id, variant_id, qty, reason, created_by) values (p.id, v.id, -q, 'venda', p_by);
    insert into public.order_items (order_id, product_id, variant_id, name, color, size, qty, unit_price, unit_cost)
    values (p_order, p.id, v.id, p.name, nullif(left(col, 40), ''), nullif(left(sz, 10), ''), q, public.effective_price(p),
            coalesce((select c.cost from public.product_costs c where c.product_id = p.id), 0));
    sub := sub + public.effective_price(p) * q;
  end loop;
  return sub;
end $$;
revoke all on function public._write_items(uuid, jsonb, uuid) from public, anon, authenticated;

-- ======================================================== contas únicas
-- e-mail canônico (sem +apelido; no Gmail também sem pontos) e telefone únicos
create function public.canonical_email(e text) returns text
language sql immutable set search_path = '' as $$
  select case
    when split_part(lower(e), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(e), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(e), '@', 1), '+', 1) || '@' || split_part(lower(e), '@', 2) end;
$$;
alter table public.profiles add column email_canon text, add column phone_norm text;
update public.profiles set email_canon = public.canonical_email(email), phone_norm = nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '');
create unique index profiles_email_canon_key on public.profiles (email_canon) where email_canon is not null;
create unique index profiles_phone_norm_key on public.profiles (phone_norm) where phone_norm is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ph text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), '');
  dom text := split_part(lower(new.email), '@', 2);
begin
  -- e-mails descartáveis não criam conta
  if dom in ('mailinator.com', 'yopmail.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com',
             'sharklasers.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com',
             'throwawaymail.com', 'emailondeck.com', 'moakt.com', 'mintemail.com', 'mohmal.com', 'tempmailo.com', 'tmpmail.org') then
    raise exception 'email_descartavel' using errcode = '22023';
  end if;
  if ph is not null then
    ph := regexp_replace(ph, '^55(\d{10,11})$', '\1');
    if length(ph) not between 10 and 11 then raise exception 'telefone_invalido' using errcode = '22023'; end if;
    if exists (select 1 from public.profiles where phone_norm = ph) then raise exception 'telefone_ja_cadastrado' using errcode = '23505'; end if;
  end if;
  if exists (select 1 from public.profiles where email_canon = public.canonical_email(new.email)) then
    raise exception 'email_ja_cadastrado' using errcode = '23505';
  end if;
  insert into public.profiles (id, full_name, phone, email, email_canon, phone_norm)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 120), left(new.raw_user_meta_data ->> 'phone', 30), new.email,
          public.canonical_email(new.email), ph);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 5% só na 1ª compra de verdade: conta com telefone válido e nenhum pedido
-- (desta conta ou de qualquer pedido feito com o mesmo telefone)
create or replace function public.first_purchase_eligible() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid()) and me.phone_norm is not null
      and not exists (select 1 from public.orders o where o.user_id = me.id and o.status <> 'cancelado')
      and not exists (select 1 from public.orders o where o.status <> 'cancelado'
                      and regexp_replace(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), '^55(\d{10,11})$', '\1') = me.phone_norm)
  );
$$;

-- ============================================================== endereços
create table public.addresses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Casa' check (length(label) <= 30),
  recipient text not null check (length(recipient) between 2 and 120),
  cep text not null check (cep ~ '^\d{8}$'),
  street text not null check (length(street) between 2 and 160),
  number text not null check (length(number) between 1 and 20),
  complement text check (length(complement) <= 80),
  district text not null check (length(district) between 2 and 80),
  city text not null check (length(city) between 2 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  reference text check (length(reference) <= 160),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default on public.addresses (user_id) where is_default;
alter table public.addresses enable row level security;
create policy "endereços: o próprio cliente e o dono/dev leem" on public.addresses for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_owner()));
create policy "endereços: o cliente cadastra os seus" on public.addresses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "endereços: o cliente altera os seus" on public.addresses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "endereços: o cliente apaga os seus" on public.addresses for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.addresses to authenticated;

-- o pedido guarda o endereço de entrega do momento (não muda se o cliente editar depois)
alter table public.orders add column shipping_address jsonb;

drop function public.place_order(jsonb, text, text);
create function public.place_order(items jsonb, p_delivery text default 'retirada', p_notes text default null, p_address_id bigint default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  me public.profiles;
  addr jsonb;
  sub numeric(10,2); disc numeric(10,2) := 0; pct numeric; first boolean;
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
  -- anti-fraude: no máximo 5 pedidos pendentes por cliente
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
  update public.orders set subtotal = sub, discount = disc, total = sub - disc, coupon_code = case when disc > 0 then 'PRIMEIRA5' end
  where id = o.id returning * into o;
  return o;
end $$;
revoke all on function public.place_order(jsonb, text, text, bigint) from public, anon;
grant execute on function public.place_order(jsonb, text, text, bigint) to authenticated;

-- ===================================================== pedidos abandonados
-- pedido do site sem pagamento por mais de X horas: cancela e devolve o estoque
create function public.expire_pending_orders(p_hours int default 48) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.orders where channel = 'site' and status = 'pendente' and created_at < now() - make_interval(hours => p_hours) for update skip locked loop
    update public.product_variants v set stock = v.stock + i.qty
    from public.order_items i where i.order_id = r.id and v.id = i.variant_id;
    insert into public.stock_moves (product_id, variant_id, qty, reason, note)
    select i.product_id, i.variant_id, i.qty, 'devolucao', 'pedido expirado' from public.order_items i where i.order_id = r.id;
    update public.orders set status = 'cancelado', notes = concat_ws(' · ', notes, 'cancelado automaticamente: sem pagamento') where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.expire_pending_orders(int) from public, anon, authenticated;

-- ====================================================== valor do estoque
-- quanto está investido em cada peça (estoque x custo) e quanto rende vendido
create function public.inventory_value()
returns table (product_id text, name text, stock bigint, cost numeric, invested numeric, retail numeric, potential_profit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select p.id, p.name, coalesce(p.stock, 0)::bigint, coalesce(c.cost, 0),
         coalesce(p.stock, 0) * coalesce(c.cost, 0), coalesce(p.stock, 0) * public.effective_price(p),
         coalesce(p.stock, 0) * (public.effective_price(p) - coalesce(c.cost, 0))
  from public.products p left join public.product_costs c on c.product_id = p.id
  order by 5 desc;
end $$;
revoke all on function public.inventory_value() from public, anon;
grant execute on function public.inventory_value() to authenticated;

-- ===================================================== cadastros (aba Clientes)
create function public.accounts_list(p_search text default null, p_limit int default 200)
returns table (id uuid, name text, email text, phone text, role text, created_at timestamptz, confirmed boolean,
               orders bigint, total numeric, city text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, p.email, p.phone, p.role, p.created_at, u.email_confirmed_at is not null,
         (select count(*) from public.orders o where o.user_id = p.id and o.status <> 'cancelado')::bigint,
         coalesce((select sum(o.total) from public.orders o where o.user_id = p.id and o.status <> 'cancelado'), 0),
         (select a.city || '/' || a.state from public.addresses a where a.user_id = p.id order by a.is_default desc, a.id limit 1)
  from public.profiles p join auth.users u on u.id = p.id
  where p_search is null or p.full_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%' or p.phone ilike '%' || p_search || '%'
  order by p.created_at desc limit least(greatest(p_limit, 1), 1000);
end $$;
revoke all on function public.accounts_list(text, int) from public, anon;
grant execute on function public.accounts_list(text, int) to authenticated;

-- ===================================================== verificação do cadastro
-- avisa antes de criar a conta (o gatilho continua barrando de qualquer jeito)
create function public.check_signup(p_email text, p_phone text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare ph text := regexp_replace(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^55(\d{10,11})$', '\1');
begin
  if split_part(lower(p_email), '@', 2) in ('mailinator.com', 'yopmail.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com',
     'sharklasers.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'throwawaymail.com', 'emailondeck.com',
     'moakt.com', 'mintemail.com', 'mohmal.com', 'tempmailo.com', 'tmpmail.org') then return 'email_descartavel'; end if;
  if length(ph) not between 10 and 11 then return 'telefone_invalido'; end if;
  if exists (select 1 from public.profiles where phone_norm = ph or email_canon = public.canonical_email(p_email)) then return 'conta_existente'; end if;
  return 'ok';
end $$;
revoke all on function public.check_signup(text, text) from public;
grant execute on function public.check_signup(text, text) to anon, authenticated;

-- de hora em hora: pedidos do site sem pagamento há 48 h são cancelados e o estoque volta
create extension if not exists pg_cron;
select cron.schedule('vs-expirar-pedidos', '17 * * * *', 'select public.expire_pending_orders(48)');
