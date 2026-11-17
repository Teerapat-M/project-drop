-- เพื่อนร่วมทาง (carpool) Phase C2.
-- Do not apply this file to the live `drop` project from CI. Bell runs it in
-- the SQL editor (or `supabase db push`) after 20261111120000_revoke_trigger_fn_execute.
-- CI applies it only to an ephemeral Postgres (supabase/tests/run-carpool-rls.sh).
--
-- Design:
-- * EXISTING Supabase project `drop`. SHARED auth (auth.users / public.profiles).
-- * Separate tables with a `carpool_` prefix in `public` (already exposed to
--   PostgREST / supabase-js). No extra `carpool` schema — Bell does NOT need
--   to add an Exposed schema.
-- * Do not alter Drop tables/functions (rides, ride_pins, messages, profiles, …).
-- * Never publish ride_pins. This file only ADDS carpool_seats + carpool_messages
--   to supabase_realtime.
--
-- Discovery (non-participants / trip list):
--   Clients cannot SELECT public.carpool_trips unless they own it or have a
--   booking (exact addresses, lat/lng, owner_id stay off the list).
--   Use public.carpool_discover_trips() / carpool_trip_preview():
--     - owner-typed pickup/dest labels (treat as city-level in the UI)
--     - lat/lng rounded to 3 decimals (~111 m), not the stored coords
--     - seat counts, trunk cm, host display name (profiles.full_name)
--     - NO owner_id, NO rider ids, NO booking rows, NO exact addresses
--   Seat identities live on carpool_bookings (participants + owner only).
--   carpool_seats has is_booked boolean only — safe to SELECT + Realtime for
--   anyone looking at an open/full trip (first-confirm-wins UI).
--
-- Booking: public.carpool_book_seat() is the only path. SECURITY DEFINER,
--   SELECT … FOR UPDATE, conditional UPDATE. First confirm wins; the loser
--   gets exception message exactly: ที่นั่งนี้เพิ่งถูกจอง
--   Clients cannot set booked identity on seats (there is no booked_by column).

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'carpool_trip_kind') then
    create type public.carpool_trip_kind as enum ('taxi', 'private');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'carpool_vehicle_type') then
    create type public.carpool_vehicle_type as enum ('sedan', 'hatch', 'pickup');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'carpool_trip_status') then
    create type public.carpool_trip_status as enum (
      'open', 'full', 'in_progress', 'completed', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'carpool_seat_position') then
    -- sedan: front_passenger, rear_left, rear_middle, rear_right (driver is locked, not a row)
    -- hatch / pickup: front_passenger, rear_left, rear_right (no rear_middle)
    create type public.carpool_seat_position as enum (
      'front_passenger', 'rear_left', 'rear_middle', 'rear_right'
    );
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'carpool_address_kind') then
    create type public.carpool_address_kind as enum ('home', 'work', 'custom');
  end if;
end $$;

comment on type public.carpool_seat_position is
  'Passenger seats. sedan includes rear_middle; hatch/pickup do not. Driver is never a row.';

grant usage on type public.carpool_trip_kind to authenticated, service_role;
grant usage on type public.carpool_vehicle_type to authenticated, service_role;
grant usage on type public.carpool_trip_status to authenticated, service_role;
grant usage on type public.carpool_seat_position to authenticated, service_role;
grant usage on type public.carpool_address_kind to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.carpool_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  kind public.carpool_trip_kind not null,
  vehicle_type public.carpool_vehicle_type not null,
  car_icon text not null default 'sedan',
  trunk_w_cm numeric not null,
  trunk_h_cm numeric not null,
  trunk_l_cm numeric not null,
  route_km numeric not null,
  pickup_label text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dest_label text not null,
  dest_lat double precision not null,
  dest_lng double precision not null,
  depart_at timestamptz not null,
  status public.carpool_trip_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carpool_trips_pickup_lat check (pickup_lat between -90 and 90),
  constraint carpool_trips_pickup_lng check (pickup_lng between -180 and 180),
  constraint carpool_trips_dest_lat check (dest_lat between -90 and 90),
  constraint carpool_trips_dest_lng check (dest_lng between -180 and 180),
  constraint carpool_trips_route_km check (route_km >= 0),
  constraint carpool_trips_trunk_w check (trunk_w_cm > 0),
  constraint carpool_trips_trunk_h check (trunk_h_cm > 0),
  constraint carpool_trips_trunk_l check (trunk_l_cm > 0),
  constraint carpool_trips_taxi_sedan check (kind <> 'taxi' or vehicle_type = 'sedan'),
  constraint carpool_trips_car_icon_len check (char_length(car_icon) between 1 and 40)
);

