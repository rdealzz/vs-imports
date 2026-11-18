-- o Storage só apaga arquivos que quem pede consegue listar: o dono precisa do select
create policy "fotos: dono lista" on storage.objects for select to authenticated
  using (bucket_id = 'produtos' and (select public.is_owner()));
