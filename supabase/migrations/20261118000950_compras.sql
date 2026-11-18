-- Compras (entrada de mercadoria) com fornecedor e grade cor x tamanho.
-- Já aplicada no projeto; o arquivo fica para recriar o banco do zero.
alter table public.stock_moves add column if not exists supplier text;
alter table public.stock_moves add column if not exists purchase_id uuid;
create index if not exists stock_moves_purchase_idx on public.stock_moves (purchase_id);

-- uma entrada = várias variantes com o mesmo custo/fornecedor (só dono e desenvolvedor)
create or replace function public.purchase_entry(p_product text, items jsonb, p_unit_cost numeric, p_supplier text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  pid uuid := gen_random_uuid();
  q int;
  total int := 0;
  first_id bigint := coalesce((select max(id) from public.stock_moves), 0);
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'itens_invalidos' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(items) loop
    q := coalesce((it ->> 'qty')::int, 0);
    if q > 0 then
      perform public.stock_entry(p_product, q, p_unit_cost, p_note, coalesce(it ->> 'color', ''), coalesce(it ->> 'size', ''));
      total := total + q;
    end if;
  end loop;
  if total = 0 then raise exception 'quantidade_invalida' using errcode = '22023'; end if;
  update public.stock_moves set supplier = left(p_supplier, 120), purchase_id = pid
  where id > first_id and product_id = p_product and reason = 'compra' and created_by = (select auth.uid());
  if p_supplier is not null then update public.product_costs set supplier = left(p_supplier, 120) where product_id = p_product; end if;
  return pid;
end $$;
revoke all on function public.purchase_entry(text, jsonb, numeric, text, text) from public, anon;
grant execute on function public.purchase_entry(text, jsonb, numeric, text, text) to authenticated;

-- histórico de compras do período
create or replace function public.purchases_report(p_from date, p_to date)
returns table (purchase_id uuid, created_at timestamptz, product_id text, name text, supplier text, qty bigint, unit_cost numeric, total numeric, detail text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select m.purchase_id, min(m.created_at), m.product_id, max(p.name), max(m.supplier), sum(m.qty)::bigint, max(m.unit_cost),
         sum(m.qty * coalesce(m.unit_cost, 0)),
         string_agg(m.qty || 'x ' || concat_ws(' ', nullif(v.color, ''), nullif(v.size, '')), ', ' order by m.id)
  from public.stock_moves m join public.products p on p.id = m.product_id left join public.product_variants v on v.id = m.variant_id
  where m.reason = 'compra' and (m.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
  group by coalesce(m.purchase_id::text, m.id::text), m.purchase_id, m.product_id
  order by 2 desc;
end $$;
revoke all on function public.purchases_report(date, date) from public, anon;
grant execute on function public.purchases_report(date, date) to authenticated;
