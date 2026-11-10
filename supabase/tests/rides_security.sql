-- Attack-path assertions for 20261110180000_rides.sql.
-- Not run in CI (no live DB). Apply profiles + rides migrations on a throwaway
-- Postgres, stub auth.uid() / profiles like the PR review harness, then:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rides_security.sql
-- Server Jest mirrors the same rules in apps/server/src/rides/{rls,rides}.test.ts.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'ride_pins'
  ) then
    raise exception 'HIGH 1: ride_pins must not be in supabase_realtime';
  end if;

  if exists (
    select 1
      from pg_publication_tables p
      join information_schema.columns c
        on c.table_schema = p.schemaname and c.table_name = p.tablename
     where p.pubname = 'supabase_realtime'
       and c.column_name in ('pin', 'pin_hash', 'pin_hmac')
  ) then
    raise exception 'HIGH 1: published table carries a PIN column';
  end if;
end $$;

-- HIGH 2: rider cannot UPDATE status=accepted / driver_id=self.
-- Replace :rider with the test rider uuid. Expect exception or 0 rows.
-- update public.rides
--    set status = 'accepted', driver_id = :'rider'
--  where rider_id = :'rider' and status = 'requested';
-- expect: rider cannot change driver_id / WITH CHECK fail / driver cannot be the rider

-- HIGH 2: rider cannot accept_ride on their own request.
-- select public.accept_ride(:'ride_id');  -- as rider session
-- expect: driver role required

-- HIGH 2: rider cannot verify_trip_pin even after a forged driver_id.
-- select public.verify_trip_pin(:'ride_id', '1234');  -- as rider
-- expect: not assigned driver

-- MEDIUM: drivers cannot SELECT requested rows.
-- set role authenticated; -- as driver
-- select rider_id, pickup_label, dropoff_label from public.rides where status = 'requested';
-- expect: 0 rows

-- MEDIUM: nearby_requested_rides has no rider_id / dropoff.
-- select * from public.nearby_requested_rides(13.7466, 100.5347, 5000);
-- expect: columns id, vehicle_type, pickup_lat, pickup_lng, route_distance_m, route_duration_s, distance_m
do $$
declare
  sig text := pg_get_function_result(
    'public.nearby_requested_rides(double precision, double precision, double precision)'::regprocedure
  );
begin
  if sig ~* 'rider_id' or sig ~* 'dropoff' or sig ~* 'pickup_label' then
    raise exception 'MEDIUM: nearby_requested_rides leaks %', sig;
  end if;
  if sig !~ 'pickup_lat' or sig !~ 'vehicle_type' or sig !~ 'distance_m' then
    raise exception 'MEDIUM: nearby_requested_rides missing columns: %', sig;
  end if;
end $$;
