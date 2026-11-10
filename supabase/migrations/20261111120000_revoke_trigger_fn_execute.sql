-- Revoke PostgREST EXECUTE on trigger-only SECURITY DEFINER functions.
-- Triggers still fire: Postgres does not check EXECUTE for trigger invocation.
-- Do not apply this file from CI or to a live DB. Bell runs it in the SQL editor
-- (or `supabase db push`) after 20261111090000_trip_chat.
--
-- Does not touch accept_ride, nearby_requested_rides, verify_trip_pin, or ride_peer.

revoke execute on function public.messages_guard() from public, anon, authenticated;
revoke execute on function public.rides_guard() from public, anon, authenticated;
