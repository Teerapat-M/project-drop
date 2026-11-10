-- Drop rides + driver locations + rider-only trip PINs.
-- Do not apply this file from CI. Bell runs it in the Supabase SQL editor (or `supabase db push`).
-- Nearby matching is NOT in RLS: drivers may SELECT every status=requested ride.
-- Filter by distance in the Express API or a later RPC, e.g.
--   select r.*
--   from public.rides r
--   join public.driver_locations d on d.driver_id = auth.uid()
--   where r.status = 'requested'
--     and earth_distance(ll_to_earth(r.pickup_lat, r.pickup_lng), ll_to_earth(d.lat, d.lng)) < 5000;
-- The mobile app sorts requested rides nearest-first with haversine.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'ride_status') then
    create type public.ride_status as enum (
      'requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'vehicle_type') then
    create type public.vehicle_type as enum ('car', 'bike');
  end if;
end $$;

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles (id) on delete restrict,
  driver_id uuid references public.profiles (id) on delete restrict,
  status public.ride_status not null default 'requested',
  vehicle_type public.vehicle_type not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_label text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_label text not null,
  route_distance_m integer,
  route_duration_s integer,
  route_polyline text,
  fare_estimate numeric,
  pin_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  constraint rides_pickup_lat check (pickup_lat between -90 and 90),
  constraint rides_pickup_lng check (pickup_lng between -180 and 180),
  constraint rides_dropoff_lat check (dropoff_lat between -90 and 90),
  constraint rides_dropoff_lng check (dropoff_lng between -180 and 180),
  constraint rides_driver_on_accept check (
    (status = 'requested' and driver_id is null)
    or (status <> 'requested')
  )
);

comment on table public.rides is 'A ride request. fare_estimate is unused until TODO(fare-formula); store null.';
comment on column public.rides.pin_required is 'True after accept when the rider has trip_pin_enabled. Drivers see this flag, never the PIN.';
comment on column public.rides.fare_estimate is 'Always null until a fare formula exists.';

