-- Harden nearby_requested_rides: 10 km radius cap + anti-triangulation distance.
-- Do not apply this file from CI. Bell runs it in the SQL editor after 20261110180000_rides.sql
-- (already applied live — do not edit that file). create or replace only; same signature so
-- NearbyRide is unchanged. Do not apply anything to a live DB from an agent.
--
-- Constants must match packages/types:
--   NEARBY_RIDES_MAX_RADIUS_M = 10000
--   NEARBY_DISTANCE_BUCKET_M  = 250

create or replace function public.nearby_requested_rides(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 5000
)
returns table (
  id uuid,
  vehicle_type public.vehicle_type,
  pickup_lat double precision,
  pickup_lng double precision,
  route_distance_m integer,
  route_duration_s integer,
  distance_m integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  actor_role text;
  radius_m double precision;
  max_radius_m constant double precision := 10000;
  bucket_m constant double precision := 250;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select p.role into actor_role from public.profiles p where p.id = uid;
  if actor_role is distinct from 'driver' then
    raise exception 'driver role required';
  end if;

  radius_m := least(greatest(coalesce(p_radius_m, 5000), 0), max_radius_m);

  return query
  select q.id,
         q.vehicle_type,
         q.pickup_lat,
         q.pickup_lng,
         q.route_distance_m,
         q.route_duration_s,
         (ceil(q.raw_m / bucket_m) * bucket_m)::integer
    from (
      select r.id,
             r.vehicle_type,
             round(r.pickup_lat::numeric, 3)::double precision as pickup_lat,
             round(r.pickup_lng::numeric, 3)::double precision as pickup_lng,
             r.route_distance_m,
             r.route_duration_s,
             private.haversine_m(
               p_lat,
               p_lng,
               round(r.pickup_lat::numeric, 3)::double precision,
               round(r.pickup_lng::numeric, 3)::double precision
             ) as raw_m
        from public.rides r
       where r.status = 'requested'
         and r.driver_id is null
         and r.rider_id is distinct from uid
    ) q
   where q.raw_m <= radius_m
   order by q.raw_m
   limit 50;
end;
$$;

comment on function public.nearby_requested_rides(double precision, double precision, double precision) is
  'Driver matching queue. Radius clamped to 10 km. Distance is haversine to rounded pickup, then ceiled to 250 m. No rider_id or dropoff. Poll; do not use Realtime on requested rows.';

revoke all on function public.nearby_requested_rides(double precision, double precision, double precision) from public, anon;
grant execute on function public.nearby_requested_rides(double precision, double precision, double precision) to authenticated, service_role;
