-- เพื่อนร่วมทาง C2.3: fixed taxi trunk (Bangkok Altis / Limo usable box).
-- NEW FILE. Do not edit 20261118100000_carpool.sql or 20261118120000_carpool_trip_stops.sql.
-- Do not apply this to the live `drop` project from CI. Bell runs it in the
-- SQL editor after 20261118120000_carpool_trip_stops.sql. CI applies it only
-- to ephemeral Postgres (supabase/tests/run-carpool-rls.sh).
--
-- Keep cm values in sync with TAXI_TRUNK_PRESET in packages/carpool-core/src/trunk.ts
-- (100 × 40 × 50 cm = 200 L usable after LPG/NGV tank).

create or replace function private.carpool_taxi_trunk()
returns table (width_cm numeric, height_cm numeric, length_cm numeric)
language sql
immutable
set search_path = ''
as $$
  select 100::numeric, 40::numeric, 50::numeric;
$$;

comment on function private.carpool_taxi_trunk() is
  'Fixed taxi-share trunk cm. Sync with TAXI_TRUNK_PRESET (carpool-core). SECURITY DEFINER callers only.';

revoke all on function private.carpool_taxi_trunk() from public, anon, authenticated;

-- Backfill BEFORE the trigger and CHECK. Live taxi rows may still have the old
-- create-form dims (e.g. 100×50×50). Adding the CHECK first would fail.
update public.carpool_trips t
   set trunk_w_cm = p.width_cm,
       trunk_h_cm = p.height_cm,
       trunk_l_cm = p.length_cm
  from private.carpool_taxi_trunk() p
 where t.kind = 'taxi'
   and (
     t.trunk_w_cm is distinct from p.width_cm
     or t.trunk_h_cm is distinct from p.height_cm
     or t.trunk_l_cm is distinct from p.length_cm
   );

-- Force the preset on taxi insert/update. Private-car dimensions stay as entered.
create or replace function public.carpool_trips_taxi_trunk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w numeric;
  h numeric;
  l numeric;
begin
  if new.kind = 'taxi' then
    select width_cm, height_cm, length_cm into w, h, l from private.carpool_taxi_trunk();
    new.trunk_w_cm := w;
    new.trunk_h_cm := h;
    new.trunk_l_cm := l;
  end if;
  return new;
end;
$$;

comment on function public.carpool_trips_taxi_trunk() is
  'Trigger-only: overwrite taxi trunk cm with the fixed preset. Private cars unchanged.';

drop trigger if exists carpool_trips_taxi_trunk on public.carpool_trips;
create trigger carpool_trips_taxi_trunk
  before insert or update on public.carpool_trips
  for each row
  execute function public.carpool_trips_taxi_trunk();

revoke execute on function public.carpool_trips_taxi_trunk() from public, anon, authenticated;

alter table public.carpool_trips
  drop constraint if exists carpool_trips_taxi_trunk_preset;

alter table public.carpool_trips
  add constraint carpool_trips_taxi_trunk_preset
  check (
    kind <> 'taxi'
    or (
      trunk_w_cm = 100
      and trunk_h_cm = 40
      and trunk_l_cm = 50
    )
  );

-- Origin/destination province + district (TIS 1099 codes). Nullable for
-- legacy rows. Not in Realtime.
alter table public.carpool_trips
  add column if not exists origin_province_code text,
  add column if not exists dest_province_code text,
  add column if not exists origin_district_code text,
  add column if not exists dest_district_code text;

alter table public.carpool_trips
  drop constraint if exists carpool_trips_origin_province_code;
alter table public.carpool_trips
  add constraint carpool_trips_origin_province_code
  check (origin_province_code is null or origin_province_code ~ '^[0-9]{2}$');
alter table public.carpool_trips
  drop constraint if exists carpool_trips_dest_province_code;
alter table public.carpool_trips
  add constraint carpool_trips_dest_province_code
  check (dest_province_code is null or dest_province_code ~ '^[0-9]{2}$');
alter table public.carpool_trips
  drop constraint if exists carpool_trips_origin_district_code;
