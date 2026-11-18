-- papel "dev" (desenvolvedor do site): acima do dono, vê e faz tudo
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('cliente', 'vendedor', 'dono', 'dev'));

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('vendedor', 'dono', 'dev'));
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('dono', 'dev'));
$$;
create function public.is_dev() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'dev');
$$;
revoke all on function public.is_dev() from public, anon;
grant execute on function public.is_dev() to authenticated;

-- regras de papel: só o dev cria/remove dev; o dono não mexe em contas dev
create or replace function public.set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare target text;
begin
  if not public.is_owner() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_role not in ('cliente', 'vendedor', 'dono', 'dev') then raise exception 'papel_invalido' using errcode = '22023'; end if;
  select role into target from public.profiles where id = p_user;
  if (p_role = 'dev' or target = 'dev') and not public.is_dev() then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) and p_role not in ('dono', 'dev') then raise exception 'nao_pode_rebaixar_a_si_mesmo' using errcode = '22023'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;