comment on table public.carpool_trips is
  'เพื่อนร่วมทาง trip. Full row is owner + booked participants only. Discovery uses carpool_discover_trips().';

create table public.carpool_seats (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.carpool_trips (id) on delete cascade,
  position public.carpool_seat_position not null,
  is_open boolean not null default true,
  is_booked boolean not null default false,
  booked_at timestamptz,
  unique (trip_id, position)
);

comment on table public.carpool_seats is
  'Passenger seats. is_booked is a flag only — rider identity is on carpool_bookings. In supabase_realtime.';
comment on column public.carpool_seats.is_booked is
  'Set only by carpool_book_seat / carpool_claim_owner_seat / carpool_cancel_booking. Clients cannot write this column.';

create table public.carpool_bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.carpool_trips (id) on delete cascade,
  rider_id uuid not null references public.profiles (id) on delete restrict,
  seat_id uuid not null references public.carpool_seats (id) on delete restrict,
  dest_label text not null,
  dest_lat double precision not null,
  dest_lng double precision not null,
  detour_km numeric not null default 0,
  luggage_h_cm numeric,
  luggage_w_cm numeric,
  luggage_d_cm numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, rider_id),
  unique (seat_id),
  constraint carpool_bookings_dest_lat check (dest_lat between -90 and 90),
  constraint carpool_bookings_dest_lng check (dest_lng between -180 and 180),
  constraint carpool_bookings_detour check (detour_km >= 0),
  constraint carpool_bookings_luggage_h check (luggage_h_cm is null or luggage_h_cm >= 0),
  constraint carpool_bookings_luggage_w check (luggage_w_cm is null or luggage_w_cm >= 0),
  constraint carpool_bookings_luggage_d check (luggage_d_cm is null or luggage_d_cm >= 0)
);

comment on table public.carpool_bookings is
  'One booking per rider per trip: drop-off, detour_km, luggage cm. Insert/delete only via SECURITY DEFINER RPCs.';

create table public.carpool_saved_addresses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind public.carpool_address_kind not null,
  label text not null,
  address_text text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carpool_saved_addresses_lat check (lat between -90 and 90),
  constraint carpool_saved_addresses_lng check (lng between -180 and 180)
);

comment on table public.carpool_saved_addresses is
  'Home / work / custom addresses. Owner-only RLS.';

