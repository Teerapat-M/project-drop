-- Minimal Supabase-shaped Postgres for local/CI carpool RLS tests.
-- Empty cluster only. Does not touch the live `drop` project.
-- Provides: anon/authenticated/service_role, auth.uid()/auth.jwt(),
-- supabase_realtime, then apply 20261110120000_profiles.sql (private +
-- profiles + is_admin) followed by 20261118100000_carpool.sql,
-- 20261118120000_carpool_trip_stops.sql, and 20261118130000_carpool_taxi_trunk.sql.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant usage on schema public to anon, authenticated, service_role, postgres;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role, postgres;
grant execute on function auth.jwt() to anon, authenticated, service_role, postgres;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end $$;

commit;