-- PIN is NOT on rides. Drivers must not be able to SELECT it.
create table public.ride_pins (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  pin text not null check (pin ~ '^\d{4}$'),
  attempts integer not null default 0 check (attempts >= 0),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.ride_pins is '4-digit trip PIN. Readable only by the rider (and admin). Drivers call verify_trip_pin().';

create table public.driver_locations (
  driver_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  is_online boolean not null default false,
  vehicle_type public.vehicle_type,
  updated_at timestamptz not null default now(),
  constraint driver_locations_lat check (lat between -90 and 90),
  constraint driver_locations_lng check (lng between -180 and 180)
);

comment on table public.driver_locations is 'Latest published location for an online/offline driver.';

create index rides_rider_id_idx on public.rides (rider_id);
create index rides_driver_id_idx on public.rides (driver_id);
create index rides_requested_idx on public.rides (status) where status = 'requested';

alter table public.rides enable row level security;
alter table public.ride_pins enable row level security;
alter table public.driver_locations enable row level security;

revoke all on table public.rides from public, anon;
revoke all on table public.ride_pins from public, anon;
revoke all on table public.driver_locations from public, anon;

grant select, insert, update on table public.rides to authenticated;
grant select on table public.ride_pins to authenticated;
grant select, insert, update on table public.driver_locations to authenticated;
grant all on table public.rides to service_role;
grant all on table public.ride_pins to service_role;
grant all on table public.driver_locations to service_role;

create or replace function public.rides_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pin_on boolean;
  raw bytea;
  n int;
  new_pin text;
begin
  new.updated_at = now();

  if tg_op = 'INSERT' then
    if new.status is distinct from 'requested' then
      raise exception 'rides insert must start as requested';
    end if;
    if new.driver_id is not null then
      raise exception 'rides insert cannot set driver_id';
    end if;
    new.fare_estimate := null;
    new.pin_required := false;
    return new;
  end if;

  if old.status is distinct from new.status then
    if not (
      (old.status = 'requested' and new.status in ('accepted', 'cancelled'))
      or (old.status = 'accepted' and new.status in ('arrived', 'in_progress', 'cancelled'))
      or (old.status = 'arrived' and new.status in ('in_progress', 'cancelled'))
      or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'invalid status transition from % to %', old.status, new.status;
    end if;
  end if;

  if new.status = 'accepted' and old.status = 'requested' then
    if new.driver_id is null then
      raise exception 'driver_id required on accept';
    end if;
    new.accepted_at := coalesce(new.accepted_at, now());
    select p.trip_pin_enabled into pin_on
      from public.profiles p
     where p.id = new.rider_id;
    if coalesce(pin_on, false) then
      raw := extensions.gen_random_bytes(2);
      n := (get_byte(raw, 0) * 256 + get_byte(raw, 1)) % 10000;
      new_pin := lpad(n::text, 4, '0');
      insert into public.ride_pins (ride_id, pin) values (new.id, new_pin);
      new.pin_required := true;
    else
      new.pin_required := false;
    end if;
  end if;

  if new.status = 'in_progress' and old.status in ('accepted', 'arrived') then
    if new.pin_required then
      if not exists (
        select 1 from public.ride_pins rp
         where rp.ride_id = new.id and rp.verified_at is not null
      ) then
        raise exception 'trip pin required';
      end if;
    end if;
    new.started_at := coalesce(new.started_at, now());
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  new.fare_estimate := null;
  return new;
end;
$$;

comment on function public.rides_guard() is 'Status transitions, first-accept PIN generation, fare_estimate always null.';

create trigger rides_guard
  before insert or update on public.rides
  for each row
  execute function public.rides_guard();

-- Assigned driver verifies the PIN without ever SELECTing ride_pins.
-- Constant-time-ish compare via HMAC-SHA256 of both strings.
create or replace function public.verify_trip_pin(p_ride_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rides%rowtype;
  pin_row public.ride_pins%rowtype;
  ok boolean;
  max_attempts constant int := 5;
begin
  select * into r from public.rides where id = p_ride_id;
  if not found then
    raise exception 'ride not found';
  end if;
  if r.driver_id is distinct from (select auth.uid())
     and not (select private.is_admin()) then
    raise exception 'not assigned driver';
  end if;
  if not r.pin_required then
    return jsonb_build_object('ok', true, 'required', false);
  end if;

  select * into pin_row from public.ride_pins where ride_id = p_ride_id for update;
  if not found then
    raise exception 'pin not found';
  end if;
  if pin_row.verified_at is not null then
    return jsonb_build_object('ok', true, 'required', true);
  end if;
  if pin_row.attempts >= max_attempts then
    return jsonb_build_object('ok', false, 'locked', true, 'attempts_remaining', 0);
  end if;

  ok := extensions.hmac(convert_to(pin_row.pin, 'UTF8'), convert_to('drop-trip-pin', 'UTF8'), 'sha256')
      = extensions.hmac(convert_to(coalesce(p_pin, ''), 'UTF8'), convert_to('drop-trip-pin', 'UTF8'), 'sha256');

  if not ok then
    update public.ride_pins
       set attempts = pin_row.attempts + 1
     where ride_id = p_ride_id;
    if pin_row.attempts + 1 >= max_attempts then
      return jsonb_build_object('ok', false, 'locked', true, 'attempts_remaining', 0);
    end if;
    return jsonb_build_object(
      'ok', false,
      'locked', false,
      'attempts_remaining', max_attempts - (pin_row.attempts + 1)
    );
  end if;

  update public.ride_pins set verified_at = now() where ride_id = p_ride_id;
  return jsonb_build_object('ok', true, 'required', true);
end;
$$;

comment on function public.verify_trip_pin(uuid, text) is 'Driver-callable. Verifies the trip PIN without exposing it. Attempt limit 5.';

revoke all on function public.verify_trip_pin(uuid, text) from public, anon;
grant execute on function public.verify_trip_pin(uuid, text) to authenticated, service_role;

-- RLS: rider sees own rides; driver sees assigned + all requested; admin sees all.
create policy "rides_select"
  on public.rides
  for select
  to authenticated
  using (
    rider_id = (select auth.uid())
    or driver_id = (select auth.uid())
    or (
      status = 'requested'
      and exists (
        select 1 from public.profiles p
         where p.id = (select auth.uid()) and p.role = 'driver'
      )
    )
    or (select private.is_admin())
  );

create policy "rides_insert_rider"
  on public.rides
  for insert
  to authenticated
  with check (
    rider_id = (select auth.uid())
    and status = 'requested'
    and driver_id is null
  );

create policy "rides_update_rider"
  on public.rides
  for update
  to authenticated
  using (rider_id = (select auth.uid()))
  with check (rider_id = (select auth.uid()));

create policy "rides_update_driver"
  on public.rides
  for update
  to authenticated
  using (
    driver_id = (select auth.uid())
    or (
      status = 'requested'
      and driver_id is null
      and exists (
        select 1 from public.profiles p
         where p.id = (select auth.uid()) and p.role = 'driver'
      )
    )
  )
  with check (driver_id = (select auth.uid()) or (select private.is_admin()));

create policy "rides_update_admin"
  on public.rides
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ride_pins: rider (and admin) select only. No client writes.
create policy "ride_pins_select_rider"
  on public.ride_pins
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rides r
       where r.id = ride_id
         and r.rider_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

create policy "driver_locations_select"
  on public.driver_locations
  for select
  to authenticated
  using (
    driver_id = (select auth.uid())
    or is_online = true
    or (select private.is_admin())
  );

create policy "driver_locations_upsert_own"
  on public.driver_locations
  for insert
  to authenticated
  with check (driver_id = (select auth.uid()));

create policy "driver_locations_update_own"
  on public.driver_locations
  for update
  to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides'
  ) then
    execute 'alter publication supabase_realtime add table public.rides';
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_locations'
  ) then
    execute 'alter publication supabase_realtime add table public.driver_locations';
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_pins'
  ) then
    execute 'alter publication supabase_realtime add table public.ride_pins';
  end if;
end $$;

-- rollback:
-- alter publication supabase_realtime drop table if exists public.ride_pins;
-- alter publication supabase_realtime drop table if exists public.driver_locations;
-- alter publication supabase_realtime drop table if exists public.rides;
-- drop policy if exists "driver_locations_update_own" on public.driver_locations;
-- drop policy if exists "driver_locations_upsert_own" on public.driver_locations;
-- drop policy if exists "driver_locations_select" on public.driver_locations;
-- drop policy if exists "ride_pins_select_rider" on public.ride_pins;
-- drop policy if exists "rides_update_admin" on public.rides;
-- drop policy if exists "rides_update_driver" on public.rides;
-- drop policy if exists "rides_update_rider" on public.rides;
-- drop policy if exists "rides_insert_rider" on public.rides;
-- drop policy if exists "rides_select" on public.rides;
-- drop function if exists public.verify_trip_pin(uuid, text);
-- drop trigger if exists rides_guard on public.rides;
-- drop function if exists public.rides_guard();
-- drop table if exists public.driver_locations;
-- drop table if exists public.ride_pins;
-- drop table if exists public.rides;
-- drop type if exists public.vehicle_type;
-- drop type if exists public.ride_status;