create table public.carpool_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.carpool_trips (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

comment on table public.carpool_messages is
  'Trip chat. Participants only. Read-only after completed/cancelled. In supabase_realtime.';

create index carpool_trips_owner_id_idx on public.carpool_trips (owner_id);
create index carpool_trips_status_depart_idx on public.carpool_trips (status, depart_at);
create index carpool_seats_trip_id_idx on public.carpool_seats (trip_id);
create index carpool_bookings_trip_id_idx on public.carpool_bookings (trip_id);
create index carpool_bookings_rider_id_idx on public.carpool_bookings (rider_id);
create index carpool_saved_addresses_owner_id_idx on public.carpool_saved_addresses (owner_id);
create index carpool_messages_trip_created_idx on public.carpool_messages (trip_id, created_at);

alter table public.carpool_trips enable row level security;
alter table public.carpool_seats enable row level security;
alter table public.carpool_bookings enable row level security;
alter table public.carpool_saved_addresses enable row level security;
alter table public.carpool_messages enable row level security;

revoke all on table public.carpool_trips from public, anon, authenticated;
revoke all on table public.carpool_seats from public, anon, authenticated;
revoke all on table public.carpool_bookings from public, anon, authenticated;
revoke all on table public.carpool_saved_addresses from public, anon, authenticated;
revoke all on table public.carpool_messages from public, anon, authenticated;

grant select, insert, update on table public.carpool_trips to authenticated;
grant select on table public.carpool_seats to authenticated;
grant update (is_open) on table public.carpool_seats to authenticated;
grant select on table public.carpool_bookings to authenticated;
grant update (
  dest_label, dest_lat, dest_lng, detour_km,
  luggage_h_cm, luggage_w_cm, luggage_d_cm, updated_at
) on table public.carpool_bookings to authenticated;
grant select, insert, update, delete on table public.carpool_saved_addresses to authenticated;
grant select on table public.carpool_messages to authenticated;
grant insert (trip_id, sender_id, body) on table public.carpool_messages to authenticated;

grant all on table public.carpool_trips to service_role;
grant all on table public.carpool_seats to service_role;
grant all on table public.carpool_bookings to service_role;
grant all on table public.carpool_saved_addresses to service_role;
grant all on table public.carpool_messages to service_role;

-- ---------------------------------------------------------------------------
-- private helpers (not PostgREST RPCs)
-- ---------------------------------------------------------------------------

create or replace function private.carpool_positions(p_type public.carpool_vehicle_type)
returns public.carpool_seat_position[]
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'sedan' then array[
      'front_passenger', 'rear_left', 'rear_middle', 'rear_right'
    ]::public.carpool_seat_position[]
    else array[
      'front_passenger', 'rear_left', 'rear_right'
    ]::public.carpool_seat_position[]
  end;
$$;

comment on function private.carpool_positions(public.carpool_vehicle_type) is
  'sedan: 4 passenger seats including rear_middle. hatch/pickup: 3 (no rear_middle).';

-- Two-arg form for trigger/RPC internals (auth.uid() may be passed in).
-- RLS policies MUST use the one-arg helpers below so they never SELECT
-- carpool_trips / carpool_bookings under RLS (that cycle 42P17's).
create or replace function private.carpool_is_participant(p_trip_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.carpool_trips t
       where t.id = p_trip_id and t.owner_id = p_uid
    )
    or exists (
      select 1 from public.carpool_bookings b
       where b.trip_id = p_trip_id and b.rider_id = p_uid
    );
$$;

create or replace function private.carpool_is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.carpool_trips t
     where t.id = p_trip_id
       and t.owner_id = (select auth.uid())
  );
$$;

create or replace function private.carpool_is_booked_rider(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.carpool_bookings b
     where b.trip_id = p_trip_id
       and b.rider_id = (select auth.uid())
  );
$$;

create or replace function private.carpool_is_participant(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.carpool_trips t
       where t.id = p_trip_id and t.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.carpool_bookings b
       where b.trip_id = p_trip_id and b.rider_id = (select auth.uid())
    );
$$;

create or replace function private.carpool_can_select_seat(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.carpool_trips t
       where t.id = p_trip_id
         and (
           t.owner_id = (select auth.uid())
           or t.status in ('open', 'full')
         )
    )
    or exists (
      select 1 from public.carpool_bookings b
       where b.trip_id = p_trip_id and b.rider_id = (select auth.uid())
    )
    or (select private.is_admin());
$$;

create or replace function private.carpool_trip_chat_open(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.carpool_trips t
     where t.id = p_trip_id
       and t.status in ('open', 'full', 'in_progress')
  );
$$;

comment on function private.carpool_is_trip_owner(uuid) is
  'SECURITY DEFINER. True when auth.uid() owns the trip. Safe in RLS (no trips↔bookings cycle).';
comment on function private.carpool_is_booked_rider(uuid) is
  'SECURITY DEFINER. True when auth.uid() has a carpool_bookings row. Safe in RLS.';
comment on function private.carpool_is_participant(uuid) is
  'SECURITY DEFINER. Owner or booked rider for auth.uid(). Used by message policies.';
comment on function private.carpool_can_select_seat(uuid) is
  'SECURITY DEFINER. Owner, booked rider, admin, or open/full trip (anonymized seats).';

create or replace function private.carpool_refresh_status(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.carpool_trip_status;
  leftover int;
begin
  select t.status into st from public.carpool_trips t where t.id = p_trip_id;
  if st is null or st in ('completed', 'cancelled', 'in_progress') then
    return;
  end if;
  select count(*)::int into leftover
    from public.carpool_seats s
   where s.trip_id = p_trip_id
     and s.is_open = true
     and s.is_booked = false;
  if leftover = 0 then
    update public.carpool_trips
       set status = 'full', updated_at = pg_catalog.now()
     where id = p_trip_id and status in ('open', 'full');
  else
    update public.carpool_trips
       set status = 'open', updated_at = pg_catalog.now()
     where id = p_trip_id and status in ('open', 'full');
  end if;
end;
$$;

revoke all on function private.carpool_positions(public.carpool_vehicle_type) from public, anon, authenticated;
revoke all on function private.carpool_is_participant(uuid, uuid) from public, anon, authenticated;
revoke all on function private.carpool_refresh_status(uuid) from public, anon, authenticated;

-- Policy helpers: authenticated may EXECUTE (RLS expressions run as the invoker).
-- Triggers/RPCs are SECURITY DEFINER so they do not need these grants.
revoke all on function private.carpool_is_trip_owner(uuid) from public, anon;
grant execute on function private.carpool_is_trip_owner(uuid) to authenticated;
revoke all on function private.carpool_is_booked_rider(uuid) from public, anon;
grant execute on function private.carpool_is_booked_rider(uuid) to authenticated;
revoke all on function private.carpool_is_participant(uuid) from public, anon;
grant execute on function private.carpool_is_participant(uuid) to authenticated;
revoke all on function private.carpool_can_select_seat(uuid) from public, anon;
grant execute on function private.carpool_can_select_seat(uuid) to authenticated;
revoke all on function private.carpool_trip_chat_open(uuid) from public, anon;
grant execute on function private.carpool_trip_chat_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- guards (trigger-only; no EXECUTE for anon/authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.carpool_trips_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.owner_id := uid;
    end if;
    new.status := 'open';
    new.updated_at := pg_catalog.now();
    if new.kind = 'taxi' then
      new.vehicle_type := 'sedan';
    end if;
    return new;
  end if;

  new.updated_at := pg_catalog.now();
  if new.owner_id is distinct from old.owner_id then
    raise exception 'cannot change owner_id';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'cannot change trip kind';
  end if;
  if new.vehicle_type is distinct from old.vehicle_type then
    raise exception 'cannot change vehicle_type';
  end if;
  if old.status is distinct from new.status then
    if not (
      (old.status = 'open' and new.status in ('full', 'in_progress', 'cancelled'))
      or (old.status = 'full' and new.status in ('open', 'in_progress', 'cancelled'))
      or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'invalid carpool status transition from % to %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.carpool_trips_guard() is
  'Forces owner_id = auth.uid() on insert, status=open, taxi=>sedan, status transitions.';

create or replace function public.carpool_trips_seed_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.carpool_seats (trip_id, position, is_open, is_booked)
  select new.id, pos, true, false
    from pg_catalog.unnest(private.carpool_positions(new.vehicle_type)) as pos;
  return new;
end;
$$;

create or replace function public.carpool_seats_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  owner uuid;
begin
  if tg_op = 'INSERT' then
    -- Authenticated has no INSERT grant; only carpool_trips_seed_seats inserts.
    if new.is_booked then
      raise exception 'seats insert cannot set is_booked';
    end if;
    return new;
  end if;

  if new.trip_id is distinct from old.trip_id
     or new.position is distinct from old.position then
    raise exception 'cannot move a seat';
  end if;

  -- Clients are granted UPDATE (is_open) only. Booking RPCs (definer) may set
  -- is_booked; auth.uid() is still the caller, so do not reset that flag here.
  if uid is not null and new.is_open is distinct from old.is_open then
    select t.owner_id into owner from public.carpool_trips t where t.id = new.trip_id;
    if uid is distinct from owner then
      raise exception 'only the trip owner can update seats';
    end if;
    if old.is_booked then
      raise exception 'cannot open/close a booked seat';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.carpool_seats_guard() is
  'Owner may toggle is_open on unbooked seats. Clients cannot write is_booked.';

create or replace function public.carpool_bookings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  -- Authenticated has no INSERT/DELETE grant. RPCs are SECURITY DEFINER but
  -- auth.uid() is still the caller — do not reject user JWTs here.
  if tg_op = 'INSERT' then
    if uid is not null then
      new.rider_id := uid;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if uid is not null and old.rider_id is distinct from uid then
      raise exception 'only the rider can cancel their booking';
    end if;
    return old;
  end if;
  if uid is not null then
    if new.rider_id is distinct from old.rider_id
       or new.trip_id is distinct from old.trip_id
       or new.seat_id is distinct from old.seat_id then
      raise exception 'cannot reassign a booking';
    end if;
    if new.rider_id is distinct from uid then
      raise exception 'only the rider can edit their booking';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.carpool_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  st public.carpool_trip_status;
begin
  if tg_op = 'UPDATE' then
    if uid is not null then
      raise exception 'carpool messages are immutable';
    end if;
    return new;
  end if;
  if tg_op <> 'INSERT' then
    return new;
  end if;

  select t.status into st from public.carpool_trips t where t.id = new.trip_id;
  if st is null then
    raise exception 'trip not found';
  end if;
  if st in ('completed', 'cancelled') then
    raise exception 'chat is read-only for this trip';
  end if;
  if uid is not null then
    new.sender_id := uid;
    if not private.carpool_is_participant(new.trip_id, uid) then
      raise exception 'not a trip participant';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.carpool_messages_guard() is
  'Forces sender_id = auth.uid(), participants only, read-only after completed/cancelled.';

create or replace function public.carpool_saved_addresses_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is not null then
    new.owner_id := uid;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists carpool_trips_guard on public.carpool_trips;
create trigger carpool_trips_guard
  before insert or update on public.carpool_trips
  for each row
  execute function public.carpool_trips_guard();

drop trigger if exists carpool_trips_seed_seats on public.carpool_trips;
create trigger carpool_trips_seed_seats
  after insert on public.carpool_trips
  for each row
  execute function public.carpool_trips_seed_seats();

drop trigger if exists carpool_seats_guard on public.carpool_seats;
create trigger carpool_seats_guard
  before insert or update on public.carpool_seats
  for each row
  execute function public.carpool_seats_guard();

drop trigger if exists carpool_bookings_guard on public.carpool_bookings;
create trigger carpool_bookings_guard
  before insert or update or delete on public.carpool_bookings
  for each row
  execute function public.carpool_bookings_guard();

drop trigger if exists carpool_messages_guard on public.carpool_messages;
create trigger carpool_messages_guard
  before insert or update on public.carpool_messages
  for each row
  execute function public.carpool_messages_guard();

drop trigger if exists carpool_saved_addresses_guard on public.carpool_saved_addresses;
create trigger carpool_saved_addresses_guard
  before insert or update on public.carpool_saved_addresses
  for each row
  execute function public.carpool_saved_addresses_guard();

revoke execute on function public.carpool_trips_guard() from public, anon, authenticated;
revoke execute on function public.carpool_trips_seed_seats() from public, anon, authenticated;
revoke execute on function public.carpool_seats_guard() from public, anon, authenticated;
revoke execute on function public.carpool_bookings_guard() from public, anon, authenticated;
revoke execute on function public.carpool_messages_guard() from public, anon, authenticated;
revoke execute on function public.carpool_saved_addresses_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs (authenticated only)
-- ---------------------------------------------------------------------------

create or replace function public.carpool_discover_trips(
  p_kind public.carpool_trip_kind default null
)
returns table (
  id uuid,
  kind public.carpool_trip_kind,
  vehicle_type public.carpool_vehicle_type,
  car_icon text,
  route_km numeric,
  depart_at timestamptz,
  status public.carpool_trip_status,
  pickup_label text,
  dest_label text,
  pickup_lat double precision,
  pickup_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  trunk_w_cm numeric,
  trunk_h_cm numeric,
  trunk_l_cm numeric,
  open_seats integer,
  bookable_seats integer,
  owner_display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select t.id,
         t.kind,
         t.vehicle_type,
         t.car_icon,
         t.route_km,
         t.depart_at,
         t.status,
         t.pickup_label,
         t.dest_label,
         pg_catalog.round(t.pickup_lat::numeric, 3)::double precision,
         pg_catalog.round(t.pickup_lng::numeric, 3)::double precision,
         pg_catalog.round(t.dest_lat::numeric, 3)::double precision,
         pg_catalog.round(t.dest_lng::numeric, 3)::double precision,
         t.trunk_w_cm,
         t.trunk_h_cm,
         t.trunk_l_cm,
         (
           select count(*)::int from public.carpool_seats s
            where s.trip_id = t.id and s.is_open and not s.is_booked
         ) as open_seats,
         (
           select count(*)::int from public.carpool_seats s
            where s.trip_id = t.id and s.is_open
         ) as bookable_seats,
         p.full_name as owner_display_name
    from public.carpool_trips t
    join public.profiles p on p.id = t.owner_id
   where t.status in ('open', 'full')
     and (p_kind is null or t.kind = p_kind)
   order by t.depart_at
   limit 50;
end;
$$;

comment on function public.carpool_discover_trips(public.carpool_trip_kind) is
  'Trip-list discovery. Rounded coords, no owner_id, no rider identities. Labels are owner-typed.';

create or replace function public.carpool_trip_preview(p_trip_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rec jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select jsonb_build_object(
           'id', t.id,
           'kind', t.kind,
           'vehicle_type', t.vehicle_type,
           'car_icon', t.car_icon,
           'route_km', t.route_km,
           'depart_at', t.depart_at,
           'status', t.status,
           'pickup_label', t.pickup_label,
           'dest_label', t.dest_label,
           'pickup_lat', pg_catalog.round(t.pickup_lat::numeric, 3),
           'pickup_lng', pg_catalog.round(t.pickup_lng::numeric, 3),
           'dest_lat', pg_catalog.round(t.dest_lat::numeric, 3),
           'dest_lng', pg_catalog.round(t.dest_lng::numeric, 3),
           'trunk_w_cm', t.trunk_w_cm,
           'trunk_h_cm', t.trunk_h_cm,
           'trunk_l_cm', t.trunk_l_cm,
           'owner_display_name', p.full_name,
           'seats', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'position', s.position,
               'is_open', s.is_open,
               'is_booked', s.is_booked
             ) order by s.position), '[]'::jsonb)
               from public.carpool_seats s
              where s.trip_id = t.id
           )
         )
    into rec
    from public.carpool_trips t
    join public.profiles p on p.id = t.owner_id
   where t.id = p_trip_id
     and t.status in ('open', 'full', 'in_progress', 'completed', 'cancelled');

  if rec is null then
    raise exception 'trip not found';
  end if;
  return rec;
end;
$$;

comment on function public.carpool_trip_preview(uuid) is
  'Join-page preview: rounded coords, anonymized seats (no rider ids).';

create or replace function public.carpool_book_seat(
  p_trip_id uuid,
  p_position public.carpool_seat_position,
  p_dest_label text,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_detour_km numeric default 0,
  p_luggage_h_cm numeric default null,
  p_luggage_w_cm numeric default null,
  p_luggage_d_cm numeric default null
)
returns public.carpool_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  trip public.carpool_trips%rowtype;
  seat public.carpool_seats%rowtype;
  rec public.carpool_bookings;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into trip from public.carpool_trips t where t.id = p_trip_id;
  if not found then
    raise exception 'trip not found';
  end if;
  if trip.status is distinct from 'open' then
    raise exception 'ทริปนี้ไม่ได้เปิดรับจอง';
  end if;
  if trip.owner_id = uid then
    raise exception 'ไม่สามารถจองทริปของตนเองได้';
  end if;
  if exists (
    select 1 from public.carpool_bookings b
     where b.trip_id = p_trip_id and b.rider_id = uid
  ) then
    raise exception 'คุณจองทริปนี้แล้ว';
  end if;

  select * into seat
    from public.carpool_seats s
   where s.trip_id = p_trip_id
     and s.position = p_position
   for update;

  if not found then
    raise exception 'seat not found';
  end if;
  if seat.is_open is distinct from true then
    raise exception 'ที่นั่งนี้ปิดอยู่';
  end if;
  if seat.is_booked then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  update public.carpool_seats s
     set is_booked = true,
         booked_at = pg_catalog.now()
   where s.id = seat.id
     and s.is_open = true
     and s.is_booked = false
  returning * into seat;

  if not found then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  insert into public.carpool_bookings (
    trip_id, rider_id, seat_id,
    dest_label, dest_lat, dest_lng, detour_km,
    luggage_h_cm, luggage_w_cm, luggage_d_cm
  ) values (
    p_trip_id, uid, seat.id,
    p_dest_label, p_dest_lat, p_dest_lng, coalesce(p_detour_km, 0),
    p_luggage_h_cm, p_luggage_w_cm, p_luggage_d_cm
  ) returning * into rec;

  perform private.carpool_refresh_status(p_trip_id);
  return rec;
end;
$$;

comment on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) is
  'Atomic seat booking. SELECT FOR UPDATE; first confirm wins. Loser: ที่นั่งนี้เพิ่งถูกจอง';

create or replace function public.carpool_claim_owner_seat(
  p_trip_id uuid,
  p_position public.carpool_seat_position,
  p_luggage_h_cm numeric default null,
  p_luggage_w_cm numeric default null,
  p_luggage_d_cm numeric default null
)
returns public.carpool_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  trip public.carpool_trips%rowtype;
  seat public.carpool_seats%rowtype;
  rec public.carpool_bookings;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into trip from public.carpool_trips t where t.id = p_trip_id;
  if not found then
    raise exception 'trip not found';
  end if;
  if trip.owner_id is distinct from uid then
    raise exception 'only the trip owner';
  end if;
  if trip.kind is distinct from 'taxi' then
    raise exception 'owner seat claim is taxi only';
  end if;
  if trip.status is distinct from 'open' then
    raise exception 'ทริปนี้ไม่ได้เปิดรับจอง';
  end if;
  if exists (
    select 1 from public.carpool_bookings b
     where b.trip_id = p_trip_id and b.rider_id = uid
  ) then
    raise exception 'คุณจองทริปนี้แล้ว';
  end if;

  select * into seat
    from public.carpool_seats s
   where s.trip_id = p_trip_id and s.position = p_position
   for update;
  if not found then
    raise exception 'seat not found';
  end if;
  if seat.is_open is distinct from true then
    raise exception 'ที่นั่งนี้ปิดอยู่';
  end if;
  if seat.is_booked then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  update public.carpool_seats s
     set is_booked = true, booked_at = pg_catalog.now()
   where s.id = seat.id and s.is_open = true and s.is_booked = false
  returning * into seat;
  if not found then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  insert into public.carpool_bookings (
    trip_id, rider_id, seat_id,
    dest_label, dest_lat, dest_lng, detour_km,
    luggage_h_cm, luggage_w_cm, luggage_d_cm
  ) values (
    p_trip_id, uid, seat.id,
    trip.dest_label, trip.dest_lat, trip.dest_lng, 0,
    p_luggage_h_cm, p_luggage_w_cm, p_luggage_d_cm
  ) returning * into rec;

  perform private.carpool_refresh_status(p_trip_id);
  return rec;
end;
$$;

comment on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) is
  'Taxi trip owner books their own passenger seat at create time. Private-car owners do not sit as riders.';

