-- Código de barras por variante (cor + tamanho) para a loja física.
-- EAN-13 de uso interno (começa com 2): 2 + 11 dígitos sequenciais + dígito verificador.
-- É gerado sozinho ao cadastrar a variante; o leitor do caixa encontra a peça por ele.
create sequence if not exists public.barcode_seq start 1;

create or replace function public.ean13_check(d12 text) returns int
language sql immutable set search_path = '' as $$
  select (10 - (sum(substr(d12, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10)) % 10
  from generate_series(1, 12) i
$$;

create or replace function public.next_barcode() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare d12 text := '2' || lpad(nextval('public.barcode_seq')::text, 11, '0');
begin return d12 || public.ean13_check(d12)::text; end $$;
revoke all on function public.next_barcode() from public, anon, authenticated;

alter table public.product_variants add column if not exists barcode text;
create unique index if not exists product_variants_barcode_key on public.product_variants (barcode);

create or replace function public._variant_barcode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.barcode is null or new.barcode = '' then new.barcode := public.next_barcode(); end if;
  return new;
end $$;
drop trigger if exists variant_barcode on public.product_variants;
create trigger variant_barcode before insert on public.product_variants for each row execute function public._variant_barcode();

-- variantes que já existem recebem o código na ordem do catálogo
update public.product_variants v set barcode = public.next_barcode()
from (select id from public.product_variants where barcode is null order by product_id, color, size) o
where v.id = o.id;

grant select (barcode) on public.product_variants to authenticated;

-- caixa: acha a peça pelo código lido (equipe)
create or replace function public.find_by_barcode(p_code text)
returns table (product_id text, name text, color text, size text, stock int, price numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  return query
  select v.product_id, p.name, v.color, v.size, v.stock, public.effective_price(p)
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.barcode = regexp_replace(coalesce(p_code, ''), '\D', '', 'g') limit 1;
end $$;
revoke all on function public.find_by_barcode(text) from public, anon;
grant execute on function public.find_by_barcode(text) to authenticated;
