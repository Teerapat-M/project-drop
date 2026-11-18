-- Catalog + behavioral RLS for 20261118100000_carpool.sql.
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
end $$;

-- Intentional RPCs stay executable by authenticated; anon has none.
do $$
declare
  book_sig text := 'public.carpool_book_seat(uuid, public.carpool_seat_position, text, double precision, double precision, numeric, numeric, numeric, numeric)';
  claim_sig text := 'public.carpool_claim_owner_seat(uuid, public.carpool_seat_position, numeric, numeric, numeric)';
  set_sig text := 'public.carpool_set_seat_open(uuid, public.carpool_seat_position, boolean)';
begin
  if not has_function_privilege('authenticated', 'public.carpool_discover_trips(public.carpool_trip_kind)', 'EXECUTE') then
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
     or has_function_privilege('anon', 'public.carpool_discover_trips(public.carpool_trip_kind)', 'EXECUTE') then
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
  if has_function_privilege('anon', 'private.carpool_is_participant(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'private.carpool_is_trip_owner(uuid)', 'EXECUTE') then
    raise exception 'anon must not EXECUTE carpool policy helpers';
  end if;
end $$;

-- Booking RPC: row lock, exact Thai conflict message, own-trip / not-open / closed.
do $$
declare
  def text := pg_get_functiondef(
    'public.carpool_book_seat(uuid, public.carpool_seat_position, text, double precision, double precision, numeric, numeric, numeric, numeric)'::regprocedure
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
    'carpool_saved_addresses', 'carpool_messages'
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
    'เชียงใหม่', 18.788, 98.985,
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
  perform tests.ok('stranger cannot read trip/bookings/messages or insert chat');
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
begin
  select id into trip from tests.ids where k = 'trip';
  select id into uid from tests.ids where k = 'rider';
  rec := public.carpool_book_seat(
    trip, 'front_passenger', 'ตลาดกลาง', 18.57, 99.01, 0, null, null, null
  );
  if rec.rider_id is distinct from uid then
    raise exception 'book_seat rider_id mismatch';
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
  perform tests.ok('rider book_seat + select + message insert');
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
  perform tests.ok('admin select trips/bookings/messages');
end $$;
commit;

-- Anon: no table privilege (sees nothing).
do $$
declare
  denied boolean := false;
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
  perform tests.ok('anon sees nothing');
end $$;

do $$
declare
  n int;
begin
  select count(*) into n from tests.passed;
  if n < 12 then
    raise exception 'too few behavioral RLS cases: %', n;
  end if;
  raise notice 'carpool behavioral RLS cases passed: %', n;
end $$;