create or replace function public.carpool_cancel_booking(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rec public.carpool_bookings%rowtype;
  st public.carpool_trip_status;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select t.status into st from public.carpool_trips t where t.id = p_trip_id;
  if st is distinct from 'open' and st is distinct from 'full' then
    raise exception 'cannot cancel booking on this trip';
  end if;
  select * into rec
    from public.carpool_bookings b
   where b.trip_id = p_trip_id and b.rider_id = uid;
  if not found then
    raise exception 'booking not found';
  end if;

  delete from public.carpool_bookings b where b.id = rec.id;
  update public.carpool_seats s
     set is_booked = false, booked_at = null
   where s.id = rec.seat_id;
  perform private.carpool_refresh_status(p_trip_id);
end;
$$;

create or replace function public.carpool_set_seat_open(
  p_trip_id uuid,
  p_position public.carpool_seat_position,
  p_is_open boolean
)
returns public.carpool_seats
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  owner uuid;
  rec public.carpool_seats;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select t.owner_id into owner from public.carpool_trips t where t.id = p_trip_id;
  if owner is distinct from uid then
    raise exception 'only the trip owner';
  end if;

  update public.carpool_seats s
     set is_open = p_is_open
   where s.trip_id = p_trip_id
     and s.position = p_position
     and s.is_booked = false
  returning * into rec;
  if not found then
    raise exception 'cannot open/close a booked seat';
  end if;
  perform private.carpool_refresh_status(p_trip_id);
  return rec;
end;
$$;

revoke all on function public.carpool_discover_trips(public.carpool_trip_kind) from public, anon;
grant execute on function public.carpool_discover_trips(public.carpool_trip_kind) to authenticated, service_role;

revoke all on function public.carpool_trip_preview(uuid) from public, anon;
grant execute on function public.carpool_trip_preview(uuid) to authenticated, service_role;

revoke all on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) to authenticated, service_role;

