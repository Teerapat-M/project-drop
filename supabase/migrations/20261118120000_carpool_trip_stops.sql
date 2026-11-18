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