alter table public.carpool_trips
  add constraint carpool_trips_origin_district_code
  check (origin_district_code is null or origin_district_code ~ '^[0-9]{4}$');
alter table public.carpool_trips
  drop constraint if exists carpool_trips_dest_district_code;
alter table public.carpool_trips
  add constraint carpool_trips_dest_district_code
  check (dest_district_code is null or dest_district_code ~ '^[0-9]{4}$');

-- TIS 1099: district code is province code + 2 digits. Reject a district
-- without its province. Legacy rows with both-null stay valid.
alter table public.carpool_trips
  drop constraint if exists carpool_trips_origin_district_matches_province;
alter table public.carpool_trips
  add constraint carpool_trips_origin_district_matches_province
  check (
    origin_district_code is null
    or (
      origin_province_code is not null
      and left(origin_district_code, 2) = origin_province_code
    )
  );
alter table public.carpool_trips
  drop constraint if exists carpool_trips_dest_district_matches_province;
alter table public.carpool_trips
  add constraint carpool_trips_dest_district_matches_province
  check (
    dest_district_code is null
    or (
      dest_province_code is not null
      and left(dest_district_code, 2) = dest_province_code
    )
  );

-- Taxi max detour (ระยะออกนอกเส้นทางสูงสุด). Sync with
-- MAX_DETOUR_KM_MIN/DEFAULT/MAX in packages/carpool-core/src/detour.ts
-- (1 / 5 / 30). Nullable for private; taxi required. Backfill BEFORE CHECK.
alter table public.carpool_trips
  add column if not exists max_detour_km numeric;

comment on column public.carpool_trips.max_detour_km is
  'Taxi cap on rider detour km. Null for private (for now). Min 1, default 5, max 30.';

update public.carpool_trips
   set max_detour_km = 5
 where kind = 'taxi'
   and max_detour_km is null;

create or replace function public.carpool_trips_max_detour()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'taxi' and new.max_detour_km is null then
    new.max_detour_km := 5;
  end if;
  return new;
end;
$$;

comment on function public.carpool_trips_max_detour() is
  'Trigger-only: default taxi max_detour_km to 5 when omitted. Private unchanged.';

drop trigger if exists carpool_trips_max_detour on public.carpool_trips;
create trigger carpool_trips_max_detour
  before insert or update on public.carpool_trips
  for each row
  execute function public.carpool_trips_max_detour();

revoke execute on function public.carpool_trips_max_detour() from public, anon, authenticated;

alter table public.carpool_trips
  drop constraint if exists carpool_trips_max_detour_km;

alter table public.carpool_trips
  add constraint carpool_trips_max_detour_km
  check (
    kind <> 'taxi'
    or (
      max_detour_km is not null
      and max_detour_km >= 1
      and max_detour_km <= 30
    )
  );

alter table public.carpool_trips
  drop constraint if exists carpool_trips_max_detour_range;

alter table public.carpool_trips
  add constraint carpool_trips_max_detour_range
  check (
    max_detour_km is null
    or (max_detour_km >= 1 and max_detour_km <= 30)
  );

-- Join preview: anonymized booked luggage (no rider ids, no owner flag).
-- Neutral order: volume desc, then H/W/D — not owner-first / created_at.
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
           'is_mine', t.owner_id = uid,
           'origin_province_code', t.origin_province_code,
           'dest_province_code', t.dest_province_code,
           'origin_district_code', t.origin_district_code,
           'dest_district_code', t.dest_district_code,
           'max_detour_km', t.max_detour_km,
           'stops', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'seq', st.seq,
               'address', st.address,
               'lat', pg_catalog.round(st.lat::numeric, 3),
               'lng', pg_catalog.round(st.lng::numeric, 3)
             ) order by st.seq), '[]'::jsonb)
               from public.carpool_trip_stops st
              where st.trip_id = t.id
           ),
           'luggage', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'height_cm', b.luggage_h_cm,
               'width_cm', b.luggage_w_cm,
               'depth_cm', b.luggage_d_cm
             ) order by
                 (b.luggage_h_cm * b.luggage_w_cm * b.luggage_d_cm) desc,
                 b.luggage_h_cm,
                 b.luggage_w_cm,
                 b.luggage_d_cm
             ), '[]'::jsonb)
               from public.carpool_bookings b
              where b.trip_id = t.id
                and b.luggage_h_cm is not null
                and b.luggage_w_cm is not null
                and b.luggage_d_cm is not null
           ),
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
  'Join-page preview: rounded coords, is_mine (never owner_id), anonymized seats and luggage (no rider ids). Luggage ordered by volume desc, then dims.';

