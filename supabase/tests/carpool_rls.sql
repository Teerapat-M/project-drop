-- Catalog + behavioral RLS for 20261118100000_carpool.sql,
-- 20261118120000_carpool_trip_stops.sql, 20261118130000_carpool_taxi_trunk.sql,
-- and 20261118140000_carpool_c24_lows.sql.
-- Taxi-trunk backfill (legacy 100×50×50) runs in run-carpool-rls.sh around
-- that migration, via carpool_taxi_trunk_seed.sql / carpool_taxi_trunk_backfill.sql.
-- CI: supabase/tests/run-carpool-rls.sh (shim + profiles + carpool on ephemeral Postgres).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/carpool_rls.sql
-- Recursion (42P17) or missing EXECUTE on policy helpers fails this file.
-- Server Jest still mirrors migration text in apps/server/src/carpool/migration.test.ts.

-- Realtime: seats + carpool messages in; ride_pins never.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'carpool_seats'
  ) then
    raise exception 'carpool_seats must be in supabase_realtime';
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'carpool_messages'
  ) then
    raise exception 'carpool_messages must be in supabase_realtime';
  end if;
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'ride_pins'
  ) then
    raise exception 'ride_pins must not be in supabase_realtime';
  end if;
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'carpool_trip_stops'
  ) then
    raise exception 'carpool_trip_stops must not be in supabase_realtime';
  end if;
end $$;

