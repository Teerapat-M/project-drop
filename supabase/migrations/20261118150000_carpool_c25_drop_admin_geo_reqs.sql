-- เพื่อนร่วมทาง C2.5: drop province/district requirements, nearby-point
-- search, Javis PR #13 LOWs (cancelled/completed cap skip + trip-row lock).
-- NEW FILE. Do not edit 20261118100000 / 20261118120000 / 20261118130000 /
-- 20261118140000 or any earlier migration (those are already applied remotely).
-- Do not apply this to any remote DB from CI. CI applies it only to
-- ephemeral Postgres (supabase/tests/run-carpool-rls.sh).
-- NOT applied to the live project.
--
-- CHECKs: DROP the L2 pairing CHECKs (district must belong to its province,
-- and district-without-province). KEEP the format CHECKs
-- (^[0-9]{2}$ / ^[0-9]{4}$) on non-null values so old clients that still
-- send codes keep working. Columns stay (never dropped) and are nullable.
--
-- Discover: DROP + CREATE. Province/district params stay in the signature
-- with NULL defaults (accepted, ignored) so old clients keep working.
-- New optional nearby-point params. Vertex haversine (not segment) on
-- coords rounded to 3 decimals; returned km snapped to 0.5.
-- extra_km dest component + taxi exclude use carpool_detour_floor_km
-- (same as book_seat). Lat/lng NaN/out-of-range raises Thai. Radius 1–30.
-- Lock order for trip+seat: trip FOR UPDATE first, then seat
-- (cancel_booking, claim_owner_seat, set_seat_open, refresh_status,
-- book_seat). Do not lock the trip from seats_guard.
--
-- L3 LOW (a): skip the cap-lowering floor check when the trip itself is
-- cancelled or completed. Remaining bookings on an open/full/in_progress
-- trip still pin the cap. Cancel of a booking is DELETE (carpool_cancel_booking);
-- trip status values: open, full, in_progress, completed, cancelled.
--
-- L3 LOW (b): serialize booking vs cap-lowering.
--   * carpool_book_seat: SELECT the trip row FOR UPDATE before cap/insert.
--   * trips_guard cap path: the UPDATE already holds the row lock; no extra
--     SELECT FOR UPDATE (BEFORE UPDATE runs after the row lock).
--   * bookings_guard dest_* (and insert) path: lock the trip FOR UPDATE
--     before private.carpool_enforce_max_detour so a concurrent cap lower
--     cannot slip between the floor check and the write.

-- ---------------------------------------------------------------------------
-- Geo columns: already nullable from 20261118130000. Drop pairing CHECKs.
-- Keep format CHECKs. Never drop the columns.
-- ---------------------------------------------------------------------------
alter table public.carpool_trips
  alter column origin_province_code drop not null,
  alter column dest_province_code drop not null,
  alter column origin_district_code drop not null,
  alter column dest_district_code drop not null;

alter table public.carpool_trips
  drop constraint if exists carpool_trips_origin_district_matches_province;
alter table public.carpool_trips
  drop constraint if exists carpool_trips_dest_district_matches_province;

