-- meta mensal, caixa por forma de pagamento, vendas por vendedor e clientes
alter table public.store_settings add column monthly_goal numeric(12,2) check (monthly_goal >= 0);
grant update (monthly_goal) on public.store_settings to authenticated;

create function public.sales_by_payment(p_from date, p_to date)
returns table (payment text, orders bigint, total numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select coalesce(o.payment, 'a_combinar'), count(*)::bigint, sum(o.total)
  from public.orders o
  where o.status <> 'cancelado' and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  group by 1 order by 3 desc;
end $$;

create function public.sales_by_seller(p_from date, p_to date)
returns table (seller_id uuid, seller text, orders bigint, total numeric, items bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select o.created_by, coalesce(pr.full_name, pr.email, 'Site (cliente)'), count(*)::bigint, sum(o.total),
         coalesce(sum((select sum(i.qty) from public.order_items i where i.order_id = o.id)), 0)::bigint
  from public.orders o left join public.profiles pr on pr.id = o.created_by and o.channel <> 'site'
  where o.status <> 'cancelado' and (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  group by o.created_by, pr.full_name, pr.email, (o.channel = 'site')
  order by 4 desc;
end $$;

create function public.customers_summary(p_search text default null, p_limit int default 100)
returns table (customer_key text, name text, phone text, email text, orders bigint, total numeric, last_order timestamptz, has_account boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  with o as (
    select coalesce(x.user_id::text, nullif(regexp_replace(coalesce(x.customer_phone, ''), '\D', '', 'g'), ''), lower(nullif(trim(x.customer_name), ''))) as k,
           x.*
    from public.orders x where x.status <> 'cancelado'
  )
  select o.k, coalesce(max(p.full_name), max(o.customer_name)), coalesce(max(p.phone), max(o.customer_phone)), max(p.email),
         count(*)::bigint, sum(o.total), max(o.created_at), bool_or(o.user_id is not null)
  from o left join public.profiles p on p.id = o.user_id
  where o.k is not null
    and (p_search is null or coalesce(p.full_name, o.customer_name, '') ilike '%' || p_search || '%'
         or coalesce(p.phone, o.customer_phone, '') ilike '%' || p_search || '%' or coalesce(p.email, '') ilike '%' || p_search || '%')
  group by o.k order by 6 desc limit least(greatest(p_limit, 1), 500);
end $$;

revoke all on function public.sales_by_payment(date, date) from public, anon;
grant execute on function public.sales_by_payment(date, date) to authenticated;
revoke all on function public.sales_by_seller(date, date) from public, anon;
grant execute on function public.sales_by_seller(date, date) to authenticated;
revoke all on function public.customers_summary(text, int) from public, anon;
grant execute on function public.customers_summary(text, int) to authenticated;
