-- เพื่อนร่วมทาง C2.2: persist create-trip จุดแวะ.
-- NEW FILE. Do not edit 20261118100000_carpool.sql.
-- Do not apply this to the live `drop` project from CI. Bell runs it in the
-- SQL editor after 20261118100000_carpool.sql. CI applies it only to ephemeral
-- Postgres (supabase/tests/run-carpool-rls.sh).
--
-- Table (not jsonb on carpool_trips): seq uniqueness, owner-only writes, and
-- SELECT that mirrors trip visibility via existing DEFINER helpers — jsonb
-- would dump exact coords onto every participant trip row with no per-stop
-- policy. Not added to supabase_realtime (coords are not a live seat flag).

create table public.carpool_trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.carpool_trips (id) on delete cascade,
  seq integer not null,
  lat double precision not null,
  lng double precision not null,
  address text not null,
  created_at timestamptz not null default now(),
  unique (trip_id, seq),
  constraint carpool_trip_stops_seq check (seq >= 1),
  constraint carpool_trip_stops_lat check (lat between -90 and 90),
  constraint carpool_trip_stops_lng check (lng between -180 and 180),
  constraint carpool_trip_stops_address_len check (char_length(address) between 1 and 200)
);

comment on table public.carpool_trip_stops is
  'Driver waypoints (จุดแวะ) in route order. SELECT mirrors carpool_trips; writes are owner-only. Not in Realtime.';

create index carpool_trip_stops_trip_id_idx on public.carpool_trip_stops (trip_id);

alter table public.carpool_trip_stops enable row level security;

revoke all on table public.carpool_trip_stops from public, anon, authenticated;
grant select, insert, update, delete on table public.carpool_trip_stops to authenticated;
grant all on table public.carpool_trip_stops to service_role;

-- Guard: trigger-only, no EXECUTE for anon/authenticated.
create or replace function public.carpool_trip_stops_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.trip_id is distinct from old.trip_id then
    raise exception 'cannot move a stop to another trip';
  end if;

  if uid is not null and not private.carpool_is_trip_owner(new.trip_id) then
    raise exception 'only the trip owner can edit stops';
  end if;

  select count(*)::int into n
    from public.carpool_trip_stops s
   where s.trip_id = new.trip_id
     and (tg_op = 'INSERT' or s.id is distinct from new.id);
  if n >= 4 then
    raise exception 'at most 4 waypoints per trip';
  end if;

  return new;
end;
$$;

comment on function public.carpool_trip_stops_guard() is
  'Owner-only writes, freeze trip_id, cap 4 waypoints. Trigger-only.';

drop trigger if exists carpool_trip_stops_guard on public.carpool_trip_stops;
create trigger carpool_trip_stops_guard
  before insert or update on public.carpool_trip_stops
  for each row
  execute function public.carpool_trip_stops_guard();

revoke execute on function public.carpool_trip_stops_guard() from public, anon, authenticated;

-- SELECT mirrors carpool_trips (owner / booked rider / admin). Writes: owner.
-- Helpers are SECURITY DEFINER so this never re-enters trips RLS (42P17).
create policy "carpool_trip_stops_select"
  on public.carpool_trip_stops
  for select
  to authenticated
  using (
    (select private.carpool_is_trip_owner(trip_id))
    or (select private.carpool_is_booked_rider(trip_id))
    or (select private.is_admin())
  );

create policy "carpool_trip_stops_insert_owner"
  on public.carpool_trip_stops
  for insert
  to authenticated
  with check ((select private.carpool_is_trip_owner(trip_id)));

create policy "carpool_trip_stops_update_owner"
  on public.carpool_trip_stops
  for update
  to authenticated
  using ((select private.carpool_is_trip_owner(trip_id)))
  with check ((select private.carpool_is_trip_owner(trip_id)));

create policy "carpool_trip_stops_delete_owner"
  on public.carpool_trip_stops
  for delete
  to authenticated
  using ((select private.carpool_is_trip_owner(trip_id)));

-- Join preview: same rounded coords as origin/dest, no owner_id. Discover stays
-- origin/dest-only (list cards); join/drop-off read stops here.
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
  'Join-page preview: rounded coords (origin/dest/stops), anonymized seats, no owner_id.';