revoke all on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) from public, anon;
grant execute on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) to authenticated, service_role;

revoke all on function public.carpool_cancel_booking(uuid) from public, anon;
grant execute on function public.carpool_cancel_booking(uuid) to authenticated, service_role;

revoke all on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) from public, anon;
grant execute on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

create policy "carpool_trips_select_participants"
  on public.carpool_trips
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (select private.carpool_is_booked_rider(id))
    or (select private.is_admin())
  );

create policy "carpool_trips_insert_owner"
  on public.carpool_trips
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'open'
  );

create policy "carpool_trips_update_owner"
  on public.carpool_trips
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Open/full seats are visible so joiners can Realtime-subscribe without identities.
-- Uses DEFINER helper so this never re-enters carpool_trips / carpool_bookings RLS.
create policy "carpool_seats_select"
  on public.carpool_seats
  for select
  to authenticated
  using ((select private.carpool_can_select_seat(trip_id)));

create policy "carpool_seats_update_owner"
  on public.carpool_seats
  for update
  to authenticated
  using ((select private.carpool_is_trip_owner(trip_id)))
  with check ((select private.carpool_is_trip_owner(trip_id)));

create policy "carpool_bookings_select"
  on public.carpool_bookings
  for select
  to authenticated
  using (
    rider_id = (select auth.uid())
    or (select private.carpool_is_trip_owner(trip_id))
    or (select private.is_admin())
  );

