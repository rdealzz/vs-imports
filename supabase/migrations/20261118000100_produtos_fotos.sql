-- estampa do modelo 3D e fotos dos produtos (Storage)
alter table public.products add column print text;
grant update (print) on public.products to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "fotos: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and (select public.is_owner()));
create policy "fotos: dono troca" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and (select public.is_owner())) with check (bucket_id = 'produtos' and (select public.is_owner()));
create policy "fotos: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and (select public.is_owner()));