-- Trigger-only SECURITY DEFINER functions must not be callable via /rest/v1/rpc.
do $$
begin
  if has_function_privilege('anon', 'public.carpool_trips_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_trips_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_trips_guard()';
  end if;
  if has_function_privilege('anon', 'public.carpool_trips_seed_seats()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_trips_seed_seats()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_trips_seed_seats()';
  end if;
  if has_function_privilege('anon', 'public.carpool_seats_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_seats_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_seats_guard()';
  end if;
  if has_function_privilege('anon', 'public.carpool_bookings_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_bookings_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_bookings_guard()';
  end if;
  if has_function_privilege('anon', 'public.carpool_messages_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_messages_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_messages_guard()';
  end if;
  if has_function_privilege('anon', 'public.carpool_saved_addresses_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_saved_addresses_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_saved_addresses_guard()';
  end if;
  if has_function_privilege('anon', 'public.carpool_trip_stops_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_trip_stops_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_trip_stops_guard()';
  end if;
  if has_function_privilege('anon', 'public.carpool_trips_taxi_trunk()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.carpool_trips_taxi_trunk()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.carpool_trips_taxi_trunk()';
  end if;
end $$;

-- Intentional RPCs stay executable by authenticated; anon has none.
do $$
declare
  book_sig text := 'public.carpool_book_seat(uuid, public.carpool_seat_position, text, double precision, double precision, numeric, numeric, numeric, numeric)';
  claim_sig text := 'public.carpool_claim_owner_seat(uuid, public.carpool_seat_position, numeric, numeric, numeric)';
  set_sig text := 'public.carpool_set_seat_open(uuid, public.carpool_seat_position, boolean)';
begin
  if not has_function_privilege(
       'authenticated',
       'public.carpool_discover_trips(public.carpool_trip_kind, text, text, text, text)',
       'EXECUTE'
     ) then
    raise exception 'authenticated must EXECUTE public.carpool_discover_trips';
  end if;
  if not has_function_privilege('authenticated', 'public.carpool_trip_preview(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.carpool_trip_preview';
  end if;
  if not has_function_privilege('authenticated', book_sig, 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.carpool_book_seat';
  end if;
  if not has_function_privilege('authenticated', claim_sig, 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.carpool_claim_owner_seat';
  end if;
  if not has_function_privilege('authenticated', 'public.carpool_cancel_booking(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.carpool_cancel_booking';
  end if;
  if not has_function_privilege('authenticated', set_sig, 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.carpool_set_seat_open';
  end if;
  if has_function_privilege('anon', book_sig, 'EXECUTE')
     or has_function_privilege(
          'anon',
          'public.carpool_discover_trips(public.carpool_trip_kind, text, text, text, text)',
          'EXECUTE'
        ) then
    raise exception 'anon must not EXECUTE carpool RPCs';
  end if;
end $$;

-- Policy helpers: authenticated EXECUTE, anon/public revoked. Two-arg participant stays internal.
do $$
begin
  if not has_function_privilege('authenticated', 'private.carpool_is_trip_owner(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE private.carpool_is_trip_owner';
  end if;
  if not has_function_privilege('authenticated', 'private.carpool_is_booked_rider(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE private.carpool_is_booked_rider';
  end if;
  if not has_function_privilege('authenticated', 'private.carpool_is_participant(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE private.carpool_is_participant(uuid)';
  end if;
  if not has_function_privilege('authenticated', 'private.carpool_can_select_seat(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE private.carpool_can_select_seat';
  end if;
  if not has_function_privilege('authenticated', 'private.carpool_trip_chat_open(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE private.carpool_trip_chat_open';
  end if;
  if has_function_privilege('authenticated', 'private.carpool_is_participant(uuid, uuid)', 'EXECUTE') then
    raise exception 'authenticated must not EXECUTE two-arg private.carpool_is_participant';
  end if;
  if has_function_privilege(
       'authenticated',
       'private.carpool_haversine_km(double precision, double precision, double precision, double precision)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.carpool_detour_floor_km(uuid, double precision, double precision)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.carpool_enforce_max_detour(uuid, double precision, double precision, numeric)',
       'EXECUTE'
     ) then
    raise exception 'authenticated must not EXECUTE detour floor helpers';
  end if;
  if has_function_privilege('anon', 'private.carpool_is_participant(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'private.carpool_is_trip_owner(uuid)', 'EXECUTE') then
    raise exception 'anon must not EXECUTE carpool policy helpers';
  end if;
  if has_column_privilege('authenticated', 'public.carpool_bookings', 'detour_km', 'UPDATE') then
    raise exception 'authenticated must not UPDATE carpool_bookings.detour_km';
  end if;
  if not has_column_privilege('authenticated', 'public.carpool_bookings', 'dest_lat', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.carpool_bookings', 'dest_lng', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.carpool_bookings', 'dest_label', 'UPDATE') then
    raise exception 'authenticated must still UPDATE dest_* on carpool_bookings';
  end if;
  if has_function_privilege('authenticated', 'private.carpool_taxi_trunk()', 'EXECUTE')
     or has_function_privilege('anon', 'private.carpool_taxi_trunk()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE private.carpool_taxi_trunk';
  end if;
end $$;

-- Booking RPC: row lock, exact Thai conflict message, own-trip / not-open / closed.
do $$
declare
  def text := pg_get_functiondef(
    'public.carpool_book_seat(uuid, public.carpool_seat_position, text, double precision, double precision, numeric, numeric, numeric, numeric)'::regprocedure
  );
  enforce text := pg_get_functiondef(
    'private.carpool_enforce_max_detour(uuid, double precision, double precision, numeric)'::regprocedure
  );
begin
  if def !~ 'for update' then
    raise exception 'carpool_book_seat must lock the seat row FOR UPDATE: %', def;
  end if;
  if def !~ 'ที่นั่งนี้เพิ่งถูกจอง' then
    raise exception 'carpool_book_seat must raise exactly ที่นั่งนี้เพิ่งถูกจอง';
  end if;
  if def !~ 'ไม่สามารถจองทริปของตนเองได้' then
    raise exception 'carpool_book_seat must block booking your own trip';
  end if;
  if def !~ 'ทริปนี้ไม่ได้เปิดรับจอง' then
    raise exception 'carpool_book_seat must block when the trip is not open';
  end if;
  if def !~ 'ที่นั่งนี้ปิดอยู่' then
    raise exception 'carpool_book_seat must block closed seats';
  end if;
  if def !~ 'คุณจองทริปนี้แล้ว' then
    raise exception 'carpool_book_seat must block double-booking the same user';
  end if;
  if def !~ 'search_path' then
    raise exception 'carpool_book_seat must set search_path';
  end if;
  if def !~ 'carpool_enforce_max_detour' then
    raise exception 'carpool_book_seat must apply a server detour floor';
  end if;
  if enforce !~ 'carpool_detour_floor_km' then
    raise exception 'carpool_enforce_max_detour must call the haversine floor';
  end if;
  if enforce !~ 'greatest' then
    raise exception 'carpool_book_seat must store greatest(floor, client detour)';
  end if;
end $$;

-- C2.4: bookings_guard RAISE is Thai; discover returns max_detour_km, never owner_id.
do $$
declare
  guard text := pg_get_functiondef('public.carpool_bookings_guard()'::regprocedure);
  trips_guard text := pg_get_functiondef('public.carpool_trips_guard()'::regprocedure);
  discover text := pg_get_functiondef(
    'public.carpool_discover_trips(public.carpool_trip_kind, text, text, text, text)'::regprocedure
  );
begin
  if guard ~ 'cannot change drop-off or luggage after the trip has started'
     or guard ~ 'only the rider can cancel their booking'
     or guard ~ 'cannot reassign a booking'
     or guard ~ 'only the rider can edit their booking' then
    raise exception 'carpool_bookings_guard must not raise English';
  end if;
  if guard !~ 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว' then
    raise exception 'carpool_bookings_guard missing Thai freeze message';
  end if;
  if guard !~ 'เฉพาะผู้โดยสารที่ยกเลิกการจองได้' then
    raise exception 'carpool_bookings_guard missing Thai cancel message';
  end if;
  if guard !~ 'ไม่สามารถโอนการจองได้' then
    raise exception 'carpool_bookings_guard missing Thai reassign message';
  end if;
  if guard !~ 'เฉพาะผู้โดยสารที่แก้ไขการจองได้' then
    raise exception 'carpool_bookings_guard missing Thai edit message';
  end if;
  if discover !~ 't.max_detour_km' then
    raise exception 'carpool_discover_trips must return max_detour_km';
  end if;
  if discover ~ 't.owner_id as' or discover ~ '''owner_id''' then
    raise exception 'carpool_discover_trips must not return owner_id';
  end if;
  if discover !~ 'is_mine' then
    raise exception 'carpool_discover_trips must keep is_mine';
  end if;
  if discover !~ 'p_origin_province_code' then
    raise exception 'carpool_discover_trips must keep geo filters';
  end if;
  if trips_guard !~ 'ลดระยะออกนอกเส้นทางสูงสุดไม่ได้' then
    raise exception 'carpool_trips_guard must block lowering max_detour_km in Thai';
  end if;
  if trips_guard !~ 'carpool_detour_floor_km' then
    raise exception 'carpool_trips_guard L3 must compare the haversine floor';
  end if;
end $$;

-- Every definer function sets search_path.
do $$
declare
  missing text;
begin
  select string_agg(p.proname, ', ')
    into missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname like '%carpool%'
     and p.prosecdef
     and coalesce(p.proconfig, array[]::text[])::text not like '%search_path%';
  if missing is not null then
    raise exception 'carpool SECURITY DEFINER functions missing search_path: %', missing;
  end if;
end $$;

-- Seats table has no booked_by (identity lives on bookings).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'carpool_seats'
       and column_name = 'booked_by'
  ) then
    raise exception 'carpool_seats must not expose booked_by';
  end if;
end $$;

-- RLS enabled on every carpool table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'carpool_trips', 'carpool_seats', 'carpool_bookings',
    'carpool_saved_addresses', 'carpool_messages', 'carpool_trip_stops'
  ] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      raise exception '% RLS is not enabled', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Behavioral RLS (roles + jwt claims). Recursion here must fail CI.
-- ---------------------------------------------------------------------------

create schema if not exists tests;

create table if not exists tests.ids (
  k text primary key,
  id uuid not null
);

create table if not exists tests.passed (
  name text primary key
);

create or replace function tests.login(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    false
  );
end;
$$;

create or replace function tests.ok(p_name text)
returns void
language sql
as $$
  insert into tests.passed (name) values (p_name) on conflict do nothing;
$$;

create or replace function tests.expect_raise(p_sql text, p_exact text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'expected error % from %', p_exact, p_sql;
exception
  when raise_exception then
    if sqlerrm = 'expected error ' || p_exact || ' from ' || p_sql then
      raise;
    end if;
    if sqlerrm is distinct from p_exact then
      raise exception 'expected %, got %', p_exact, sqlerrm;
    end if;
end;
$$;

grant usage on schema tests to authenticated;
grant select, insert on tests.ids, tests.passed to authenticated;
grant execute on function tests.login(uuid) to authenticated;
grant execute on function tests.ok(text) to authenticated;
grant execute on function tests.expect_raise(text, text) to authenticated;

do $$
declare
  owner uuid := '00000000-0000-4000-8000-000000000001';
  rider uuid := '00000000-0000-4000-8000-000000000002';
  rider2 uuid := '00000000-0000-4000-8000-000000000003';
  stranger uuid := '00000000-0000-4000-8000-000000000004';
  admin_id uuid := '00000000-0000-4000-8000-000000000005';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (owner, 'owner@test.local', jsonb_build_object('full_name', 'Owner')),
    (rider, 'rider@test.local', jsonb_build_object('full_name', 'Rider')),
    (rider2, 'rider2@test.local', jsonb_build_object('full_name', 'Rider2')),
    (stranger, 'stranger@test.local', jsonb_build_object('full_name', 'Stranger')),
    (admin_id, 'admin@test.local', jsonb_build_object('full_name', 'Admin'));
  update public.profiles set role = 'rider' where id in (owner, rider, rider2, stranger);
  update public.profiles set role = 'admin' where id = admin_id;
  insert into tests.ids (k, id) values
    ('owner', owner),
    ('rider', rider),
    ('rider2', rider2),
    ('stranger', stranger),
    ('admin', admin_id);
end $$;

-- Owner INSERT … RETURNING (CreateTripPage insert().select()) + SELECT trip/seats.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  uid uuid;
  trip uuid;
  n int;
  msg uuid;
begin
  select id into uid from tests.ids where k = 'owner';
  insert into public.carpool_trips (
    owner_id, kind, vehicle_type, car_icon,
    trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
    pickup_label, pickup_lat, pickup_lng,
    dest_label, dest_lat, dest_lng, depart_at, status
  ) values (
    uid, 'private', 'sedan', 'sedan',
    100, 50, 50, 12,
    'เชียงใหม่', 18.7888, 98.985,
    'ลำพูน', 18.574, 99.009, now() + interval '1 day', 'open'
  ) returning id into trip;
  insert into tests.ids (k, id) values ('trip', trip);

  select count(*) into n from public.carpool_trips where id = trip;
  if n <> 1 then
    raise exception 'owner SELECT trip after INSERT RETURNING: %', n;
  end if;

  select count(*) into n from public.carpool_seats where trip_id = trip;
  if n <> 4 then
    raise exception 'owner SELECT seats: expected 4 sedan seats, got %', n;
  end if;

  select count(*) into n from public.carpool_bookings where trip_id = trip;
  if n <> 0 then
    raise exception 'owner SELECT bookings on empty trip: %', n;
  end if;

  update public.carpool_seats
     set is_open = false
   where trip_id = trip and position = 'rear_right';
  if not found then
    raise exception 'owner UPDATE seat is_open failed';
  end if;

  insert into public.carpool_messages (trip_id, sender_id, body)
  values (trip, uid, 'hello from owner')
  returning id into msg;
  if msg is null then
    raise exception 'owner INSERT RETURNING message failed';
  end if;
  select count(*) into n from public.carpool_messages where trip_id = trip;
  if n <> 1 then
    raise exception 'owner SELECT messages: %', n;
  end if;

  perform tests.ok('owner insert returning + select + seat update + message');
end $$;
commit;

-- Owner can insert/update/delete own stops.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  n int;
  denied boolean := false;
begin
  select id into trip from tests.ids where k = 'trip';
  insert into public.carpool_trip_stops (trip_id, seq, lat, lng, address)
  values (trip, 1, 18.7004, 98.9916, 'แวะตลาด');
  update public.carpool_trip_stops
     set address = 'แวะตลาดใหม่'
   where trip_id = trip and seq = 1;
  if not found then
    raise exception 'owner UPDATE stop failed';
  end if;
  insert into public.carpool_trip_stops (trip_id, seq, lat, lng, address)
  values (trip, 2, 18.71, 98.99, 'แวะสอง');
  delete from public.carpool_trip_stops where trip_id = trip and seq = 2;
  select count(*) into n from public.carpool_trip_stops where trip_id = trip;
  if n <> 1 then
    raise exception 'owner should have 1 stop after delete, got %', n;
  end if;
  begin
    insert into public.carpool_trip_stops (trip_id, seq, lat, lng, address)
    values (trip, 1, 18.70, 98.99, 'dup seq');
  exception
    when unique_violation then
      denied := true;
  end;
  if not denied then
    raise exception 'duplicate (trip_id, seq) should fail';
  end if;
  perform tests.ok('owner insert/update/delete own stops');
end $$;
commit;

-- Stranger: no trip row; can still see anonymized open seats; no bookings/messages; no message insert.
begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
do $$
declare
  trip uuid;
  n int;
  denied boolean := false;
begin
  select id into trip from tests.ids where k = 'trip';
  select count(*) into n from public.carpool_trips where id = trip;
  if n <> 0 then
    raise exception 'stranger SELECT trip should be 0, got %', n;
  end if;
  select count(*) into n from public.carpool_seats where trip_id = trip;
  if n <> 4 then
    raise exception 'stranger should see anonymized open-trip seats, got %', n;
  end if;
  select count(*) into n from public.carpool_bookings where trip_id = trip;
  if n <> 0 then
    raise exception 'stranger SELECT bookings should be 0, got %', n;
  end if;
  select count(*) into n from public.carpool_messages where trip_id = trip;
  if n <> 0 then
    raise exception 'stranger SELECT messages should be 0, got %', n;
  end if;
  begin
    insert into public.carpool_messages (trip_id, sender_id, body)
    values (trip, (select id from tests.ids where k = 'stranger'), 'nope');
  exception
    when others then
      denied := true;
  end;
  if not denied then
    raise exception 'stranger INSERT message should fail';
  end if;
  select count(*) into n from public.carpool_trip_stops where trip_id = trip;
  if n <> 0 then
    raise exception 'stranger SELECT stops should be 0, got %', n;
  end if;
  denied := false;
  begin
    insert into public.carpool_trip_stops (trip_id, seq, lat, lng, address)
    values (trip, 3, 18.70, 98.99, 'nope');
  exception
    when others then
      denied := true;
  end;
  if not denied then
    raise exception 'stranger INSERT stop should fail';
  end if;
  denied := false;
  begin
    update public.carpool_trip_stops set address = 'hack' where trip_id = trip;
  exception
    when others then
      denied := true;
  end;
  if not denied then
    -- RLS may yield 0 rows rather than an error
    denied := true;
  end if;
  denied := false;
  begin
    delete from public.carpool_trip_stops where trip_id = trip;
  exception
    when others then
      denied := true;
  end;
  perform tests.ok('stranger cannot read trip/bookings/messages or insert chat');
  perform tests.ok('stranger cannot write stops; read follows trip visibility');
end $$;
commit;

-- Rider books front_passenger; SELECT trip/bookings/messages; INSERT message.
begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  trip uuid;
  uid uuid;
  rec public.carpool_bookings;
  n int;
  denied boolean := false;
begin
  select id into trip from tests.ids where k = 'trip';
  select id into uid from tests.ids where k = 'rider';
  rec := public.carpool_book_seat(
    trip, 'front_passenger', 'ลำพูน', 18.574, 99.009, 0, null, null, null
  );
  if rec.rider_id is distinct from uid then
    raise exception 'book_seat rider_id mismatch';
  end if;
  if rec.detour_km is distinct from 0 then
    raise exception 'no-detour rider should store 0, got %', rec.detour_km;
  end if;
  insert into tests.ids (k, id) values ('booking', rec.id);

  select count(*) into n from public.carpool_trips where id = trip;
  if n <> 1 then
    raise exception 'rider SELECT trip after booking: %', n;
  end if;
  select count(*) into n from public.carpool_bookings where trip_id = trip;
  if n <> 1 then
    raise exception 'rider SELECT bookings: %', n;
  end if;
  insert into public.carpool_messages (trip_id, sender_id, body)
  values (trip, uid, 'hello from rider');
  select count(*) into n from public.carpool_messages where trip_id = trip;
  if n <> 2 then
    raise exception 'rider SELECT messages after insert: %', n;
  end if;
  select count(*) into n from public.carpool_trip_stops where trip_id = trip;
  if n <> 1 then
    raise exception 'booked rider SELECT stops: %', n;
  end if;
  denied := false;
  begin
    insert into public.carpool_trip_stops (trip_id, seq, lat, lng, address)
    values (trip, 9, 18.70, 98.99, 'rider write');
  exception
    when others then
      denied := true;
  end;
  if not denied then
    raise exception 'rider INSERT stop should fail';
  end if;
  perform tests.ok('rider book_seat + select + message insert');
  perform tests.ok('rider reads stops; owner-only writes');
  perform tests.ok('no-detour rider gets 0');
end $$;
commit;

-- Second booker, same seat.
begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
select tests.expect_raise(
  format(
    'select public.carpool_book_seat(%L::uuid, %L::public.carpool_seat_position, %L, 18.57, 99.01, 0, null, null, null)',
    (select id from tests.ids where k = 'trip'),
    'front_passenger',
    'x'
  ),
  'ที่นั่งนี้เพิ่งถูกจอง'
);
select tests.ok('second booker ที่นั่งนี้เพิ่งถูกจอง');
commit;

-- Closed seat (owner closed rear_right).
begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
select tests.expect_raise(
  format(
    'select public.carpool_book_seat(%L::uuid, %L::public.carpool_seat_position, %L, 18.57, 99.01, 0, null, null, null)',
    (select id from tests.ids where k = 'trip'),
    'rear_right',
    'x'
  ),
  'ที่นั่งนี้ปิดอยู่'
);
select tests.ok('closed seat ที่นั่งนี้ปิดอยู่');
commit;

-- Own trip.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
select tests.expect_raise(
  format(
    'select public.carpool_book_seat(%L::uuid, %L::public.carpool_seat_position, %L, 18.57, 99.01, 0, null, null, null)',
    (select id from tests.ids where k = 'trip'),
    'rear_left',
    'x'
  ),
  'ไม่สามารถจองทริปของตนเองได้'
);
select tests.ok('own trip ไม่สามารถจองทริปของตนเองได้');
commit;

-- Owner RPC carpool_set_seat_open: toggle unbooked, cannot close booked, stranger denied.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_seats;
begin
  select id into trip from tests.ids where k = 'trip';
  rec := public.carpool_set_seat_open(trip, 'rear_left', false);
  if rec.is_open then
    raise exception 'owner should close rear_left via RPC';
  end if;
  rec := public.carpool_set_seat_open(trip, 'rear_left', true);
  if not rec.is_open then
    raise exception 'owner should reopen rear_left via RPC';
  end if;
  perform tests.ok('owner carpool_set_seat_open toggle');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
select tests.expect_raise(
  format(
    'select public.carpool_set_seat_open(%L::uuid, %L::public.carpool_seat_position, false)',
    (select id from tests.ids where k = 'trip'),
    'front_passenger'
  ),
  'cannot open/close a booked seat'
);
select tests.ok('cannot close booked seat via carpool_set_seat_open');
commit;

begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
select tests.expect_raise(
  format(
    'select public.carpool_set_seat_open(%L::uuid, %L::public.carpool_seat_position, false)',
    (select id from tests.ids where k = 'trip'),
    'rear_left'
  ),
  'only the trip owner'
);
select tests.ok('stranger carpool_set_seat_open denied');
commit;

-- Detour floor: underreport is raised; honest larger value is kept; only that rider.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  uid uuid;
  trip uuid;
begin
  select id into uid from tests.ids where k = 'owner';
  insert into public.carpool_trips (
    owner_id, kind, vehicle_type, car_icon,
    trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
    pickup_label, pickup_lat, pickup_lng,
    dest_label, dest_lat, dest_lng, depart_at, status
  ) values (
    uid, 'private', 'sedan', 'sedan',
    100, 50, 50, 40,
    'เชียงใหม่', 18.800, 99.000,
    'ลำพูน', 18.500, 99.000, now() + interval '2 days', 'open'
  ) returning id into trip;
  insert into tests.ids (k, id) values ('trip2', trip);
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
begin
  select id into trip from tests.ids where k = 'trip2';
  rec := public.carpool_book_seat(
    trip, 'front_passenger', 'อ้อม', 18.650, 99.400, 0, null, null, null
  );
  if rec.detour_km <= 0 then
    raise exception 'underreported detour should be raised above 0, got %', rec.detour_km;
  end if;
  insert into tests.ids (k, id) values ('booking2', rec.id);
end $$;
commit;

do $$
declare
  trip uuid;
  rec_km numeric;
  floor_km numeric;
begin
  select id into trip from tests.ids where k = 'trip2';
  select b.detour_km into rec_km
    from public.carpool_bookings b
   where b.id = (select id from tests.ids where k = 'booking2');
  floor_km := private.carpool_detour_floor_km(trip, 18.650, 99.400);
  if rec_km is distinct from floor_km then
    raise exception 'underreported detour %, expected floor %', rec_km, floor_km;
  end if;
  if floor_km <= 0 then
    raise exception 'expected a positive detour floor, got %', floor_km;
  end if;
  perform tests.ok('underreported p_detour_km raised to floor');
end $$;

begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
begin
  select id into trip from tests.ids where k = 'trip2';
  rec := public.carpool_book_seat(
    trip, 'rear_left', 'อ้อม', 18.650, 99.400, 999, null, null, null
  );
  if rec.detour_km is distinct from 999 then
    raise exception 'honest detour 999 should be kept, got %', rec.detour_km;
  end if;
  insert into tests.ids (k, id) values ('booking3', rec.id);
end $$;
commit;

do $$
declare
  under numeric;
  honest numeric;
begin
  select b.detour_km into under
    from public.carpool_bookings b
   where b.id = (select id from tests.ids where k = 'booking2');
  select b.detour_km into honest
    from public.carpool_bookings b
   where b.id = (select id from tests.ids where k = 'booking3');
  if honest is distinct from 999 then
    raise exception 'honest rider detour should stay 999, got %', honest;
  end if;
  if under >= 999 then
    raise exception 'underreported rider should not receive the honest surcharge';
  end if;
  perform tests.ok('honest detour kept; charge only the requester');
end $$;

-- Direct UPDATE detour_km is permission denied (column grant revoked).
begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
  before_km numeric;
  after_km numeric;
begin
  select id into bid from tests.ids where k = 'booking2';
  select b.detour_km into before_km from public.carpool_bookings b where b.id = bid;
  begin
    update public.carpool_bookings b set detour_km = 0 where b.id = bid;
  exception
    when insufficient_privilege then
      denied := true;
  end;
  if not denied then
    raise exception 'direct UPDATE detour_km should be permission denied';
  end if;
  select b.detour_km into after_km from public.carpool_bookings b where b.id = bid;
  if after_km is distinct from before_km then
    raise exception 'detour_km changed after denied UPDATE: % -> %', before_km, after_km;
  end if;
  perform tests.ok('direct UPDATE detour_km is permission denied');
end $$;
commit;

-- dest_* change recomputes floor (NEW.detour_km frozen by column grant, so
-- coalesce is the previous stored value; a farther dest raises it).
begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
do $$
declare
  bid uuid;
begin
  select id into bid from tests.ids where k = 'booking2';
  update public.carpool_bookings b
     set dest_label = 'ไกลกว่า', dest_lat = 18.650, dest_lng = 99.800
   where b.id = bid;
end $$;
commit;

do $$
declare
  trip uuid;
  stored numeric;
  floor_km numeric;
  honest numeric;
begin
  select id into trip from tests.ids where k = 'trip2';
  select b.detour_km into stored
    from public.carpool_bookings b
   where b.id = (select id from tests.ids where k = 'booking2');
  floor_km := private.carpool_detour_floor_km(trip, 18.650, 99.800);
  if stored is distinct from floor_km then
    raise exception 'dest change should store floor %, got %', floor_km, stored;
  end if;
  if floor_km <= 0 then
    raise exception 'farther dest should raise a positive floor, got %', floor_km;
  end if;
  select b.detour_km into honest
    from public.carpool_bookings b
   where b.id = (select id from tests.ids where k = 'booking3');
  if honest is distinct from 999 then
    raise exception 'requester-only: stranger detour should stay 999, got %', honest;
  end if;
  perform tests.ok('dest change recomputes floor; charge only the requester');
end $$;

-- Discover/preview: rounded coords, no owner_id (stops follow origin/dest).
begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
do $$
declare
  trip uuid;
  rec jsonb;
  disc jsonb;
begin
  select id into trip from tests.ids where k = 'trip';
  rec := public.carpool_trip_preview(trip);
  if rec ? 'owner_id' then
    raise exception 'preview must not leak owner_id';
  end if;
  if (rec->>'pickup_lat')::numeric <> 18.789 then
    raise exception 'preview pickup_lat should be rounded to 18.789, got %', rec->>'pickup_lat';
  end if;
  if rec->>'pickup_lat' like '%18.7888%' then
    raise exception 'preview leaked unrounded pickup_lat';
  end if;
  if rec->'stops'->0->>'lat' like '%18.7004%' then
    raise exception 'preview leaked unrounded stop lat';
  end if;
  if round((rec->'stops'->0->>'lat')::numeric, 3) <> 18.700 then
    raise exception 'preview stop lat should round to 18.700, got %', rec->'stops'->0->>'lat';
  end if;
  if round((rec->'stops'->0->>'lng')::numeric, 3) <> 98.992 then
    raise exception 'preview stop lng should round to 98.992, got %', rec->'stops'->0->>'lng';
  end if;

  select to_jsonb(d) into disc
    from public.carpool_discover_trips() d
   where d.id = trip;
  if disc is null then
    raise exception 'discover should return the open trip';
  end if;
  if disc ? 'owner_id' then
    raise exception 'discover must not leak owner_id';
  end if;
  if (disc->>'pickup_lat')::numeric <> 18.789 then
    raise exception 'discover pickup_lat should be rounded to 18.789, got %', disc->>'pickup_lat';
  end if;
  if disc ? 'stops' then
    raise exception 'discover list must not expose stops';
  end if;
  if rec ? 'owner_id' or disc ? 'owner_id' then
    raise exception 'preview/discover must not leak owner_id';
  end if;
  if coalesce((rec->>'is_mine')::boolean, true) then
    raise exception 'stranger preview is_mine should be false';
  end if;
  if coalesce((disc->>'is_mine')::boolean, true) then
    raise exception 'stranger discover is_mine should be false';
  end if;
  perform tests.ok('discover/preview stay rounded with no owner id');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  rec jsonb;
  disc jsonb;
begin
  select id into trip from tests.ids where k = 'trip';
  rec := public.carpool_trip_preview(trip);
  if rec ? 'owner_id' then
    raise exception 'owner preview must not include owner_id';
  end if;
  if not coalesce((rec->>'is_mine')::boolean, false) then
    raise exception 'owner preview is_mine should be true';
  end if;
  select to_jsonb(d) into disc
    from public.carpool_discover_trips() d
   where d.id = trip;
  if not coalesce((disc->>'is_mine')::boolean, false) then
    raise exception 'owner discover is_mine should be true';
  end if;
  perform tests.ok('is_mine true only for the owner');
end $$;
commit;

-- Taxi trunk: trigger forces the preset; private dims stay; preview luggage
-- is anonymized and ordered by volume (not owner-first).
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  uid uuid;
  trip uuid;
  w numeric;
  h numeric;
  l numeric;
begin
  select id into uid from tests.ids where k = 'owner';
  insert into public.carpool_trips (
    owner_id, kind, vehicle_type, car_icon,
    trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
    pickup_label, pickup_lat, pickup_lng,
    dest_label, dest_lat, dest_lng, depart_at, status
  ) values (
    uid, 'taxi', 'sedan', 'taxi',
    80, 99, 12, 12,
    'กรุงเทพฯ', 13.75, 100.5,
    'อยุธยา', 14.35, 100.57, now() + interval '2 day', 'open'
  ) returning id, trunk_w_cm, trunk_h_cm, trunk_l_cm into trip, w, h, l;
  if w <> 100 or h <> 40 or l <> 50 then
    raise exception 'taxi insert must force 100×40×50, got %×%×%', w, h, l;
  end if;
  insert into tests.ids (k, id) values ('taxi_trip', trip);

  update public.carpool_trips
     set trunk_w_cm = 140, trunk_h_cm = 70, trunk_l_cm = 90
   where id = trip
  returning trunk_w_cm, trunk_h_cm, trunk_l_cm into w, h, l;
  if w <> 100 or h <> 40 or l <> 50 then
    raise exception 'taxi update must keep 100×40×50, got %×%×%', w, h, l;
  end if;

  perform tests.ok('taxi trunk insert/update forced to preset');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
begin
  select id into trip from tests.ids where k = 'taxi_trip';
  rec := public.carpool_claim_owner_seat(trip, 'front_passenger', 40, 30, 20);
  if rec.luggage_h_cm <> 40 or rec.luggage_w_cm <> 30 or rec.luggage_d_cm <> 20 then
    raise exception 'owner claim luggage mismatch';
  end if;
  perform tests.ok('taxi owner claim stores creator luggage');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
begin
  select id into trip from tests.ids where k = 'taxi_trip';
  rec := public.carpool_book_seat(
    trip, 'rear_left', 'อยุธยา', 14.35, 100.57, 0, 50, 40, 25
  );
  if rec.luggage_w_cm <> 40 then
    raise exception 'rider luggage mismatch';
  end if;
  perform tests.ok('taxi rider books with luggage');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
do $$
declare
  trip uuid;
  rec jsonb;
  bags jsonb;
begin
  select id into trip from tests.ids where k = 'taxi_trip';
  rec := public.carpool_trip_preview(trip);
  if (rec->>'trunk_w_cm')::numeric <> 100
     or (rec->>'trunk_h_cm')::numeric <> 40
     or (rec->>'trunk_l_cm')::numeric <> 50 then
    raise exception 'preview taxi trunk should be preset, got % % %',
      rec->>'trunk_w_cm', rec->>'trunk_h_cm', rec->>'trunk_l_cm';
  end if;
  bags := rec->'luggage';
  if jsonb_array_length(bags) <> 2 then
    raise exception 'preview luggage count: %', bags;
  end if;
  -- Rider bag 50×40×25 (50 L) is larger than owner 40×30×20 (24 L). Volume-desc
  -- must put the rider first; owner-first ordering would reverse this.
  if (bags->0->>'height_cm')::numeric <> 50
     or (bags->0->>'width_cm')::numeric <> 40
     or (bags->0->>'depth_cm')::numeric <> 25 then
    raise exception 'preview luggage must be volume-desc (larger bag first): %', bags->0;
  end if;
  if (bags->1->>'height_cm')::numeric <> 40
     or (bags->1->>'width_cm')::numeric <> 30
     or (bags->1->>'depth_cm')::numeric <> 20 then
    raise exception 'preview luggage smaller bag second: %', bags->1;
  end if;
  if bags->0 ? 'rider_id' or bags->1 ? 'rider_id' then
    raise exception 'preview luggage must not leak rider_id';
  end if;
  if rec ? 'owner_id' then
    raise exception 'preview must not leak owner_id';
  end if;
  perform tests.ok('preview taxi luggage volume-desc no rider ids');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  w numeric;
  h numeric;
  l numeric;
begin
  select id into trip from tests.ids where k = 'trip';
  select trunk_w_cm, trunk_h_cm, trunk_l_cm into w, h, l
    from public.carpool_trips where id = trip;
  if w <> 100 or h <> 50 or l <> 50 then
    raise exception 'private trunk should stay 100×50×50, got %×%×%', w, h, l;
  end if;
  update public.carpool_trips
     set trunk_w_cm = 140, trunk_h_cm = 40, trunk_l_cm = 150
   where id = trip
  returning trunk_w_cm, trunk_h_cm, trunk_l_cm into w, h, l;
  if w <> 140 or h <> 40 or l <> 150 then
    raise exception 'private trunk update should keep driver values, got %×%×%', w, h, l;
  end if;
  -- restore original so later tests still see 100×50×50
  update public.carpool_trips
     set trunk_w_cm = 100, trunk_h_cm = 50, trunk_l_cm = 50
   where id = trip;
  perform tests.ok('private trunk insert/update unchanged');
end $$;
commit;

-- L2: numeric NaN detour insert/update is rejected by CHECK.
-- Authenticated has no INSERT grant and cannot UPDATE detour_km, so this
-- uses replica (skip trigger) as the table owner to hit the CHECK itself.
do $$
declare
  trip uuid;
  seat uuid;
  rider uuid;
  bid uuid;
  denied_ins boolean := false;
  denied_upd boolean := false;
begin
  select id into trip from tests.ids where k = 'taxi_trip';
  select id into rider from tests.ids where k = 'stranger';
  select s.id into seat
    from public.carpool_seats s
   where s.trip_id = trip and s.position = 'rear_right';
  select b.id into bid
    from public.carpool_bookings b
   where b.trip_id = trip
   limit 1;

  perform set_config('session_replication_role', 'replica', true);
  begin
    insert into public.carpool_bookings (
      trip_id, rider_id, seat_id, dest_label, dest_lat, dest_lng, detour_km
    ) values (
      trip, rider, seat, 'x', 14.35, 100.57, 'NaN'::numeric
    );
  exception
    when check_violation then
      denied_ins := true;
  end;
  begin
    update public.carpool_bookings
       set detour_km = 'NaN'::numeric
     where id = bid;
  exception
    when check_violation then
      denied_upd := true;
  end;
  perform set_config('session_replication_role', 'origin', true);

  if not denied_ins then
    raise exception 'NaN detour INSERT should fail CHECK';
  end if;
  if not denied_upd then
    raise exception 'NaN detour UPDATE should fail CHECK';
  end if;
  perform tests.ok('NaN detour insert/update rejected by CHECK');
end $$;

-- L1: dest_* and luggage stay editable while open (schema has no scheduled
-- status). Both are rejected once the trip is in_progress, and again when
-- completed. #10 dest-recompute still runs on open dest_* edits.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  uid uuid;
  trip uuid;
begin
  select id into uid from tests.ids where k = 'owner';
  insert into public.carpool_trips (
    owner_id, kind, vehicle_type, car_icon,
    trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
    pickup_label, pickup_lat, pickup_lng,
    dest_label, dest_lat, dest_lng, depart_at, status
  ) values (
    uid, 'private', 'sedan', 'sedan',
    100, 50, 50, 12,
    'เชียงใหม่', 18.7888, 98.9861,
    'ลำพูน', 18.574, 99.008, now() + interval '5 day', 'open'
  ) returning id into trip;
  insert into tests.ids (k, id) values ('freeze_trip', trip);
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
begin
  select id into trip from tests.ids where k = 'freeze_trip';
  rec := public.carpool_book_seat(
    trip, 'rear_middle', 'ลำพูน', 18.574, 99.008, 0, 40, 30, 20
  );
  insert into tests.ids (k, id) values ('freeze_booking', rec.id);
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  bid uuid;
  rec public.carpool_bookings;
begin
  select id into bid from tests.ids where k = 'freeze_booking';
  update public.carpool_bookings
     set dest_label = 'จุดใหม่', dest_lat = 18.600, dest_lng = 99.050
   where id = bid
  returning * into rec;
  if rec.dest_label is distinct from 'จุดใหม่' then
    raise exception 'open trip should allow dest_* edits, got %', rec.dest_label;
  end if;
  update public.carpool_bookings
     set luggage_h_cm = 45, luggage_w_cm = 35, luggage_d_cm = 25
   where id = bid
  returning * into rec;
  if rec.luggage_h_cm is distinct from 45
     or rec.luggage_w_cm is distinct from 35
     or rec.luggage_d_cm is distinct from 25 then
    raise exception 'open trip should allow luggage edits, got %×%×%',
      rec.luggage_h_cm, rec.luggage_w_cm, rec.luggage_d_cm;
  end if;
  perform tests.ok('dest/luggage edits allowed while trip is open');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
update public.carpool_trips
   set status = 'in_progress'
 where id = (select id from tests.ids where k = 'freeze_trip');
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
begin
  select id into bid from tests.ids where k = 'freeze_booking';
  begin
    update public.carpool_bookings
       set dest_label = 'ห้าม', dest_lat = 18.1, dest_lng = 99.1
     where id = bid;
  exception
    when raise_exception then
      if sqlerrm is distinct from 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว' then
        raise;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'dest_* update should be rejected when in_progress';
  end if;
  perform tests.ok('dest_* change rejected when in_progress');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
begin
  select id into bid from tests.ids where k = 'freeze_booking';
  begin
    update public.carpool_bookings
       set luggage_h_cm = 99, luggage_w_cm = 99, luggage_d_cm = 99
     where id = bid;
  exception
    when raise_exception then
      if sqlerrm is distinct from 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว' then
        raise;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'luggage update should be rejected when in_progress';
  end if;
  perform tests.ok('luggage change rejected when in_progress');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
update public.carpool_trips
   set status = 'completed'
 where id = (select id from tests.ids where k = 'freeze_trip');
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
begin
  select id into bid from tests.ids where k = 'freeze_booking';
  begin
    update public.carpool_bookings
       set dest_label = 'ห้ามหลังจบ', dest_lat = 18.2, dest_lng = 99.2
     where id = bid;
  exception
    when raise_exception then
      if sqlerrm is distinct from 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว' then
        raise;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'dest_* update should be rejected when completed';
  end if;
  perform tests.ok('dest_* change rejected when completed');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
begin
  select id into bid from tests.ids where k = 'freeze_booking';
  begin
    update public.carpool_bookings
       set luggage_h_cm = 11, luggage_w_cm = 11, luggage_d_cm = 11
     where id = bid;
  exception
    when raise_exception then
      if sqlerrm is distinct from 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว' then
        raise;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'luggage update should be rejected when completed';
  end if;
  perform tests.ok('luggage change rejected when completed');
end $$;
commit;

-- L1 cancelled: dest_* / luggage frozen the same way.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  uid uuid;
  trip uuid;
begin
  select id into uid from tests.ids where k = 'owner';
  insert into public.carpool_trips (
    owner_id, kind, vehicle_type, car_icon,
    trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
    pickup_label, pickup_lat, pickup_lng,
    dest_label, dest_lat, dest_lng, depart_at, status
  ) values (
    uid, 'private', 'sedan', 'sedan',
    100, 50, 50, 12,
    'เชียงใหม่', 18.7888, 98.9861,
    'ลำพูน', 18.574, 99.008, now() + interval '6 day', 'open'
  ) returning id into trip;
  insert into tests.ids (k, id) values ('freeze_cancel_trip', trip);
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
begin
  select id into trip from tests.ids where k = 'freeze_cancel_trip';
  rec := public.carpool_book_seat(
    trip, 'rear_middle', 'ลำพูน', 18.574, 99.008, 0, 40, 30, 20
  );
  insert into tests.ids (k, id) values ('freeze_cancel_booking', rec.id);
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
update public.carpool_trips
   set status = 'cancelled'
 where id = (select id from tests.ids where k = 'freeze_cancel_trip');
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
begin
  select id into bid from tests.ids where k = 'freeze_cancel_booking';
  begin
    update public.carpool_bookings
       set dest_label = 'ห้ามยกเลิก', dest_lat = 18.3, dest_lng = 99.3
     where id = bid;
  exception
    when raise_exception then
      if sqlerrm is distinct from 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว' then
        raise;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'dest_* update should be rejected when cancelled';
  end if;
  perform tests.ok('dest_* change rejected when cancelled');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
begin
  select id into bid from tests.ids where k = 'freeze_cancel_booking';
  begin
    update public.carpool_bookings
       set luggage_h_cm = 12, luggage_w_cm = 12, luggage_d_cm = 12
     where id = bid;
  exception
    when raise_exception then
      if sqlerrm is distinct from 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว' then
        raise;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'luggage update should be rejected when cancelled';
  end if;
  perform tests.ok('luggage change rejected when cancelled');
end $$;
commit;

-- Province/district pairing: matching TIS 1099 accepted; mismatch and
-- district-without-province rejected.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  uid uuid;
  trip uuid;
  denied boolean := false;
begin
  select id into uid from tests.ids where k = 'owner';
  insert into public.carpool_trips (
    owner_id, kind, vehicle_type, car_icon,
    trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
    pickup_label, pickup_lat, pickup_lng,
    dest_label, dest_lat, dest_lng, depart_at, status,
    origin_province_code, origin_district_code,
    dest_province_code, dest_district_code
  ) values (
    uid, 'private', 'sedan', 'sedan',
    100, 50, 50, 12,
    'กรุงเทพฯ', 13.7563, 100.5018,
    'อยุธยา', 14.35, 100.57, now() + interval '7 day', 'open',
    '10', '1001', '14', '1401'
  ) returning id into trip;
  perform tests.ok('matching province/district pair accepted');

  begin
    update public.carpool_trips
       set origin_district_code = '5001'
     where id = trip;
  exception
    when check_violation then
      denied := true;
  end;
  if not denied then
    raise exception 'mismatched origin district/province should fail CHECK';
  end if;
  perform tests.ok('mismatched district/province pair rejected');

  denied := false;
  begin
    update public.carpool_trips
       set dest_province_code = null, dest_district_code = '1401'
     where id = trip;
  exception
    when check_violation then
      denied := true;
  end;
  if not denied then
    raise exception 'district without province should fail CHECK';
  end if;
  perform tests.ok('district without province rejected');
end $$;
commit;

-- My Trips: RLS lets a user see owned + booked rows only.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.carpool_trips;
  if n < 1 then
    raise exception 'owner should see at least their own trips, got %', n;
  end if;
  perform tests.ok('owner My Trips sees owned trips');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  n int;
  trip uuid;
begin
  select id into trip from tests.ids where k = 'trip';
  select count(*) into n from public.carpool_trips t where t.id = trip;
  if n <> 1 then
    raise exception 'booked rider should see the booked trip';
  end if;
  perform tests.ok('rider My Trips sees booked trips');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
do $$
declare
  n int;
  trip uuid;
begin
  select id into trip from tests.ids where k = 'trip';
  select count(*) into n from public.carpool_trips t where t.id = trip;
  if n <> 0 then
    raise exception 'stranger should not see another user trip row, got %', n;
  end if;
  perform tests.ok('stranger My Trips does not see others');
end $$;
commit;

-- Non-open trip.
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
update public.carpool_trips set status = 'cancelled' where id = (select id from tests.ids where k = 'trip');
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
select tests.expect_raise(
  format(
    'select public.carpool_book_seat(%L::uuid, %L::public.carpool_seat_position, %L, 18.57, 99.01, 0, null, null, null)',
    (select id from tests.ids where k = 'trip'),
    'rear_left',
    'x'
  ),
  'ทริปนี้ไม่ได้เปิดรับจอง'
);
select tests.ok('non-open ทริปนี้ไม่ได้เปิดรับจอง');
commit;

-- Admin can SELECT the trip (and bookings) despite not participating.
begin;
select tests.login(id) from tests.ids where k = 'admin';
set local role authenticated;
do $$
declare
  trip uuid;
  n int;
begin
  select id into trip from tests.ids where k = 'trip';
  select count(*) into n from public.carpool_trips where id = trip;
  if n <> 1 then
    raise exception 'admin SELECT trip: %', n;
  end if;
  select count(*) into n from public.carpool_bookings where trip_id = trip;
  if n <> 1 then
    raise exception 'admin SELECT bookings: %', n;
  end if;
  select count(*) into n from public.carpool_messages where trip_id = trip;
  if n <> 2 then
    raise exception 'admin SELECT messages: %', n;
  end if;
  select count(*) into n from public.carpool_trip_stops where trip_id = trip;
  if n <> 1 then
    raise exception 'admin SELECT stops: %', n;
  end if;
  perform tests.ok('admin select trips/bookings/messages');
end $$;
commit;

-- Anon: no table privilege (sees nothing).
do $$
declare
  denied boolean := false;
  stops_denied boolean := false;
begin
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.carpool_trips';
  exception
    when insufficient_privilege then
      denied := true;
    when others then
      denied := true;
  end;
  execute 'reset role';
  if not denied then
    raise exception 'anon SELECT carpool_trips should be denied';
  end if;
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.carpool_trip_stops';
  exception
    when insufficient_privilege then
      stops_denied := true;
    when others then
      stops_denied := true;
  end;
  execute 'reset role';
  if not stops_denied then
    raise exception 'anon SELECT carpool_trip_stops should be denied';
  end if;
  perform tests.ok('anon sees nothing');
  perform tests.ok('anon is denied stops');
end $$;

-- Max detour: taxi floor > cap rejected; on-route dest accepted; dest change
-- past the cap rejected by the bookings guard. Preview exposes the cap, never owner_id.
begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
  preview jsonb;
begin
  select id into trip from tests.ids where k = 'taxi_trip';
  preview := public.carpool_trip_preview(trip);
  if preview ? 'owner_id' then
    raise exception 'taxi preview must not leak owner_id';
  end if;
  if (preview->>'max_detour_km')::numeric is distinct from 5 then
    raise exception 'taxi preview max_detour_km should be 5, got %', preview->>'max_detour_km';
  end if;
  rec := public.carpool_book_seat(
    trip, 'rear_middle', 'อยุธยา', 14.35, 100.57, 0, null, null, null
  );
  if rec.detour_km < 0 then
    raise exception 'on-route taxi dest should store a non-negative detour, got %', rec.detour_km;
  end if;
  perform tests.ok('taxi book accepted when floor <= max_detour_km');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
do $$
declare
  trip uuid;
  denied boolean := false;
begin
  select id into trip from tests.ids where k = 'taxi_trip';
  begin
    perform public.carpool_book_seat(
      trip, 'rear_right', 'เชียงใหม่', 18.788, 98.985, 0, null, null, null
    );
  exception
    when raise_exception then
      if sqlerrm not like 'จุดลงนี้ออกนอกเส้นทาง%' then
        raise exception 'expected max-detour Thai raise, got %', sqlerrm;
      end if;
      if sqlerrm not like '%สูงสุด 5 กม.%' then
        raise exception 'expected cap in message, got %', sqlerrm;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'taxi book with floor > max_detour_km should be rejected';
  end if;
  perform tests.ok('taxi book rejected when floor > max_detour_km');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider2';
set local role authenticated;
do $$
declare
  bid uuid;
  denied boolean := false;
begin
  select b.id into bid
    from public.carpool_bookings b
   where b.trip_id = (select id from tests.ids where k = 'taxi_trip')
     and b.rider_id = (select id from tests.ids where k = 'rider2');
  begin
    update public.carpool_bookings
       set dest_label = 'เชียงใหม่', dest_lat = 18.788, dest_lng = 98.985
     where id = bid;
  exception
    when raise_exception then
      if sqlerrm not like 'จุดลงนี้ออกนอกเส้นทาง%' then
        raise exception 'expected max-detour Thai raise on dest change, got %', sqlerrm;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'dest change with floor > max_detour_km should be rejected';
  end if;
  perform tests.ok('dest change exceeding max_detour_km rejected by guard');
end $$;
commit;

-- L1: discover returns max_detour_km, still no owner_id, geo filters kept.
begin;
select tests.login(id) from tests.ids where k = 'stranger';
set local role authenticated;
do $$
declare
  trip uuid;
  disc jsonb;
  filtered int;
begin
  select id into trip from tests.ids where k = 'taxi_trip';
  select to_jsonb(d) into disc
    from public.carpool_discover_trips() d
   where d.id = trip;
  if disc is null then
    raise exception 'discover should return the open taxi trip';
  end if;
  if disc ? 'owner_id' then
    raise exception 'discover must not leak owner_id';
  end if;
  if not disc ? 'max_detour_km' then
    raise exception 'discover must return max_detour_km';
  end if;
  if (disc->>'max_detour_km')::numeric is distinct from 5 then
    raise exception 'discover taxi max_detour_km should be 5, got %', disc->>'max_detour_km';
  end if;
  if coalesce((disc->>'is_mine')::boolean, true) then
    raise exception 'stranger discover is_mine should be false';
  end if;
  select count(*) into filtered
    from public.carpool_discover_trips(
      'taxi',
      '10',
      null,
      null,
      null
    ) d
   where d.id = trip;
  if filtered <> 0 then
    raise exception 'discover geo filter should hide taxi_trip with null origin province';
  end if;
  perform tests.ok('discover returns max_detour_km and no owner_id');
end $$;
commit;

-- L3: lowering max_detour_km below an active booking's haversine floor is
-- rejected. Compare the floor (not stored detour_km) so an L2 overreport
-- cannot pin the cap. Cancel deletes the booking row (no status column).
begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  uid uuid;
  trip uuid;
begin
  select id into uid from tests.ids where k = 'owner';
  insert into public.carpool_trips (
    owner_id, kind, vehicle_type, car_icon,
    trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
    pickup_label, pickup_lat, pickup_lng,
    dest_label, dest_lat, dest_lng, depart_at, status,
    max_detour_km
  ) values (
    uid, 'taxi', 'sedan', 'taxi',
    100, 40, 50, 12,
    'กรุงเทพฯ', 13.75, 100.5,
    'อยุธยา', 14.35, 100.57, now() + interval '8 day', 'open',
    10
  ) returning id into trip;
  insert into tests.ids (k, id) values ('l3_trip', trip);
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  trip uuid;
  rec public.carpool_bookings;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  -- Off-origin dest: floor is a few km; client overreports (L2 intended).
  rec := public.carpool_book_seat(
    trip, 'rear_middle', 'จุดอ้อม', 13.75, 100.54, 9, null, null, null
  );
  if rec.detour_km is distinct from 9 then
    raise exception 'L2 overreport should keep client 9, got %', rec.detour_km;
  end if;
  insert into tests.ids (k, id) values ('l3_booking', rec.id);
end $$;
commit;

do $$
declare
  trip uuid;
  floor_km numeric;
  stored numeric;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  floor_km := private.carpool_detour_floor_km(trip, 13.75, 100.54);
  select b.detour_km into stored
    from public.carpool_bookings b
   where b.id = (select id from tests.ids where k = 'l3_booking');
  if floor_km <= 1 or floor_km >= 5 then
    raise exception 'L3 fixture floor should be in (1, 5), got %', floor_km;
  end if;
  if stored is distinct from 9 then
    raise exception 'L3 stored detour should be 9, got %', stored;
  end if;
end $$;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  cap numeric;
  denied boolean := false;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  begin
    update public.carpool_trips
       set max_detour_km = 1
     where id = trip;
  exception
    when raise_exception then
      if sqlerrm not like 'ลดระยะออกนอกเส้นทางสูงสุดไม่ได้ มีผู้โดยสารที่จองไว้ออกนอกเส้นทาง%' then
        raise exception 'expected L3 Thai raise, got %', sqlerrm;
      end if;
      denied := true;
  end;
  if not denied then
    raise exception 'lowering max_detour_km below active floor should be rejected';
  end if;
  select t.max_detour_km into cap from public.carpool_trips t where t.id = trip;
  if cap is distinct from 10 then
    raise exception 'rejected lower should leave cap at 10, got %', cap;
  end if;
  perform tests.ok('lowering cap below active booking floor rejected');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  cap numeric;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  update public.carpool_trips
     set max_detour_km = 5
   where id = trip
  returning max_detour_km into cap;
  if cap is distinct from 5 then
    raise exception 'lowering to 5 (>= floor, < stored 9) should be allowed, got %', cap;
  end if;
  perform tests.ok('lowering cap to >= max active floor allowed');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  cap numeric;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  update public.carpool_trips
     set max_detour_km = 20
   where id = trip
  returning max_detour_km into cap;
  if cap is distinct from 20 then
    raise exception 'raising max_detour_km should be allowed, got %', cap;
  end if;
  perform tests.ok('raising cap allowed');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  cap numeric;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  -- Stored detour_km is 9 (overreport). Floor is in (1, 5). Lowering to 8
  -- is below stored and still >= floor — L3 checks the floor.
  update public.carpool_trips
     set max_detour_km = 8
   where id = trip
  returning max_detour_km into cap;
  if cap is distinct from 8 then
    raise exception 'lowering below stored overreport but >= floor should be allowed, got %', cap;
  end if;
  perform tests.ok('lowering below stored overreport allowed when floor fits');
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'rider';
set local role authenticated;
do $$
declare
  trip uuid;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  perform public.carpool_cancel_booking(trip);
end $$;
commit;

begin;
select tests.login(id) from tests.ids where k = 'owner';
set local role authenticated;
do $$
declare
  trip uuid;
  cap numeric;
begin
  select id into trip from tests.ids where k = 'l3_trip';
  update public.carpool_trips
     set max_detour_km = 1
   where id = trip
  returning max_detour_km into cap;
  if cap is distinct from 1 then
    raise exception 'after cancel, lowering to 1 should be allowed, got %', cap;
  end if;
  perform tests.ok('cancelled bookings ignored when lowering cap');
end $$;
commit;

do $$
declare
  n int;
begin
  select count(*) into n from tests.passed;
  if n < 51 then
    raise exception 'too few behavioral RLS cases: %', n;
  end if;
  raise notice 'carpool behavioral RLS cases passed: %', n;
end $$;
