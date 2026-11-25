-- เพื่อนร่วมทาง browser-side finish: L10 empty comma parts, L11 200-char
-- coarse-label cap + stored-label CHECKs, L3 spatial-index note.
-- NEW FILE. Do not edit 20261118100000 / 120000 / 130000 / 140000 / 150000
-- or any earlier migration. Do not apply this to any remote DB from CI.
-- CI applies it only to ephemeral Postgres (supabase/tests/run-carpool-rls.sh).
-- NOT applied to the live project.
--
-- L10: private.carpool_coarse_label must drop empty comma parts so
-- 'X,,กรุงเทพมหานคร,' matches TS privacy.ts (split + filter length > 0).
--
-- L11: truncate lookup input to 200 chars (keep the tail — province is last)
-- and cap output at 200. Stored pickup/dest labels get a CHECK of 200
-- only when every existing row already fits. We do not rewrite stored
-- owner addresses: those are the true meeting-point text; clipping them
-- would hide house numbers. Lookup is independent of that CHECK.
--
-- L3: discover is still bbox + vertex haversine. Spatial extension is not
-- enabled. Do not add one from this file. The TODO stays on the
-- 20261118150000 discover helpers; this file only restates it.
--
-- SECURITY DEFINER helpers in private, search_path ''. Trigger functions
-- get no EXECUTE grant. Add nothing to Realtime. No explicit BEGIN/COMMIT.

-- L3: no GiST/sp-gist spatial index for discover (PostGIS is not enabled);
-- bbox + vertex scan only. TODO: add a spatial index (or grid prefilter)
-- if discover volume needs it. See public.carpool_discover_trips /
-- private.carpool_search_distances in 20261118150000.

create or replace function private.carpool_coarse_label(p_address text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text := private.carpool_strip_format(p_address);
  parts text[];
  n int;
  last_part text;
  key text;
  canon text;
begin
  -- L11: cap before split/lookup. Keep the tail so a long formatted
  -- address still has its province/country.
  if pg_catalog.char_length(raw) > 200 then
    raw := pg_catalog.right(raw, 200);
  end if;
  if raw = '' or pg_catalog.strpos(raw, ',') = 0 then
    return 'พื้นที่ใกล้เคียง';
  end if;
  parts := pg_catalog.regexp_split_to_array(raw, '\s*,\s*');
  -- L10: drop empty comma parts (TS: .filter((p) => p.length > 0)).
  parts := array(
    select pg_catalog.btrim(p)
      from pg_catalog.unnest(parts) as t(p)
     where pg_catalog.btrim(p) <> ''
  );
  n := pg_catalog.cardinality(parts);
  while n > 0 loop
    last_part := pg_catalog.btrim(parts[n]);
    key := pg_catalog.lower(private.carpool_strip_format(last_part));
    exit when key not in ('thailand', 'ประเทศไทย', 'ไทย');
    n := n - 1;
  end loop;
  if n < 1 then
    return 'พื้นที่ใกล้เคียง';
  end if;
  last_part := pg_catalog.btrim(parts[n]);
  last_part := pg_catalog.regexp_replace(last_part, '[[:space:]]+[0-9]{5}$', '');
  last_part := pg_catalog.btrim(last_part);
  if last_part = '' or private.carpool_text_has_number(last_part) then
    return 'พื้นที่ใกล้เคียง';
  end if;
  canon := private.carpool_lookup_province(last_part);
  if canon is null then
    return 'พื้นที่ใกล้เคียง';
  end if;
  if pg_catalog.char_length(canon) > 200 then
    return pg_catalog.left(canon, 200);
  end if;
  return canon;
end;
$$;

comment on function private.carpool_coarse_label(text) is
  'Allowlist province for the last non-empty comma part. Drops empty parts and a trailing country/postcode. Input/output capped at 200 chars. Never returns input text.';

revoke all on function private.carpool_coarse_label(text) from public, anon, authenticated;

-- L11: CHECK stored labels at 200 when existing rows already fit.
-- Skip (do not fail the migration) if a live row is longer — lookup still
-- truncates. Do not UPDATE existing addresses.
do $$
begin
  if exists (
    select 1 from public.carpool_trips
     where pg_catalog.char_length(pickup_label) > 200
        or pg_catalog.char_length(dest_label) > 200
  ) or exists (
    select 1 from public.carpool_bookings
     where pg_catalog.char_length(dest_label) > 200
  ) then
    raise notice 'skipping label length CHECKs: an existing row exceeds 200 chars';
    return;
  end if;

  alter table public.carpool_trips
    drop constraint if exists carpool_trips_pickup_label_len;
  alter table public.carpool_trips
    add constraint carpool_trips_pickup_label_len
    check (char_length(pickup_label) <= 200);

  alter table public.carpool_trips
    drop constraint if exists carpool_trips_dest_label_len;
  alter table public.carpool_trips
    add constraint carpool_trips_dest_label_len
    check (char_length(dest_label) <= 200);

  alter table public.carpool_bookings
    drop constraint if exists carpool_bookings_dest_label_len;
  alter table public.carpool_bookings
    add constraint carpool_bookings_dest_label_len
    check (char_length(dest_label) <= 200);
end $$;