revoke all on function public.carpool_trip_preview(uuid) from public, anon;
grant execute on function public.carpool_trip_preview(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Javis PR #10 L2: numeric NaN passes CHECK (detour_km >= 0) because
-- PostgreSQL treats numeric NaN as greater than every non-NaN value.
-- Backfill first so existing rows cannot violate the new CHECK.
-- carpool_bookings_guard restores OLD.detour_km when dest_* is unchanged,
-- so a plain UPDATE would leave NaN in place. Disable only that trigger
-- so FK and other triggers still fire. No inner BEGIN/COMMIT — the guard
-- is BEFORE, so ENABLE TRIGGER in the same migration transaction is safe.
-- ---------------------------------------------------------------------------
alter table public.carpool_bookings disable trigger carpool_bookings_guard;
update public.carpool_bookings
   set detour_km = 0
 where detour_km = 'NaN';
alter table public.carpool_bookings enable trigger carpool_bookings_guard;

alter table public.carpool_bookings
  drop constraint if exists carpool_bookings_detour_not_nan;

alter table public.carpool_bookings
  add constraint carpool_bookings_detour_not_nan
  check (detour_km <> 'NaN');

-- ---------------------------------------------------------------------------
-- Max-detour cap: RAISE Thai when the haversine floor exceeds the taxi cap.
-- Keep #10 floor via greatest(floor, client) when the pin is in range.
-- ---------------------------------------------------------------------------
create or replace function private.carpool_enforce_max_detour(
  p_trip_id uuid,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_client numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  floor_km numeric;
  stored numeric;
  k public.carpool_trip_kind;
  cap numeric;
begin
  floor_km := private.carpool_detour_floor_km(p_trip_id, p_dest_lat, p_dest_lng);
  stored := greatest(floor_km, coalesce(p_client, 0));
  select t.kind, t.max_detour_km into k, cap
    from public.carpool_trips t
   where t.id = p_trip_id;
  if k = 'taxi' and cap is not null and floor_km > cap then
    raise exception 'จุดลงนี้ออกนอกเส้นทาง % กม. เกินที่เจ้าของทริปกำหนด (สูงสุด % กม.)',
      rtrim(rtrim(pg_catalog.round(floor_km, 1)::text, '0'), '.'),
      rtrim(rtrim(pg_catalog.round(cap, 1)::text, '0'), '.');
  end if;
  return stored;
end;
$$;

comment on function private.carpool_enforce_max_detour(uuid, double precision, double precision, numeric) is
  'greatest(haversine floor, client); RAISE Thai when taxi floor > max_detour_km.';

revoke all on function private.carpool_enforce_max_detour(
  uuid, double precision, double precision, numeric
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Javis PR #10 L1: reject dest_* / luggage edits once the trip is in_progress,
-- completed, or cancelled. Keep #10: dest_* change recomputes the haversine floor;
-- otherwise NEW.detour_km = OLD.detour_km. Trigger-only (no EXECUTE grant).
-- Helpers stay in private with search_path ''. Nothing added to Realtime.
-- ---------------------------------------------------------------------------
create or replace function public.carpool_bookings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  st public.carpool_trip_status;
begin
  -- Authenticated has no INSERT/DELETE grant. RPCs are SECURITY DEFINER but
  -- auth.uid() is still the caller — do not reject user JWTs here.
  if tg_op = 'INSERT' then
    if uid is not null then
      new.rider_id := uid;
    end if;
    -- Same floor as carpool_book_seat: never store less than haversine;
    -- taxi floor may not exceed max_detour_km.
    new.detour_km := private.carpool_enforce_max_detour(
      new.trip_id, new.dest_lat, new.dest_lng, coalesce(new.detour_km, 0)
    );
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
  select t.status into st from public.carpool_trips t where t.id = new.trip_id;
  if st in ('in_progress', 'completed', 'cancelled')
     and (
       new.dest_label is distinct from old.dest_label
       or new.dest_lat is distinct from old.dest_lat
       or new.dest_lng is distinct from old.dest_lng
       or new.luggage_h_cm is distinct from old.luggage_h_cm
       or new.luggage_w_cm is distinct from old.luggage_w_cm
       or new.luggage_d_cm is distinct from old.luggage_d_cm
     ) then
    raise exception 'cannot change drop-off or luggage after the trip has started';
  end if;
  -- dest_* change: recompute floor vs client/NEW value. Else freeze detour_km.
  if new.dest_label is distinct from old.dest_label
     or new.dest_lat is distinct from old.dest_lat
     or new.dest_lng is distinct from old.dest_lng then
    new.detour_km := private.carpool_enforce_max_detour(
      new.trip_id, new.dest_lat, new.dest_lng, coalesce(new.detour_km, 0)
    );
  else
    new.detour_km := old.detour_km;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function public.carpool_bookings_guard() is
  'Freeze identity columns; dest_*/luggage frozen in_progress/completed/cancelled; dest_* recomputes detour floor; otherwise detour_km = OLD. Trigger-only.';

revoke execute on function public.carpool_bookings_guard() from public, anon, authenticated;

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
  detour numeric;
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

  -- Never store less than the haversine floor. Client may report more.
  -- Taxi: RAISE when the floor exceeds max_detour_km.
  detour := private.carpool_enforce_max_detour(
    p_trip_id, p_dest_lat, p_dest_lng, coalesce(p_detour_km, 0)
  );

  insert into public.carpool_bookings (
    trip_id, rider_id, seat_id,
    dest_label, dest_lat, dest_lng, detour_km,
    luggage_h_cm, luggage_w_cm, luggage_d_cm
  ) values (
    p_trip_id, uid, seat.id,
    p_dest_label, p_dest_lat, p_dest_lng, detour,
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
  'Atomic seat booking. SELECT FOR UPDATE; first confirm wins. Loser: ที่นั่งนี้เพิ่งถูกจอง. detour_km = greatest(haversine floor, client); taxi floor may not exceed max_detour_km.';

revoke all on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) to authenticated, service_role;

-- Discover: is_mine (never owner_id) + optional province/district filters.
drop function if exists public.carpool_discover_trips(public.carpool_trip_kind);

create function public.carpool_discover_trips(
  p_kind public.carpool_trip_kind default null,
  p_origin_province_code text default null,
  p_dest_province_code text default null,
  p_origin_district_code text default null,
  p_dest_district_code text default null
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
  owner_display_name text,
  is_mine boolean,
  origin_province_code text,
  dest_province_code text,
  origin_district_code text,
  dest_district_code text
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
         p.full_name as owner_display_name,
         (t.owner_id = uid) as is_mine,
         t.origin_province_code,
         t.dest_province_code,
         t.origin_district_code,
         t.dest_district_code
    from public.carpool_trips t
    join public.profiles p on p.id = t.owner_id
   where t.status in ('open', 'full')
     and (p_kind is null or t.kind = p_kind)
     and (p_origin_province_code is null or t.origin_province_code is not distinct from p_origin_province_code)
     and (p_dest_province_code is null or t.dest_province_code is not distinct from p_dest_province_code)
     and (p_origin_district_code is null or t.origin_district_code is not distinct from p_origin_district_code)
     and (p_dest_district_code is null or t.dest_district_code is not distinct from p_dest_district_code)
   order by t.depart_at
   limit 50;
end;
$$;

comment on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
) is
  'Trip-list discovery. Rounded coords, is_mine, no owner_id. Optional province/district filters.';

revoke all on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
) from public, anon;
grant execute on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
) to authenticated, service_role;
