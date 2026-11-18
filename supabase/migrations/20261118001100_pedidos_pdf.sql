-- PDF de cada pedido: bucket privado. Quem fez o pedido grava na própria pasta;
-- o link enviado no WhatsApp é assinado (expira em 30 dias). Equipe lê todos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pedidos', 'pedidos', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "pedidos pdf: grava na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'pedidos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pedidos pdf: atualiza o próprio" on storage.objects for update to authenticated
  using (bucket_id = 'pedidos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'pedidos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pedidos pdf: lê o próprio ou equipe" on storage.objects for select to authenticated
  using (bucket_id = 'pedidos' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_staff())));
