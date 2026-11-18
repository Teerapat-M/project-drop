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

-- Join preview: anonymized booked luggage (no rider ids). Creator first.
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
           'luggage', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'height_cm', b.luggage_h_cm,
               'width_cm', b.luggage_w_cm,
               'depth_cm', b.luggage_d_cm
             ) order by (b.rider_id = t.owner_id) desc, b.created_at, b.id), '[]'::jsonb)
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
  'Join-page preview: rounded coords, anonymized seats and luggage (no rider ids), no owner_id. Creator luggage first.';

revoke all on function public.carpool_trip_preview(uuid) from public, anon;
grant execute on function public.carpool_trip_preview(uuid) to authenticated, service_role;