create policy "carpool_bookings_update_own"
  on public.carpool_bookings
  for update
  to authenticated
  using (rider_id = (select auth.uid()))
  with check (rider_id = (select auth.uid()));

create policy "carpool_saved_addresses_owner"
  on public.carpool_saved_addresses
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "carpool_messages_select_participants"
  on public.carpool_messages
  for select
  to authenticated
  using (
    (select private.carpool_is_participant(trip_id))
    or (select private.is_admin())
  );

create policy "carpool_messages_insert_participants"
  on public.carpool_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.carpool_is_participant(trip_id))
    and (select private.carpool_trip_chat_open(trip_id))
  );

-- Realtime: carpool seats + chat. Never ride_pins.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'carpool_seats'
  ) then
    execute 'alter publication supabase_realtime add table public.carpool_seats';
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'carpool_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.carpool_messages';
  end if;
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'ride_pins'
  ) then
    execute 'alter publication supabase_realtime drop table public.ride_pins';
  end if;
end $$;

-- rollback:
-- alter publication supabase_realtime drop table if exists public.carpool_messages;
-- alter publication supabase_realtime drop table if exists public.carpool_seats;
-- drop policy if exists "carpool_messages_insert_participants" on public.carpool_messages;
-- drop policy if exists "carpool_messages_select_participants" on public.carpool_messages;
-- drop policy if exists "carpool_saved_addresses_owner" on public.carpool_saved_addresses;
-- drop policy if exists "carpool_bookings_update_own" on public.carpool_bookings;
-- drop policy if exists "carpool_bookings_select" on public.carpool_bookings;
-- drop policy if exists "carpool_seats_update_owner" on public.carpool_seats;
-- drop policy if exists "carpool_seats_select" on public.carpool_seats;
-- drop policy if exists "carpool_trips_update_owner" on public.carpool_trips;
-- drop policy if exists "carpool_trips_insert_owner" on public.carpool_trips;
-- drop policy if exists "carpool_trips_select_participants" on public.carpool_trips;
-- drop function if exists public.carpool_set_seat_open(uuid, public.carpool_seat_position, boolean);
-- drop function if exists public.carpool_cancel_booking(uuid);
-- drop function if exists public.carpool_claim_owner_seat(uuid, public.carpool_seat_position, numeric, numeric, numeric);
-- drop function if exists public.carpool_book_seat(uuid, public.carpool_seat_position, text, double precision, double precision, numeric, numeric, numeric, numeric);
-- drop function if exists public.carpool_trip_preview(uuid);
-- drop function if exists public.carpool_discover_trips(public.carpool_trip_kind);
-- drop trigger if exists carpool_saved_addresses_guard on public.carpool_saved_addresses;
-- drop trigger if exists carpool_messages_guard on public.carpool_messages;
-- drop trigger if exists carpool_bookings_guard on public.carpool_bookings;
-- drop trigger if exists carpool_seats_guard on public.carpool_seats;
-- drop trigger if exists carpool_trips_seed_seats on public.carpool_trips;
-- drop trigger if exists carpool_trips_guard on public.carpool_trips;
-- drop function if exists public.carpool_saved_addresses_guard();
-- drop function if exists public.carpool_messages_guard();
-- drop function if exists public.carpool_bookings_guard();
-- drop function if exists public.carpool_seats_guard();
-- drop function if exists public.carpool_trips_seed_seats();
-- drop function if exists public.carpool_trips_guard();
-- drop function if exists private.carpool_refresh_status(uuid);
-- drop function if exists private.carpool_trip_chat_open(uuid);
-- drop function if exists private.carpool_can_select_seat(uuid);
-- drop function if exists private.carpool_is_participant(uuid);
-- drop function if exists private.carpool_is_booked_rider(uuid);
-- drop function if exists private.carpool_is_trip_owner(uuid);
-- drop function if exists private.carpool_is_participant(uuid, uuid);
-- drop function if exists private.carpool_positions(public.carpool_vehicle_type);
-- drop table if exists public.carpool_messages;
-- drop table if exists public.carpool_saved_addresses;
-- drop table if exists public.carpool_bookings;
-- drop table if exists public.carpool_seats;
-- drop table if exists public.carpool_trips;
-- drop type if exists public.carpool_address_kind;
-- drop type if exists public.carpool_seat_position;
-- drop type if exists public.carpool_trip_status;
-- drop type if exists public.carpool_vehicle_type;
-- drop type if exists public.carpool_trip_kind;
