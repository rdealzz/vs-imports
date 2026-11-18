-- até 5 fotos por peça e cadastro completo em uma chamada

create table public.product_images (
  id bigint generated always as identity primary key,
  product_id text not null references public.products (id) on delete cascade,
  path text not null, -- caminho no bucket "produtos"
  position int not null default 0 check (position between 0 and 4),
  created_at timestamptz not null default now(),
  unique (product_id, position)
);
create index product_images_product_idx on public.product_images (product_id);
alter table public.product_images enable row level security;
create policy "fotos: todos veem" on public.product_images for select to anon, authenticated using (true);
create policy "fotos: dono cadastra" on public.product_images for insert to authenticated with check ((select public.is_owner()));
create policy "fotos: dono reordena" on public.product_images for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "fotos: dono remove" on public.product_images for delete to authenticated using ((select public.is_owner()));

create function public._max_five_images() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.product_images where product_id = new.product_id) > 5 then
    raise exception 'maximo_5_fotos' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger product_images_max_five after insert on public.product_images
  for each row execute function public._max_five_images();

-- cadastro/edição completa: dados, custo e quantidade de cada cor x tamanho
-- p: {"id","name","category","model","description","price","cost","featured","active","print",
--     "promo_price", "promo_until", "sizes":["P","M"], "colors":[{"n","c","a"}],
--     "stock":[{"color":"Preto","size":"M","qty":3}]}
create function public.upsert_product(p jsonb) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  r public.products;
  s jsonb;
  v public.product_variants;
  q int;
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if coalesce(p ->> 'id', '') !~ '^[a-z0-9-]{3,60}$' then raise exception 'codigo_invalido' using errcode = '22023'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'nome_obrigatorio' using errcode = '22023'; end if;
  if (p ->> 'price')::numeric is null or (p ->> 'price')::numeric < 0 then raise exception 'preco_invalido' using errcode = '22023'; end if;

  if nullif(p ->> 'promo_price', '')::numeric >= (p ->> 'price')::numeric then raise exception 'promocao_deve_ser_menor_que_o_preco' using errcode = '22023'; end if;
  insert into public.products (id, category, model, name, description, price, promo_price, promo_until, sizes, colors, print, featured, active)
  values (p ->> 'id', p ->> 'category', coalesce(p ->> 'model', 'tee'), left(trim(p ->> 'name'), 120), left(p ->> 'description', 2000),
          (p ->> 'price')::numeric, nullif(p ->> 'promo_price', '')::numeric, nullif(p ->> 'promo_until', '')::timestamptz,
          coalesce((select array_agg(left(x, 10)) from jsonb_array_elements_text(p -> 'sizes') x), '{}'),
          coalesce(p -> 'colors', '[]'::jsonb), nullif(left(p ->> 'print', 20), ''),
          coalesce((p ->> 'featured')::boolean, false), coalesce((p ->> 'active')::boolean, true))
  on conflict (id) do update set category = excluded.category, model = excluded.model, name = excluded.name,
    description = excluded.description, price = excluded.price, promo_price = excluded.promo_price, promo_until = excluded.promo_until, sizes = excluded.sizes, colors = excluded.colors,
    print = excluded.print, featured = excluded.featured, active = excluded.active, updated_at = now();

  if p ? 'cost' and (p ->> 'cost') is not null then
    insert into public.product_costs (product_id, cost, updated_at) values (p ->> 'id', greatest((p ->> 'cost')::numeric, 0), now())
    on conflict (product_id) do update set cost = excluded.cost, updated_at = now();
  end if;

  -- quantidades por variante: grava a contagem e registra a diferença no histórico
  for s in select * from jsonb_array_elements(coalesce(p -> 'stock', '[]'::jsonb)) loop
    q := greatest(coalesce((s ->> 'qty')::int, 0), 0);
    select * into v from public.product_variants
      where product_id = p ->> 'id' and color = coalesce(s ->> 'color', '') and size = coalesce(s ->> 'size', '') for update;
    if found then
      if v.stock <> q then
        insert into public.stock_moves (product_id, variant_id, qty, reason, note, created_by)
        values (v.product_id, v.id, q - v.stock, 'ajuste', 'cadastro', (select auth.uid()));
        update public.product_variants set stock = q where id = v.id;
      end if;
    else
      insert into public.product_variants (product_id, color, size, stock)
      values (p ->> 'id', coalesce(s ->> 'color', ''), coalesce(s ->> 'size', ''), q) returning * into v;
      if q > 0 then
        insert into public.stock_moves (product_id, variant_id, qty, reason, note, created_by)
        values (v.product_id, v.id, q, 'compra', 'cadastro', (select auth.uid()));
      end if;
    end if;
  end loop;

  select * into r from public.products where id = p ->> 'id';
  return r;
end $$;

revoke all on function public._max_five_images() from public, anon, authenticated;
revoke all on function public.upsert_product(jsonb) from public, anon;
grant execute on function public.upsert_product(jsonb) to authenticated;

-- fotos do iPhone: o site converte para WebP/JPEG antes de enviar; limite de 8 MB por foto
update storage.buckets set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'produtos';