revoke all on function public.carpool_trip_preview(uuid) from public, anon;
grant execute on function public.carpool_trip_preview(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Authoritative detour floor (do not trust client p_detour_km).
-- Haversine great-circle km; ROAD_FACTOR 1.3 because Thai roads are ~30%
-- longer than crow-flies (highways, one-ways). Not a live Routes measurement.
-- An Edge Function with a server-side Routes key would be more accurate but
-- needs Bell to mint a separate key — this floor is the merge-blocking fix.
-- Internal helpers: same grant pattern as private.carpool_refresh_status.
-- ---------------------------------------------------------------------------

create or replace function private.carpool_haversine_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 6371.0 * 2 * pg_catalog.asin(pg_catalog.sqrt(
    least(1.0, greatest(0.0,
      pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_lat2 - p_lat1) / 2), 2)
      + pg_catalog.cos(pg_catalog.radians(p_lat1))
        * pg_catalog.cos(pg_catalog.radians(p_lat2))
        * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_lng2 - p_lng1) / 2), 2)
    ))
  ));
$$;

comment on function private.carpool_haversine_km(double precision, double precision, double precision, double precision) is
  'Great-circle km (R=6371). Internal; used by carpool_detour_floor_km.';

revoke all on function private.carpool_haversine_km(
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;

create or replace function private.carpool_detour_floor_km(
  p_trip_id uuid,
  p_dest_lat double precision,
  p_dest_lng double precision
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- ROAD_FACTOR 1.3: great-circle underestimates on-road km in northern
  -- Thailand (highways vs crow-flies). Documented constant, not GPS/Routes.
  road_factor constant numeric := 1.3;
  trip public.carpool_trips%rowtype;
  st record;
  main_km double precision := 0;
  via_km double precision := 0;
  prev_lat double precision;
  prev_lng double precision;
begin
  if p_dest_lat is null or p_dest_lng is null then
    return 0;
  end if;

  select * into trip from public.carpool_trips t where t.id = p_trip_id;
  if not found then
    return 0;
  end if;

  prev_lat := trip.pickup_lat;
  prev_lng := trip.pickup_lng;
  for st in
    select s.lat, s.lng
      from public.carpool_trip_stops s
     where s.trip_id = p_trip_id
     order by s.seq
  loop
    main_km := main_km + private.carpool_haversine_km(prev_lat, prev_lng, st.lat, st.lng);
    prev_lat := st.lat;
    prev_lng := st.lng;
  end loop;
  main_km := main_km + private.carpool_haversine_km(prev_lat, prev_lng, trip.dest_lat, trip.dest_lng);

  prev_lat := trip.pickup_lat;
  prev_lng := trip.pickup_lng;
  for st in
    select s.lat, s.lng
      from public.carpool_trip_stops s
     where s.trip_id = p_trip_id
     order by s.seq
  loop
    via_km := via_km + private.carpool_haversine_km(prev_lat, prev_lng, st.lat, st.lng);
    prev_lat := st.lat;
    prev_lng := st.lng;
  end loop;
  via_km := via_km
    + private.carpool_haversine_km(prev_lat, prev_lng, p_dest_lat, p_dest_lng)
    + private.carpool_haversine_km(p_dest_lat, p_dest_lng, trip.dest_lat, trip.dest_lng);

  return pg_catalog.round(greatest(0, (via_km - main_km) * road_factor)::numeric, 3);
end;
$$;

comment on function private.carpool_detour_floor_km(uuid, double precision, double precision) is
  'max(0, (haversine via rider dest − haversine main path) * 1.3). Internal.';

revoke all on function private.carpool_detour_floor_km(uuid, double precision, double precision) from public, anon, authenticated;

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
  -- Detour surcharge is charged only to this requester (computeFare detourKm).
  detour := greatest(
    private.carpool_detour_floor_km(p_trip_id, p_dest_lat, p_dest_lng),
    coalesce(p_detour_km, 0)
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
  'Atomic seat booking. SELECT FOR UPDATE; first confirm wins. Loser: ที่นั่งนี้เพิ่งถูกจอง. detour_km = greatest(haversine floor, client).';
