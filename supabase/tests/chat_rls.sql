-- Chat RLS + publication assertions for 20261111090000_trip_chat.sql.
-- Not run in CI (no live DB). Apply profiles + rides + hardening + trip_chat on a
-- throwaway Postgres, stub auth.uid() / profiles like the PR review harness, then:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/chat_rls.sql
-- Server Jest mirrors the same rules in apps/server/src/chat/rls.test.ts.

-- HIGH: ride_pins stays out of Realtime; messages is published.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'ride_pins'
  ) then
    raise exception 'HIGH: ride_pins must not be in supabase_realtime';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'messages'
  ) then
    raise exception 'HIGH: messages must be in supabase_realtime';
  end if;

  if exists (
    select 1
      from pg_publication_tables p
      join information_schema.columns c
        on c.table_schema = p.schemaname and c.table_name = p.tablename
     where p.pubname = 'supabase_realtime'
       and c.column_name in ('pin', 'pin_hash', 'pin_hmac')
  ) then
    raise exception 'HIGH: published table carries a PIN column';
  end if;
end $$;

-- preferred_language exists; users update their own row (existing profiles UPDATE policy).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferred_language'
  ) then
    raise exception 'profiles.preferred_language missing';
  end if;
end $$;

-- Translated columns are not INSERT/UPDATE-able by authenticated.
do $$
declare
  ins_translated int;
  upd int;
begin
  select count(*) into ins_translated
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'messages'
     and grantee = 'authenticated'
     and privilege_type = 'INSERT'
     and column_name in ('translated_text', 'source_lang', 'target_lang');
  if ins_translated > 0 then
    raise exception 'authenticated must not INSERT translated columns';
  end if;

  select count(*) into upd
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'messages'
     and grantee = 'authenticated'
     and privilege_type in ('UPDATE', 'DELETE');
  if upd > 0 then
    raise exception 'authenticated must not UPDATE/DELETE messages';
  end if;
end $$;

-- SELECT: rider of the ride, assigned driver, admin. Not a stranger.
do $$
declare
  sel text;
begin
  select qual into sel
    from pg_policies
   where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_select_participants';
  if sel is null then
    raise exception 'messages_select_participants missing';
  end if;
  if sel !~ 'rider_id' or sel !~ 'driver_id' or sel !~ 'is_admin' then
    raise exception 'SELECT must allow rider, assigned driver, admin: %', sel;
  end if;
end $$;

-- INSERT: sender_id = auth.uid() (no impersonation); only rider or assigned driver;
-- only while accepted/arrived/in_progress (blocked after completed/cancelled).
do $$
declare
  ins text;
begin
  select with_check into ins
    from pg_policies
   where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert_participants';
  if ins is null then
    raise exception 'messages_insert_participants missing';
  end if;
  if ins !~ 'sender_id' or ins !~ 'auth.uid' then
    raise exception 'INSERT must pin sender_id to auth.uid() (no impersonation): %', ins;
  end if;
  if ins !~ 'rider_id' or ins !~ 'driver_id' then
    raise exception 'INSERT must require rider or assigned driver: %', ins;
  end if;
  if ins !~ 'accepted' or ins !~ 'arrived' or ins !~ 'in_progress' then
    raise exception 'INSERT must require an active ride status: %', ins;
  end if;
  if ins ~ 'completed' or ins ~ 'cancelled' or ins ~ 'requested' then
    raise exception 'INSERT must not allow requested/completed/cancelled: %', ins;
  end if;
  -- Admin is not in the INSERT policy (admin can read, not write).
  if ins ~ 'is_admin' then
    raise exception 'INSERT must not allow admin impersonation of a sender: %', ins;
  end if;
end $$;

-- No UPDATE/DELETE policies for authenticated.
do $$
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'messages'
       and cmd in ('UPDATE', 'DELETE')
  ) then
    raise exception 'messages must be insert/select only for RLS clients';
  end if;
end $$;

-- Guard trigger strips forged translations and forces sender_id.
do $$
declare
  def text := pg_get_functiondef('public.messages_guard()'::regprocedure);
begin
  if def !~ 'new.sender_id := uid' then
    raise exception 'messages_guard must force sender_id = auth.uid()';
  end if;
  if def !~ 'new.translated_text := null' then
    raise exception 'messages_guard must null translated_text on user JWT inserts';
  end if;
  if def !~ 'chat is read-only' then
    raise exception 'messages_guard must block inserts after completed/cancelled';
  end if;
end $$;

-- Behavioral attack-path (throwaway DB + auth.uid() stub / harness):
--
-- Rider of ride R, driver D assigned, stranger driver S, stranger rider T, admin A.
-- Ride status = accepted:
--   as rider  -> SELECT ok, INSERT (sender_id=rider) ok
--   as driver -> SELECT ok, INSERT (sender_id=driver) ok
--   as S      -> SELECT 0 rows, INSERT fail
--   as T      -> SELECT 0 rows, INSERT fail
--   as admin  -> SELECT ok, INSERT fail (not a participant)
--   as rider INSERT sender_id=D -> stored sender_id is still rider (guard) / WITH CHECK fail
-- Ride status = completed or cancelled:
--   as rider/driver -> SELECT ok, INSERT fail
-- Direct INSERT of translated_text as authenticated -> column privilege fail
--
-- insert into public.messages (ride_id, sender_id, original_text) values (:ride, :rider, 'hi');
-- insert into public.messages (ride_id, sender_id, original_text) values (:ride, :stranger, 'hi');
-- insert into public.messages (ride_id, sender_id, original_text, translated_text)
--   values (:ride, :rider, 'hi', 'forged');
