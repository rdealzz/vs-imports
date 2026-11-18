-- mês comercial configurável, relatório de vendas e fechamento de mês

create table public.store_settings (
  id boolean primary key default true check (id), -- uma linha só
  month_start_day int not null default 1 check (month_start_day between 1 and 28),
  updated_at timestamptz not null default now()
);
insert into public.store_settings default values;
alter table public.store_settings enable row level security;
create policy "config: equipe lê" on public.store_settings for select to authenticated using ((select public.is_staff()));
create policy "config: dono altera" on public.store_settings for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke update on public.store_settings from authenticated, anon;
grant update (month_start_day, updated_at) on public.store_settings to authenticated;

-- período comercial que contém a data (ex.: início dia 5 -> 05/11 a 04/12)
create function public.commercial_period(p_date date default (now() at time zone 'America/Sao_Paulo')::date, p_offset int default 0)
returns table (period_start date, period_end date)
language plpgsql stable security definer set search_path = '' as $$
declare
  d int := (select month_start_day from public.store_settings);
  s date;
begin
  s := make_date(extract(year from p_date)::int, extract(month from p_date)::int, d);
  if p_date < s then s := (s - interval '1 month')::date; end if;
  s := (s + make_interval(months => p_offset))::date;
  period_start := s;
  period_end := ((s + interval '1 month')::date - 1);
  return next;
end $$;

-- todas as vendas do período, uma linha por pedido (para o PDF)
create function public.sales_report(p_from date, p_to date)
returns table (number bigint, created_at timestamptz, channel text, status text, payment text, customer text,
               items text, subtotal numeric, discount numeric, total numeric, cost numeric, profit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select o.number, o.created_at, o.channel, o.status::text, o.payment,
         coalesce(o.customer_name, p.full_name, '—'),
         string_agg(i.qty || 'x ' || i.name || coalesce(' ' || i.size, ''), ', ' order by i.id),
         o.subtotal, o.discount, o.total,
         coalesce(sum(i.qty * i.unit_cost), 0),
         case when o.status = 'cancelado' then 0 else o.total - coalesce(sum(i.qty * i.unit_cost), 0) end
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  left join public.profiles p on p.id = o.user_id
  where (o.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  group by o.id, p.full_name
  order by o.created_at;
end $$;

-- fechamento: guarda o retrato dos números do período
create table public.month_closings (
  id bigint generated always as identity primary key,
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz not null default now(),
  unique (period_start, period_end)
);
create index month_closings_closed_by_idx on public.month_closings (closed_by);
alter table public.month_closings enable row level security;
create policy "fechamentos: dono lê" on public.month_closings for select to authenticated using ((select public.is_owner()));

create function public.close_month(p_from date, p_to date) returns public.month_closings
language plpgsql security definer set search_path = '' as $$
declare c public.month_closings;
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  insert into public.month_closings (period_start, period_end, summary, closed_by)
  select p_from, p_to, to_jsonb(s), (select auth.uid()) from public.finance_summary(p_from, p_to) s
  on conflict (period_start, period_end) do update set summary = excluded.summary, closed_by = excluded.closed_by, closed_at = now()
  returning * into c;
  return c;
end $$;

revoke all on function public.commercial_period(date, int) from public, anon;
grant execute on function public.commercial_period(date, int) to authenticated;
revoke all on function public.sales_report(date, date) from public, anon;
grant execute on function public.sales_report(date, date) to authenticated;
revoke all on function public.close_month(date, date) from public, anon;
grant execute on function public.close_month(date, date) to authenticated;
