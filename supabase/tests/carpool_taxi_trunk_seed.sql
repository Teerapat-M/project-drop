-- Seed legacy rows BEFORE 20261118130000_carpool_taxi_trunk.sql.
-- Taxi 100×50×50 is the old create-form default; private keeps custom dims.
-- CI: supabase/tests/run-carpool-rls.sh. Do not point this at the live drop project.

insert into auth.users (id, email, raw_user_meta_data) values
  (
    '00000000-0000-4000-8000-0000000000a0',
    'trunk-backfill@test.local',
    jsonb_build_object('full_name', 'Backfill')
  );

insert into public.carpool_trips (
  id, owner_id, kind, vehicle_type, car_icon,
  trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
  pickup_label, pickup_lat, pickup_lng,
  dest_label, dest_lat, dest_lng, depart_at, status
) values
  (
    '00000000-0000-4000-8000-0000000000aa',
    '00000000-0000-4000-8000-0000000000a0',
    'taxi', 'sedan', 'taxi',
    100, 50, 50, 12,
    'กรุงเทพฯ', 13.75, 100.5,
    'อยุธยา', 14.35, 100.57, now() + interval '3 day', 'open'
  ),
  (
    '00000000-0000-4000-8000-0000000000ab',
    '00000000-0000-4000-8000-0000000000a0',
    'private', 'pickup', 'pickup',
    140, 40, 150, 80,
    'ขอนแก่น', 16.432, 102.836,
    'อุดรธานี', 17.415, 102.787, now() + interval '4 day', 'open'
  );

-- Legacy NaN detour (numeric NaN passes detour_km >= 0). Skip the guard so
-- the row actually stores NaN; 20261118130000 backfills then CHECKs.
-- is_local set_config only lasts for this transaction.
begin;
select set_config('session_replication_role', 'replica', true);

insert into public.carpool_bookings (
  id, trip_id, rider_id, seat_id,
  dest_label, dest_lat, dest_lng, detour_km
)
select
  '00000000-0000-4000-8000-0000000000ac',
  '00000000-0000-4000-8000-0000000000aa',
  '00000000-0000-4000-8000-0000000000a0',
  s.id,
  'อยุธยา', 14.35, 100.57, 'NaN'::numeric
from public.carpool_seats s
where s.trip_id = '00000000-0000-4000-8000-0000000000aa'
  and s.position = 'front_passenger';

select set_config('session_replication_role', 'origin', true);
commit;
