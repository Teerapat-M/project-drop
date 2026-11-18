-- เพื่อนร่วมทาง C2.4: Javis LOW follow-ups on squash-merged PR #12.
-- NEW FILE. Do not edit 20261118100000 / 20261118120000 / 20261118130000
-- or any earlier migration (those are already applied remotely).
-- Do not apply this to any remote DB from CI. CI applies it only to
-- ephemeral Postgres (supabase/tests/run-carpool-rls.sh).
--
-- L1: carpool_discover_trips also returns max_detour_km (DROP + CREATE;
--     EXECUTE stays authenticated, service_role).
-- L3: owner cannot lower max_detour_km below any remaining booking's
--     haversine floor. L2 is intended: stored detour_km = greatest(floor,
--     client) may exceed the cap when a rider overreports, so this guard
--     matches private.carpool_enforce_max_detour and checks the floor,
--     not the stored value. Bookings have no status column; cancel is
--     DELETE via carpool_cancel_booking, so remaining rows are active.
-- Translation: English RAISE strings in carpool_bookings_guard → Thai.
-- L2: no change (intended).

-- ---------------------------------------------------------------------------
-- L1: discover list cards need the taxi cap. RETURNS TABLE change requires
-- DROP + CREATE. Re-grant EXECUTE exactly as 20261118130000.
-- ---------------------------------------------------------------------------
drop function if exists public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
);

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
  dest_district_code text,
  max_detour_km numeric
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
         t.dest_district_code,
         t.max_detour_km
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
  'Trip-list discovery. Rounded coords, is_mine, max_detour_km, no owner_id. Optional province/district filters.';

revoke all on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
) from public, anon;
grant execute on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- L3: extend the existing trips guard. Keep insert/owner/kind/vehicle/status
-- logic from 20261118100000. Trigger-only (no EXECUTE grant).
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
  -- detour_km. L2 is intended (stored may exceed the cap on overreport);
  -- private.carpool_enforce_max_detour also gates on floor_km > cap.
  -- Remaining carpool_bookings rows are active; cancel deletes the row.
  if new.max_detour_km is not null
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
  'Forces owner_id = auth.uid() on insert, status=open, taxi=>sedan, status transitions. Blocks lowering max_detour_km below any active booking floor.';

revoke execute on function public.carpool_trips_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bookings guard: same body as 20261118130000, Thai RAISE strings only.
-- No ERRCODE clauses existed; keep the raise exception form.
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
  'Freeze identity columns; dest_*/luggage frozen in_progress/completed/cancelled; dest_* recomputes detour floor; otherwise detour_km = OLD. Trigger-only. Thai RAISE.';

revoke execute on function public.carpool_bookings_guard() from public, anon, authenticated;
