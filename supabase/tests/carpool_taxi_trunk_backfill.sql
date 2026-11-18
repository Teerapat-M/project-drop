-- Assert 20261118130000_carpool_taxi_trunk.sql backfilled taxi trunks and
-- left private-car dims alone. Run AFTER that migration, BEFORE carpool_rls.sql.
-- CI: supabase/tests/run-carpool-rls.sh.

do $$
declare
  taxi uuid := '00000000-0000-4000-8000-0000000000aa';
  priv uuid := '00000000-0000-4000-8000-0000000000ab';
  w numeric;
  h numeric;
  l numeric;
  denied boolean := false;
begin
  select trunk_w_cm, trunk_h_cm, trunk_l_cm into w, h, l
    from public.carpool_trips where id = taxi;
  if w <> 100 or h <> 40 or l <> 50 then
    raise exception 'legacy taxi 100×50×50 must backfill to 100×40×50, got %×%×%', w, h, l;
  end if;

  select trunk_w_cm, trunk_h_cm, trunk_l_cm into w, h, l
    from public.carpool_trips where id = priv;
  if w <> 140 or h <> 40 or l <> 150 then
    raise exception 'private custom trunk must stay 140×40×150, got %×%×%', w, h, l;
  end if;

  -- Skip the force-trigger so the CHECK is what rejects a bad taxi value.
  perform set_config('session_replication_role', 'replica', true);
  begin
    update public.carpool_trips
       set trunk_w_cm = 99, trunk_h_cm = 50, trunk_l_cm = 50
     where id = taxi;
  exception
    when check_violation then
      denied := true;
  end;
  perform set_config('session_replication_role', 'origin', true);
  if not denied then
    raise exception 'carpool_trips_taxi_trunk_preset CHECK should reject non-preset taxi dims';
  end if;

  -- L2: NaN detour backfilled to 0, then CHECK (detour_km <> 'NaN').
  select b.detour_km into w
    from public.carpool_bookings b
   where b.id = '00000000-0000-4000-8000-0000000000ac';
  if w is distinct from 0 then
    raise exception 'legacy NaN detour must backfill to 0, got %', w;
  end if;

  denied := false;
  perform set_config('session_replication_role', 'replica', true);
  begin
    update public.carpool_bookings
       set detour_km = 'NaN'::numeric
     where id = '00000000-0000-4000-8000-0000000000ac';
  exception
    when check_violation then
      denied := true;
  end;
  perform set_config('session_replication_role', 'origin', true);
  if not denied then
    raise exception 'carpool_bookings_detour_not_nan CHECK should reject NaN detour';
  end if;

  -- Max detour: legacy taxi backfilled to 5; private stays null.
  select t.max_detour_km into w from public.carpool_trips t where t.id = taxi;
  if w is distinct from 5 then
    raise exception 'legacy taxi max_detour_km must backfill to 5, got %', w;
  end if;
  select t.max_detour_km into w from public.carpool_trips t where t.id = priv;
  if w is not null then
    raise exception 'private max_detour_km must stay null, got %', w;
  end if;

  denied := false;
  perform set_config('session_replication_role', 'replica', true);
  begin
    update public.carpool_trips set max_detour_km = 0 where id = taxi;
  exception
    when check_violation then
      denied := true;
  end;
  perform set_config('session_replication_role', 'origin', true);
  if not denied then
    raise exception 'carpool_trips_max_detour_km CHECK should reject taxi max_detour_km < 1';
  end if;

  denied := false;
  perform set_config('session_replication_role', 'replica', true);
  begin
    update public.carpool_trips set max_detour_km = 31 where id = taxi;
  exception
    when check_violation then
      denied := true;
  end;
  perform set_config('session_replication_role', 'origin', true);
  if not denied then
    raise exception 'carpool_trips_max_detour_km CHECK should reject taxi max_detour_km > 30';
  end if;

  raise notice 'taxi trunk backfill: taxi preset, private untouched, CHECK holds, NaN detour backfilled, max_detour 5';
end $$;
