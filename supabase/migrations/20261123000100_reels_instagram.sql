-- Vídeos do Instagram da loja exibidos na home (o dono cola os links no painel).
-- A home mostra cada um com o player oficial do Instagram (sem baixar arquivos).
create table public.home_reels (
  id bigint generated always as identity primary key,
  url text not null check (url ~ '^https://(www\.)?instagram\.com/(reel|reels|p|tv)/[A-Za-z0-9_-]{5,}/?'),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.home_reels enable row level security;
-- visitante (anon) não pode chamar is_owner(): regras separadas
create policy "reels: visitantes veem os ativos" on public.home_reels for select to anon using (active);
create policy "reels: conta vê ativos, dono vê todos" on public.home_reels for select to authenticated using (active or (select public.is_owner()));
create policy "reels: dono cadastra" on public.home_reels for insert to authenticated with check ((select public.is_owner()));
create policy "reels: dono altera" on public.home_reels for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "reels: dono apaga" on public.home_reels for delete to authenticated using ((select public.is_owner()));
grant select on public.home_reels to anon, authenticated;
grant insert (url, position, active), update (url, position, active), delete on public.home_reels to authenticated;
