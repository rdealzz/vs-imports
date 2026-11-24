-- cargo exibido no painel (ex.: CEO); o acesso continua definido pelo papel (role)
alter table public.profiles add column if not exists title text check (length(title) <= 40);
grant select (title) on public.profiles to authenticated;
-- o CEO da loja (conta já existente) recebe acesso de dono
update public.profiles set role = 'dono', title = 'CEO' where id = (select id from auth.users where lower(email) = lower('guisantosmartins340@gmail.com'));
