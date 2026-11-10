-- Privilege assertions for 20261111120000_revoke_trigger_fn_execute.sql.
-- Not run in CI (no live DB). Apply profiles + rides + hardening + trip_chat +
-- revoke_trigger_fn_execute on a throwaway Postgres, then:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trigger_fn_execute.sql
-- Server Jest mirrors the revoke text in apps/server/src/rides/rls.test.ts
-- and apps/server/src/chat/rls.test.ts.

-- Trigger-only SECURITY DEFINER functions must not be callable via /rest/v1/rpc.
do $$
begin
  if has_function_privilege('anon', 'public.messages_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.messages_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.messages_guard()';
  end if;

  if has_function_privilege('anon', 'public.rides_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rides_guard()', 'EXECUTE') then
    raise exception 'anon/authenticated must not EXECUTE public.rides_guard()';
  end if;
end $$;

-- Intentional RPCs stay executable by authenticated.
do $$
begin
  if not has_function_privilege('authenticated', 'public.accept_ride(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.accept_ride(uuid)';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.nearby_requested_rides(double precision, double precision, double precision)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must EXECUTE public.nearby_requested_rides(...)';
  end if;
  if not has_function_privilege('authenticated', 'public.verify_trip_pin(uuid, text)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.verify_trip_pin(uuid, text)';
  end if;
  if not has_function_privilege('authenticated', 'public.ride_peer(uuid)', 'EXECUTE') then
    raise exception 'authenticated must EXECUTE public.ride_peer(uuid)';
  end if;
end $$;

-- Triggers still exist and are enabled (trigger invocation does not check EXECUTE).
do $$
begin
  if not exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'messages'
       and t.tgname = 'messages_guard'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
  ) then
    raise exception 'messages_guard trigger missing or disabled';
  end if;

  if not exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'rides'
       and t.tgname = 'rides_guard'
       and not t.tgisinternal
       and t.tgenabled <> 'D'
  ) then
    raise exception 'rides_guard trigger missing or disabled';
  end if;
end $$;
