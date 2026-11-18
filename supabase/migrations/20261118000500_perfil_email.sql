-- e-mail no perfil (o dono encontra a conta do vendedor para promover)
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 120), left(new.raw_user_meta_data ->> 'phone', 30), new.email);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
