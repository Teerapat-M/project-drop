-- Drop profiles: one row per auth.users, role chosen on M04 (rider/driver).
-- Admin is assigned only via the dashboard / SQL (service role), never by the user.
-- Do not apply this file from CI. Bell runs it in the Supabase SQL editor (or `supabase db push`).

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to postgres, service_role, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text check (role is null or role in ('rider', 'driver', 'admin')),
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One profile per auth user. role is null until M04 role select.';
comment on column public.profiles.role is 'rider | driver | admin. Null until the user picks rider/driver. Admin is never self-assigned.';

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon;
grant select, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- SECURITY DEFINER, not in an exposed schema. Reads profiles with owner rights so RLS
-- on profiles cannot recurse when this is used from a profiles policy.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

comment on function private.is_admin() is 'True when the current auth.uid() has profiles.role = admin.';

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone')
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is 'Inserts public.profiles on auth.users insert.';

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Block self-assigning admin. Service-role / SQL (auth.uid() is null) may set admin.
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'admin'
     and (tg_op = 'INSERT' or old.role is distinct from 'admin')
     and (select auth.uid()) is not null then
    raise exception 'role cannot be set to admin';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_role();

-- Users read their own row; admins read every row.
create policy "Users can select own profile"
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) = id
    or (select private.is_admin())
  );

-- Users update their own row. WITH CHECK refuses role = admin (defense in depth with the trigger).
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and (role is null or role in ('rider', 'driver'))
  );

-- rollback:
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop trigger if exists profiles_guard_role on public.profiles;
-- drop policy if exists "Users can select own profile" on public.profiles;
-- drop policy if exists "Users can update own profile" on public.profiles;
-- drop function if exists public.handle_new_user();
-- drop function if exists public.profiles_guard_role();
-- drop function if exists private.is_admin();
-- drop table if exists public.profiles;
-- drop schema if exists private;