-- ---------------------------------------------------------------------------
-- Route vertices + nearby-point match. Point-to-vertex haversine.
-- Helpers live in private, search_path '', no EXECUTE for clients.
-- ---------------------------------------------------------------------------
-- M1: round every search coordinate to 3 decimals (~111 m) before
-- haversine so returned distances cannot trilaterate stored points
-- (often an owner's home) to meter-level. Returned km are then snapped
-- to 0.5 km. L3: no GiST/sp-gist spatial index for now (PostGIS is not
-- enabled); bbox + vertex scan only.
-- TODO: add a spatial index (or grid prefilter) if discover volume needs it.

create or replace function private.carpool_round_deg(p double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p is null then null
    else pg_catalog.round(p::numeric, 3)::double precision
  end;
$$;

revoke all on function private.carpool_round_deg(double precision) from public, anon, authenticated;

create or replace function private.carpool_round_km_half(p numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p is null then null
    else pg_catalog.round(p * 2) / 2
  end;
$$;

revoke all on function private.carpool_round_km_half(numeric) from public, anon, authenticated;

create or replace function private.carpool_route_vertices(p_trip_id uuid)
returns table (idx integer, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select 0,
         private.carpool_round_deg(t.pickup_lat),
         private.carpool_round_deg(t.pickup_lng)
    from public.carpool_trips t
   where t.id = p_trip_id
  union all
  select s.seq,
         private.carpool_round_deg(s.lat),
         private.carpool_round_deg(s.lng)
    from public.carpool_trip_stops s
   where s.trip_id = p_trip_id
  union all
  select coalesce((
           select max(s.seq) from public.carpool_trip_stops s where s.trip_id = p_trip_id
         ), 0) + 1,
         private.carpool_round_deg(t.dest_lat),
         private.carpool_round_deg(t.dest_lng)
    from public.carpool_trips t
   where t.id = p_trip_id;
$$;

comment on function private.carpool_route_vertices(uuid) is
  'Ordered route vertices rounded to 3 decimals: origin (idx 0), stops by seq, destination. Internal.';

revoke all on function private.carpool_route_vertices(uuid) from public, anon, authenticated;

create or replace function private.carpool_search_distances(
  p_trip_id uuid,
  p_kind public.carpool_trip_kind,
  p_max_detour_km numeric,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_radius_km numeric
)
returns table (
  pickup_distance_km numeric,
  dest_distance_km numeric,
  extra_km numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  has_pickup boolean := (p_pickup_lat is not null and p_pickup_lng is not null);
  has_dest boolean := (p_dest_lat is not null and p_dest_lng is not null);
  v_radius numeric;
  pickup_lat double precision;
  pickup_lng double precision;
  dest_lat double precision;
  dest_lng double precision;
  i_p integer := 0;
  d_p double precision;
  d_d double precision;
  floor_km numeric;
  dist double precision;
  r record;
  lat_pad double precision;
  lng_pad double precision;
begin
  if not has_pickup and not has_dest then
    pickup_distance_km := null;
    dest_distance_km := null;
    extra_km := null;
    return next;
    return;
  end if;

  -- Radius 1–30 km, default 5. NaN/non-finite falls back to 5.
  v_radius := 5;
  if p_radius_km is not null and p_radius_km >= 1 and p_radius_km <= 30 then
    v_radius := p_radius_km;
  elsif p_radius_km is not null and p_radius_km < 1 then
    v_radius := 1;
  elsif p_radius_km is not null and p_radius_km > 30 then
    v_radius := 30;
  end if;

  pickup_lat := private.carpool_round_deg(p_pickup_lat);
  pickup_lng := private.carpool_round_deg(p_pickup_lng);
  dest_lat := private.carpool_round_deg(p_dest_lat);
  dest_lng := private.carpool_round_deg(p_dest_lng);

  if has_pickup then
    lat_pad := v_radius / 111.0 + 0.01;
    lng_pad := v_radius / (111.0 * greatest(0.2, pg_catalog.cos(pg_catalog.radians(pickup_lat)))) + 0.01;
    d_p := null;
    i_p := null;
    for r in
      select v.idx, v.lat, v.lng
        from private.carpool_route_vertices(p_trip_id) v
       order by v.idx
    loop
      if abs(r.lat - pickup_lat) > lat_pad or abs(r.lng - pickup_lng) > lng_pad then
        continue;
      end if;
      dist := private.carpool_haversine_km(pickup_lat, pickup_lng, r.lat, r.lng);
      if d_p is null or dist < d_p then
        d_p := dist;
        i_p := r.idx;
      end if;
    end loop;
    if i_p is null then
      for r in
        select v.idx, v.lat, v.lng
          from private.carpool_route_vertices(p_trip_id) v
         order by v.idx
      loop
        dist := private.carpool_haversine_km(pickup_lat, pickup_lng, r.lat, r.lng);
        if d_p is null or dist < d_p then
          d_p := dist;
          i_p := r.idx;
        end if;
      end loop;
    end if;
    if d_p is null or d_p > v_radius then
      return;
    end if;
  end if;

  if has_dest then
    lat_pad := v_radius / 111.0 + 0.01;
    lng_pad := v_radius / (111.0 * greatest(0.2, pg_catalog.cos(pg_catalog.radians(dest_lat)))) + 0.01;
    d_d := null;
    for r in
      select v.idx, v.lat, v.lng
        from private.carpool_route_vertices(p_trip_id) v
       where v.idx >= i_p
       order by v.idx
    loop
      if abs(r.lat - dest_lat) > lat_pad or abs(r.lng - dest_lng) > lng_pad then
        continue;
      end if;
      dist := private.carpool_haversine_km(dest_lat, dest_lng, r.lat, r.lng);
      if d_d is null or dist < d_d then
        d_d := dist;
      end if;
    end loop;
    if d_d is null then
      for r in
        select v.idx, v.lat, v.lng
          from private.carpool_route_vertices(p_trip_id) v
         where v.idx >= i_p
         order by v.idx
      loop
        dist := private.carpool_haversine_km(dest_lat, dest_lng, r.lat, r.lng);
        if d_d is null or dist < d_d then
          d_d := dist;
        end if;
      end loop;
    end if;
    if d_d is null or d_d > v_radius then
      return;
    end if;
    -- L1: same floor book_seat will enforce. Do not list a taxi the cap
    -- would reject. extra_km uses this floor for the dest component.
    floor_km := private.carpool_detour_floor_km(p_trip_id, p_dest_lat, p_dest_lng);
    if p_kind = 'taxi' and p_max_detour_km is not null and floor_km > p_max_detour_km then
      return;
    end if;
  end if;

  pickup_distance_km := case
    when has_pickup then private.carpool_round_km_half(d_p::numeric)
    else null
  end;
  dest_distance_km := case
    when has_dest then private.carpool_round_km_half(d_d::numeric)
    else null
  end;
  extra_km := private.carpool_round_km_half(
    (coalesce(d_p, 0) + coalesce(floor_km, 0))::numeric
  );
  return next;
end;
$$;

comment on function private.carpool_search_distances(
  uuid, public.carpool_trip_kind, numeric,
  double precision, double precision, double precision, double precision, numeric
) is
  'Point-to-vertex haversine on 3-decimal coords; km snapped to 0.5. Pickup i_p; dest idx >= i_p. extra_km dest component = carpool_detour_floor_km; taxi excluded when floor > max_detour_km. Internal.';

revoke all on function private.carpool_search_distances(
  uuid, public.carpool_trip_kind, numeric,
  double precision, double precision, double precision, double precision, numeric
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discover: nearby-point search. Province/district params kept, ignored.
-- DROP + CREATE because RETURNS TABLE gained columns. Re-grant EXECUTE
-- to authenticated, service_role only (anon gets none).
-- ---------------------------------------------------------------------------
drop function if exists public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
);

create function public.carpool_discover_trips(
  p_kind public.carpool_trip_kind default null,
  p_origin_province_code text default null,
  p_dest_province_code text default null,
  p_origin_district_code text default null,
  p_dest_district_code text default null,
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null,
  p_dest_lat double precision default null,
  p_dest_lng double precision default null,
  p_radius_km numeric default null
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
  dest_district_code text,
  max_detour_km numeric,
  pickup_distance_km numeric,
  dest_distance_km numeric,
  extra_km numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  want_geo boolean := (p_pickup_lat is not null and p_pickup_lng is not null)
                   or (p_dest_lat is not null and p_dest_lng is not null);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- L2: NaN / out-of-range lat/lng. Radius stays clamped 1–30 in the helper.
  if (p_pickup_lat is not null or p_pickup_lng is not null)
     and (
       p_pickup_lat is null or p_pickup_lng is null
       or p_pickup_lat not between -90 and 90
       or p_pickup_lng not between -180 and 180
     ) then
    raise exception 'พิกัดไม่ถูกต้อง ละติจูดต้องอยู่ระหว่าง -90 ถึง 90 และลองจิจูดระหว่าง -180 ถึง 180';
  end if;
  if (p_dest_lat is not null or p_dest_lng is not null)
     and (
       p_dest_lat is null or p_dest_lng is null
       or p_dest_lat not between -90 and 90
       or p_dest_lng not between -180 and 180
     ) then
    raise exception 'พิกัดไม่ถูกต้อง ละติจูดต้องอยู่ระหว่าง -90 ถึง 90 และลองจิจูดระหว่าง -180 ถึง 180';
  end if;

  -- p_origin/dest_province/district_code are accepted (NULL default) for
  -- old clients and ignored: nearby-point search replaced them.

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
         t.dest_district_code,
         t.max_detour_km,
         m.pickup_distance_km,
         m.dest_distance_km,
         m.extra_km
    from public.carpool_trips t
    join public.profiles p on p.id = t.owner_id
    left join lateral private.carpool_search_distances(
      t.id, t.kind, t.max_detour_km,
      p_pickup_lat, p_pickup_lng, p_dest_lat, p_dest_lng, p_radius_km
    ) m on true
   where t.status in ('open', 'full')
     and (p_kind is null or t.kind = p_kind)
     and (not want_geo or m.extra_km is not null)
   order by m.extra_km nulls last, t.depart_at
   limit 50;
end;
$$;

comment on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text,
  double precision, double precision, double precision, double precision, numeric
) is
  'Trip-list discovery. Rounded coords, is_mine, max_detour_km, nearby distances, no owner_id. Geo code params accepted-but-ignored. Nearby-point haversine (vertex).';

revoke all on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text,
  double precision, double precision, double precision, double precision, numeric
) from public, anon;
grant execute on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text,
  double precision, double precision, double precision, double precision, numeric
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- L3 LOW (a): skip cap-lowering when the trip is cancelled or completed.
-- L3 LOW (b): the UPDATE already locks this row; concurrent book_seat
-- SELECT … FOR UPDATE waits on that lock. No extra SELECT here.
-- Body copied from 20261118140000 with only those changes.
-- Trigger-only (no EXECUTE grant).
-- ---------------------------------------------------------------------------
create or replace function public.carpool_trips_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  max_floor numeric;
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
  -- Lowering the cap: compare the recomputed haversine floor, not stored
  -- detour_km. Skip when the trip itself is cancelled or completed (those
  -- bookings are historical; cancel_booking DELETEs a row, but a cancelled
  -- trip may still have leftover booking rows). The UPDATE already holds
  -- this row's lock, so a concurrent carpool_book_seat FOR UPDATE waits.
  if old.status not in ('cancelled', 'completed')
     and new.max_detour_km is not null
     and old.max_detour_km is not null
     and new.max_detour_km < old.max_detour_km then
    select max(private.carpool_detour_floor_km(b.trip_id, b.dest_lat, b.dest_lng))
      into max_floor
      from public.carpool_bookings b
     where b.trip_id = new.id;
    if max_floor is not null and new.max_detour_km < max_floor then
      raise exception 'ลดระยะออกนอกเส้นทางสูงสุดไม่ได้ มีผู้โดยสารที่จองไว้ออกนอกเส้นทาง % กม.',
        rtrim(rtrim(pg_catalog.round(max_floor, 1)::text, '0'), '.');
    end if;
  end if;
  return new;
end;
$$;

comment on function public.carpool_trips_guard() is
  'Forces owner_id = auth.uid() on insert, status=open, taxi=>sedan, status transitions. Blocks lowering max_detour_km below any active booking floor unless the trip is cancelled or completed. UPDATE already locks the row.';

revoke execute on function public.carpool_trips_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bookings guard: lock the trip FOR UPDATE on insert and dest_* change
-- before carpool_enforce_max_detour. Body from 20261118140000 otherwise.
-- Trigger-only. Thai RAISE. No EXECUTE grant.
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
    -- Serialize vs cap-lowering: lock the trip before the floor/cap check.
    perform 1 from public.carpool_trips t where t.id = new.trip_id for update;
    -- Same floor as carpool_book_seat: never store less than haversine;
    -- taxi floor may not exceed max_detour_km.
    new.detour_km := private.carpool_enforce_max_detour(
      new.trip_id, new.dest_lat, new.dest_lng, coalesce(new.detour_km, 0)
    );
    return new;
  end if;
  if tg_op = 'DELETE' then
    if uid is not null and old.rider_id is distinct from uid then
      raise exception 'เฉพาะผู้โดยสารที่ยกเลิกการจองได้';
    end if;
    return old;
  end if;
  if uid is not null then
    if new.rider_id is distinct from old.rider_id
       or new.trip_id is distinct from old.trip_id
       or new.seat_id is distinct from old.seat_id then
      raise exception 'ไม่สามารถโอนการจองได้';
    end if;
    if new.rider_id is distinct from uid then
      raise exception 'เฉพาะผู้โดยสารที่แก้ไขการจองได้';
    end if;
  end if;
  -- Lock the trip for freeze + dest_* recompute so a concurrent cap
  -- lowering cannot slip between the read and the write.
  select t.status into st from public.carpool_trips t where t.id = new.trip_id for update;
  if st in ('in_progress', 'completed', 'cancelled')
     and (
       new.dest_label is distinct from old.dest_label
       or new.dest_lat is distinct from old.dest_lat
       or new.dest_lng is distinct from old.dest_lng
       or new.luggage_h_cm is distinct from old.luggage_h_cm
       or new.luggage_w_cm is distinct from old.luggage_w_cm
       or new.luggage_d_cm is distinct from old.luggage_d_cm
     ) then
    raise exception 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว';
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
  'Freeze identity columns; dest_*/luggage frozen in_progress/completed/cancelled; dest_* recomputes detour floor; otherwise detour_km = OLD. Locks the trip FOR UPDATE on insert/dest change. Trigger-only. Thai RAISE.';

revoke execute on function public.carpool_bookings_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- carpool_book_seat: lock the trip row FOR UPDATE before cap check + insert.
-- Seat row lock kept. Body copied from 20261118130000 with that change.
-- ---------------------------------------------------------------------------
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

  -- Serialize vs cap-lowering: lock the trip before status/cap/insert.
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
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
  'Atomic seat booking. Locks trip then seat FOR UPDATE; first confirm wins. Loser: ที่นั่งนี้เพิ่งถูกจอง. detour_km = greatest(haversine floor, client); taxi floor may not exceed max_detour_km.';

revoke all on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- M2 deadlock: every path that touches trip + seat locks trip then seat.
-- cancel_booking previously UPDATEd the seat then refresh_status UPDATEd
-- the trip (opposite of book_seat). claim_owner_seat and set_seat_open
-- locked the seat (or updated it) before refresh_status took the trip.
-- refresh_status now SELECTs the trip FOR UPDATE first so a nested call
-- from a holder of the trip lock is a no-op re-lock.
-- seats_guard only READs trip.owner_id (no lock) while the seat row is
-- already locked by UPDATE — it must not SELECT the trip FOR UPDATE.
-- trips_seed_seats runs AFTER INSERT on the trip (trip already locked).
-- ---------------------------------------------------------------------------
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
  -- Trip first. Callers that already hold this row re-lock in-session.
  select t.status into st from public.carpool_trips t where t.id = p_trip_id for update;
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

revoke all on function private.carpool_refresh_status(uuid) from public, anon, authenticated;

create or replace function public.carpool_cancel_booking(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rec public.carpool_bookings%rowtype;
  trip public.carpool_trips%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
  if not found then
    raise exception 'trip not found';
  end if;
  if trip.status is distinct from 'open' and trip.status is distinct from 'full' then
    raise exception 'cannot cancel booking on this trip';
  end if;
  select * into rec
    from public.carpool_bookings b
   where b.trip_id = p_trip_id and b.rider_id = uid;
  if not found then
    raise exception 'booking not found';
  end if;

  perform 1 from public.carpool_seats s where s.id = rec.seat_id for update;

  delete from public.carpool_bookings b where b.id = rec.id;
  update public.carpool_seats s
     set is_booked = false, booked_at = null
   where s.id = rec.seat_id;
  perform private.carpool_refresh_status(p_trip_id);
end;
$$;

comment on function public.carpool_cancel_booking(uuid) is
  'Cancel own booking. Locks trip then seat FOR UPDATE, then DELETE + unbook. Trigger-only bookings_guard on DELETE.';

revoke all on function public.carpool_cancel_booking(uuid) from public, anon;
grant execute on function public.carpool_cancel_booking(uuid) to authenticated, service_role;

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
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
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
  'Taxi owner books own passenger seat. Locks trip then seat FOR UPDATE.';

revoke all on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) from public, anon;
grant execute on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) to authenticated, service_role;

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
  trip public.carpool_trips%rowtype;
  rec public.carpool_seats;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
  if trip.owner_id is distinct from uid then
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

comment on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) is
  'Owner toggles is_open. Locks trip then updates seat, then refresh_status.';

revoke all on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) from public, anon;
grant execute on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C2.5 rider drop-off privacy audit. No policy/RPC change: the existing
-- carpool_bookings_select (20261118100000) already allows SELECT only when
-- rider_id = auth.uid() OR trip owner OR admin. A rider cannot read another
-- passenger's dest_label/dest_lat/dest_lng. carpool_trip_preview luggage is
-- anonymized dims only (no dest). carpool_discover_trips does not return
-- booking dest. carpool_trip_stops are owner waypoints (seq/lat/lng/address),
-- not derived from other passengers' drop-offs; booked riders may SELECT
-- those route stops. No pickup column on bookings. No new SECURITY DEFINER
-- RPC: the booked-trip page reads carpool_bookings with rider_id = auth.uid()
-- and RLS already hides everyone else.
-- ---------------------------------------------------------------------------
