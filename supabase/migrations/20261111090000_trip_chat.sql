-- Drop in-trip chat + preferred_language.
-- Do not apply this file from CI or to a live DB. Bell runs it in the SQL editor
-- (or `supabase db push`) after 20261110120000_profiles + 20261110180000_rides
-- + 20261110200000_nearby_rides_hardening.
--
-- Security:
-- * ride_pins stays out of supabase_realtime. This file only ADDS public.messages.
-- * accept_ride remains the only way to accept a ride (unchanged).
-- * Translated columns are not grantable to authenticated (clients cannot forge them).
-- * INSERT is rider or assigned driver, as themselves, only while the ride is active.
-- * After completed/cancelled the table is read-only for participants.

alter table public.profiles
  add column if not exists preferred_language text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_preferred_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_language_check
      check (
        preferred_language is null
        or preferred_language ~ '^[a-z]{2}([_-][A-Za-z]{2})?$'
      );
  end if;
end $$;

comment on column public.profiles.preferred_language is
  'BCP-47 tag (en, th, zh, ja). Null = fall back to the device locale. User can update their own row; trigger does not restrict this column.';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  original_text text not null check (char_length(original_text) between 1 and 1000),
  translated_text text,
  source_lang text,
  target_lang text,
  is_preset boolean not null default false,
  preset_key text,
  created_at timestamptz not null default now()
);

comment on table public.messages is
  'In-trip chat. Clients SELECT via RLS + Realtime. translated_* is written by the Express service role (or left null).';
comment on column public.messages.translated_text is
  'Server-only. Authenticated has no INSERT/UPDATE grant on this column.';
comment on column public.messages.source_lang is
  'Server-only. Authenticated has no INSERT/UPDATE grant on this column.';
comment on column public.messages.target_lang is
  'Server-only. Authenticated has no INSERT/UPDATE grant on this column.';

create index if not exists messages_ride_id_created_at_idx
  on public.messages (ride_id, created_at);

alter table public.messages enable row level security;

revoke all on table public.messages from public, anon, authenticated;
grant select on table public.messages to authenticated;
-- Original body only. translated_text / source_lang / target_lang stay un-granted.
grant insert (ride_id, sender_id, original_text, is_preset, preset_key)
  on table public.messages to authenticated;
grant all on table public.messages to service_role;

create or replace function public.messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  ride_rider uuid;
  ride_driver uuid;
  ride_status public.ride_status;
begin
  uid := (select auth.uid());

  if tg_op = 'UPDATE' then
    if uid is not null then
      raise exception 'messages are immutable';
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    return new;
  end if;

  select r.rider_id, r.driver_id, r.status
    into ride_rider, ride_driver, ride_status
    from public.rides r
   where r.id = new.ride_id;

  if ride_rider is null then
    raise exception 'ride not found';
  end if;

  if ride_status not in ('accepted', 'arrived', 'in_progress') then
    raise exception 'chat is read-only for this ride';
  end if;

  if uid is not null then
    -- User JWT: never impersonate, never forge a translation.
    new.sender_id := uid;
    new.translated_text := null;
    new.source_lang := null;
    new.target_lang := null;
    if uid is distinct from ride_rider and uid is distinct from ride_driver then
      raise exception 'not a ride participant';
    end if;
  else
    -- Service role (auth.uid() is null): still refuse a sender who is not on the ride.
    if new.sender_id is distinct from ride_rider
       and new.sender_id is distinct from ride_driver then
      raise exception 'sender is not a ride participant';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.messages_guard() is
  'Forces sender_id = auth.uid() for user JWTs, strips translated columns, blocks inactive rides.';

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard
  before insert or update on public.messages
  for each row
  execute function public.messages_guard();

create policy "messages_select_participants"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rides r
       where r.id = ride_id
         and (
           r.rider_id = (select auth.uid())
           or r.driver_id = (select auth.uid())
           or (select private.is_admin())
         )
    )
  );

create policy "messages_insert_participants"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.rides r
       where r.id = ride_id
         and r.status in ('accepted', 'arrived', 'in_progress')
         and (
           r.rider_id = (select auth.uid())
           or r.driver_id = (select auth.uid())
         )
    )
  );

-- Counterpart name / phone / language for Call + Chat + translation target.
create or replace function public.ride_peer(p_ride_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(x)
  from (
    select p.id, p.full_name, p.phone, p.preferred_language
    from public.rides r
    join public.profiles p
      on p.id = case
        when r.rider_id = (select auth.uid()) then r.driver_id
        when r.driver_id = (select auth.uid()) then r.rider_id
        when (select private.is_admin()) then coalesce(r.driver_id, r.rider_id)
      end
    where r.id = p_ride_id
      and (
        r.rider_id = (select auth.uid())
        or r.driver_id = (select auth.uid())
        or (select private.is_admin())
      )
  ) x;
$$;

comment on function public.ride_peer(uuid) is
  'Other party on the ride (name, phone, preferred_language). Caller must be rider, assigned driver, or admin.';

revoke all on function public.ride_peer(uuid) from public, anon;
grant execute on function public.ride_peer(uuid) to authenticated, service_role;

-- Realtime: messages only. Never ride_pins.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_pins'
  ) then
    execute 'alter publication supabase_realtime drop table public.ride_pins';
  end if;
end $$;

-- rollback:
-- alter publication supabase_realtime drop table if exists public.messages;
-- drop policy if exists "messages_insert_participants" on public.messages;
-- drop policy if exists "messages_select_participants" on public.messages;
-- drop trigger if exists messages_guard on public.messages;
-- drop function if exists public.messages_guard();
-- drop function if exists public.ride_peer(uuid);
-- drop table if exists public.messages;
-- alter table public.profiles drop constraint if exists profiles_preferred_language_check;
-- alter table public.profiles drop column if exists preferred_language;
