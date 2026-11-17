-- Attack-path assertions for 20261118100000_carpool.sql.
-- Not run in CI (no live DB). Apply profiles + rides + hardening + trip_chat +
-- revoke_trigger_fn_execute + carpool on a throwaway Postgres, stub auth.uid()
-- / profiles like the PR review harness, then:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/carpool_rls.sql
-- Server Jest mirrors the migration text in apps/server/src/carpool/migration.test.ts.

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
-- Session attack paths (throwaway DB; uncomment after stubbing auth.uid()).
-- Owner vs rider vs stranger:
--   set request.jwt.claim.sub = '<owner>';  -- or your harness
--   select * from public.carpool_trips where id = :'trip';  -- owner: 1 row
--   set ... = '<rider with booking>';
--   select * from public.carpool_trips where id = :'trip';  -- rider: 1 row
--   set ... = '<stranger>';
--   select * from public.carpool_trips where id = :'trip';  -- 0 rows (use discover RPC)
--   select * from public.carpool_discover_trips();          -- rounded coords, no owner_id
--
-- Atomic booking (second confirm):
--   select public.carpool_book_seat(:'trip', 'front_passenger', 'x', 13.7, 100.5);
--   -- as another user, same seat:
--   select public.carpool_book_seat(:'trip', 'front_passenger', 'y', 13.7, 100.5);
--   expect: ERROR: ที่นั่งนี้เพิ่งถูกจอง
--
-- Closed seat:
--   select public.carpool_set_seat_open(:'trip', 'rear_right', false); -- as owner
--   select public.carpool_book_seat(:'trip', 'rear_right', 'x', 13.7, 100.5);
--   expect: ที่นั่งนี้ปิดอยู่
--
-- Own trip:
--   select public.carpool_book_seat(:'trip', 'rear_left', 'x', 13.7, 100.5); -- as owner
--   expect: ไม่สามารถจองทริปของตนเองได้
--
-- Not open:
--   update public.carpool_trips set status = 'cancelled' where id = :'trip'; -- as owner
--   select public.carpool_book_seat(:'trip', 'rear_left', 'x', 13.7, 100.5);
--   expect: ทริปนี้ไม่ได้เปิดรับจอง
-- ---------------------------------------------------------------------------
