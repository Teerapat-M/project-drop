import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../../../supabase');
const sql = readFileSync(join(root, 'migrations/20261118100000_carpool.sql'), 'utf8');
const stopsSql = readFileSync(join(root, 'migrations/20261118120000_carpool_trip_stops.sql'), 'utf8');
const taxiTrunkSql = readFileSync(join(root, 'migrations/20261118130000_carpool_taxi_trunk.sql'), 'utf8');
const c24LowsSql = readFileSync(join(root, 'migrations/20261118140000_carpool_c24_lows.sql'), 'utf8');
const c25Sql = readFileSync(
  join(root, 'migrations/20261118150000_carpool_c25_drop_admin_geo_reqs.sql'),
  'utf8',
);
const testSql = readFileSync(join(root, 'tests/carpool_rls.sql'), 'utf8');
const ridesSql = readFileSync(join(root, 'migrations/20261110180000_rides.sql'), 'utf8');
const revokeSql = readFileSync(
  join(root, 'migrations/20261111120000_revoke_trigger_fn_execute.sql'),
  'utf8',
);

describe('carpool migration security text', () => {
  it('is a new file and does not edit applied Drop migrations', () => {
    expect(sql).toMatch(/create table public\.carpool_trips/);
    expect(ridesSql).not.toMatch(/carpool_trips/);
    expect(revokeSql).not.toMatch(/carpool_/);
  });

  it('uses a public carpool_ prefix (no extra schema to expose)', () => {
    expect(sql).not.toMatch(/create schema\s+carpool\b/i);
    expect(sql).toMatch(/create table public\.carpool_seats/);
    expect(sql).toMatch(/create table public\.carpool_bookings/);
    expect(sql).toMatch(/create table public\.carpool_saved_addresses/);
    expect(sql).toMatch(/create table public\.carpool_messages/);
  });

  it('enables RLS on every carpool table', () => {
    for (const table of [
      'carpool_trips',
      'carpool_seats',
      'carpool_bookings',
      'carpool_saved_addresses',
      'carpool_messages',
    ]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
    }
  });

  it('keeps rider identity off seats (no booked_by) so Realtime is safe', () => {
    const seatsCols = sql.match(/create table public\.carpool_seats \(([\s\S]*?)\n\);/)?.[1] ?? '';
    expect(seatsCols).toMatch(/is_booked boolean/);
    expect(seatsCols).not.toMatch(/booked_by/);
    expect(sql).toMatch(/unique \(trip_id, position\)/);
    expect(sql).toMatch(/grant update \(is_open\) on table public\.carpool_seats/);
  });

  it('defines sedan rear_middle and hatch/pickup without it', () => {
    expect(sql).toMatch(/'front_passenger', 'rear_left', 'rear_middle', 'rear_right'/);
    expect(sql).toMatch(/else array\[\s*'front_passenger', 'rear_left', 'rear_right'/);
  });

  it('books atomically with FOR UPDATE and the exact Thai conflict message', () => {
    expect(sql).toMatch(/create or replace function public\.carpool_book_seat/);
    expect(sql).toMatch(/for update/);
    expect(sql).toMatch(/raise exception 'ที่นั่งนี้เพิ่งถูกจอง'/);
    expect(sql).toMatch(/raise exception 'ที่นั่งนี้ปิดอยู่'/);
    expect(sql).toMatch(/raise exception 'ไม่สามารถจองทริปของตนเองได้'/);
    expect(sql).toMatch(/raise exception 'ทริปนี้ไม่ได้เปิดรับจอง'/);
    expect(sql).toMatch(/raise exception 'คุณจองทริปนี้แล้ว'/);
    expect(sql).toMatch(/and s\.is_booked = false/);
  });

  it('sets search_path on every definer function', () => {
    const definers = [...sql.matchAll(/create or replace function [\s\S]*?as \$\$/g)].map(
      (m) => m[0],
    );
    expect(definers.length).toBeGreaterThan(8);
    for (const block of definers) {
      expect(block).toMatch(/set search_path = ''/);
    }
  });

  it('revokes EXECUTE on trigger functions and grants only the intentional RPCs', () => {
    for (const fn of [
      'carpool_trips_guard()',
      'carpool_trips_seed_seats()',
      'carpool_seats_guard()',
      'carpool_bookings_guard()',
      'carpool_messages_guard()',
      'carpool_saved_addresses_guard()',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke execute on function public\\.${fn.replace('(', '\\(').replace(')', '\\)')} from public, anon, authenticated;`,
        ),
      );
    }
    expect(sql).toMatch(
      /grant execute on function public\.carpool_book_seat\([\s\S]*?\) to authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.carpool_discover_trips\([\s\S]*?\) to authenticated, service_role;/,
    );
    expect(sql).toMatch(/revoke all on function public\.carpool_book_seat\([\s\S]*?\) from public, anon;/);
    expect(sql).not.toMatch(/grant execute on function public\.carpool_trips_guard/);
    expect(sql).toMatch(
      /grant execute on function private\.carpool_is_trip_owner\(uuid\) to authenticated;/,
    );
    expect(sql).toMatch(
      /grant execute on function private\.carpool_is_booked_rider\(uuid\) to authenticated;/,
    );
    expect(sql).toMatch(
      /grant execute on function private\.carpool_is_participant\(uuid\) to authenticated;/,
    );
    expect(sql).toMatch(
      /revoke all on function private\.carpool_is_participant\(uuid, uuid\) from public, anon, authenticated;/,
    );
  });

  it('breaks trips↔bookings RLS recursion with DEFINER helpers', () => {
    const tripsSelect =
      sql.match(/create policy "carpool_trips_select_participants"[\s\S]*?;/)?.[0] ?? '';
    expect(tripsSelect).toMatch(/private\.carpool_is_booked_rider/);
    expect(tripsSelect).not.toMatch(/from public\.carpool_bookings/);
    const bookingsSelect = sql.match(/create policy "carpool_bookings_select"[\s\S]*?;/)?.[0] ?? '';
    expect(bookingsSelect).toMatch(/private\.carpool_is_trip_owner/);
    expect(bookingsSelect).not.toMatch(/from public\.carpool_trips/);
    const seatsSelect = sql.match(/create policy "carpool_seats_select"[\s\S]*?;/)?.[0] ?? '';
    expect(seatsSelect).toMatch(/private\.carpool_can_select_seat/);
    expect(seatsSelect).not.toMatch(/from public\.carpool_trips/);
    expect(sql).toMatch(/set search_path = ''/);
  });

  it('publishes carpool_seats and carpool_messages and never ride_pins', () => {
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.carpool_seats/);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.carpool_messages/);
    expect(sql).not.toMatch(/add table public\.ride_pins/i);
    expect(sql).toMatch(/drop table public\.ride_pins/);
    expect(sql).not.toMatch(/add table public\.rides/);
  });

  it('documents discovery without exact coords or rider identities', () => {
    expect(sql).toMatch(/carpool_discover_trips/);
    expect(sql).toMatch(/pg_catalog\.round\(t\.pickup_lat::numeric, 3\)/);
    expect(sql).toMatch(/NO owner_id, NO rider ids/);
    const discover = sql.match(
      /create or replace function public\.carpool_discover_trips[\s\S]*?end;\n\$\$;/,
    )?.[0] ?? '';
    expect(discover).toMatch(/p\.full_name as owner_display_name/);
    expect(discover).not.toMatch(/t\.owner_id as/);
  });

  it('keeps chat read-only after completed/cancelled', () => {
    expect(sql).toMatch(/chat is read-only for this trip/);
    expect(sql).toMatch(/t\.status in \('open', 'full', 'in_progress'\)/);
  });
});

describe('carpool SQL test file', () => {
  it('covers RLS roles, atomic booking, and EXECUTE privileges', () => {
    expect(testSql).toMatch(/carpool_seats must be in supabase_realtime/);
    expect(testSql).toMatch(/ride_pins must not be in supabase_realtime/);
    expect(testSql).toMatch(/anon\/authenticated must not EXECUTE public\.carpool_trips_guard/);
    expect(testSql).toMatch(/authenticated must EXECUTE public\.carpool_book_seat/);
    expect(testSql).toMatch(/ที่นั่งนี้เพิ่งถูกจอง/);
    expect(testSql).toMatch(/FOR UPDATE/);
    expect(testSql).toMatch(/set local role authenticated/);
    expect(testSql).toMatch(/request\.jwt\.claims/);
    expect(testSql).toMatch(/INSERT RETURNING/);
    expect(testSql).toMatch(/ไม่สามารถจองทริปของตนเองได้/);
    expect(testSql).toMatch(/ทริปนี้ไม่ได้เปิดรับจอง/);
    expect(testSql).toMatch(/ที่นั่งนี้ปิดอยู่/);
    expect(testSql).toMatch(/anon sees nothing/);
    expect(testSql).toMatch(/admin SELECT trip/);
    expect(testSql).toMatch(/owner carpool_set_seat_open toggle/);
    expect(testSql).toMatch(/cannot close booked seat via carpool_set_seat_open/);
    expect(testSql).toMatch(/stranger carpool_set_seat_open denied/);
    expect(testSql).toMatch(/owner insert\/update\/delete own stops/);
    expect(testSql).toMatch(/stranger cannot write stops/);
    expect(testSql).toMatch(/discover\/preview stay rounded with no owner id/);
    expect(testSql).toMatch(/anon is denied stops/);
    expect(testSql).toMatch(/underreported p_detour_km raised to floor/);
    expect(testSql).toMatch(/honest detour kept; charge only the requester/);
    expect(testSql).toMatch(/no-detour rider gets 0/);
    expect(testSql).toMatch(/direct UPDATE detour_km is permission denied/);
    expect(testSql).toMatch(/dest change recomputes floor; charge only the requester/);
    expect(testSql).toMatch(/taxi trunk insert\/update forced to preset/);
    expect(testSql).toMatch(/preview taxi luggage volume-desc no rider ids/);
    expect(testSql).toMatch(/private trunk insert\/update unchanged/);
    expect(testSql).toMatch(/anon\/authenticated must not EXECUTE public\.carpool_trips_taxi_trunk/);
    expect(testSql).toMatch(/NaN detour insert\/update rejected by CHECK/);
    expect(testSql).toMatch(/dest edits allowed while trip is open/);
    expect(testSql).toMatch(/direct UPDATE luggage is 42501/);
    expect(testSql).toMatch(/dest_\* change rejected when in_progress/);
    expect(testSql).toMatch(/luggage change rejected when in_progress/);
    expect(testSql).toMatch(/dest_\* change rejected when completed/);
    expect(testSql).toMatch(/luggage change rejected when completed/);
    expect(testSql).toMatch(/ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว/);
    expect(testSql).toMatch(/discover returns max_detour_km and no owner_id/);
    expect(testSql).toMatch(/lowering cap below active booking floor rejected/);
    expect(testSql).toMatch(/lowering cap to >= max active floor allowed/);
    expect(testSql).toMatch(/raising cap allowed/);
    expect(testSql).toMatch(/lowering below stored overreport allowed when floor fits/);
    expect(testSql).toMatch(/cancelled bookings ignored when lowering cap/);
    expect(testSql).toMatch(/is_mine true only for the owner/);
    expect(testSql).toMatch(/owner My Trips sees owned trips/);
    expect(testSql).toMatch(/rider My Trips sees booked trips/);
    expect(testSql).toMatch(/stranger My Trips does not see others/);
  });
});

describe('carpool trip stops migration', () => {
  it('is a new file after 20261118100000 and does not edit it', () => {
    expect(sql).not.toMatch(/carpool_trip_stops/);
    expect(stopsSql).toMatch(/create table public\.carpool_trip_stops/);
    expect(stopsSql).toMatch(/unique \(trip_id, seq\)/);
    expect(stopsSql).toMatch(/on delete cascade/);
    expect(stopsSql).toMatch(/alter table public\.carpool_trip_stops enable row level security/);
  });

  it('mirrors trip visibility for reads and owner-only writes', () => {
    expect(stopsSql).toMatch(/private\.carpool_is_trip_owner\(trip_id\)/);
    expect(stopsSql).toMatch(/private\.carpool_is_booked_rider\(trip_id\)/);
    expect(stopsSql).toMatch(/carpool_trip_stops_insert_owner/);
    expect(stopsSql).toMatch(/revoke execute on function public\.carpool_trip_stops_guard\(\) from public, anon, authenticated;/);
    expect(stopsSql).toMatch(/set search_path = ''/);
    expect(stopsSql).not.toMatch(/add table public\.carpool_trip_stops/);
  });

  it('makes carpool_book_seat store greatest(haversine floor, client detour)', () => {
    expect(stopsSql).toMatch(/create or replace function private\.carpool_haversine_km/);
    expect(stopsSql).toMatch(/road_factor constant numeric := 1\.0/);
    expect(stopsSql).toMatch(/straight-line/);
    expect(stopsSql).toMatch(/revoke update \(detour_km\) on table public\.carpool_bookings/);
    expect(stopsSql).toMatch(/create or replace function public\.carpool_bookings_guard/);
    expect(stopsSql).toMatch(/new\.detour_km := old\.detour_km/);
    expect(stopsSql).toMatch(
      /revoke execute on function public\.carpool_bookings_guard\(\) from public, anon, authenticated;/,
    );
    expect(stopsSql).toMatch(/create or replace function private\.carpool_detour_floor_km/);
    expect(stopsSql).toMatch(
      /revoke all on function private\.carpool_haversine_km\([\s\S]*?\) from public, anon, authenticated;/,
    );
    expect(stopsSql).toMatch(
      /revoke all on function private\.carpool_detour_floor_km\([\s\S]*?\) from public, anon, authenticated;/,
    );
    const book =
      stopsSql.match(
        /create or replace function public\.carpool_book_seat[\s\S]*?end;\n\$\$;/,
      )?.[0] ?? '';
    expect(book).toMatch(/private\.carpool_detour_floor_km/);
    expect(book).toMatch(/greatest\(/);
    expect(book).toMatch(/coalesce\(p_detour_km, 0\)/);
    expect(book).toMatch(/set search_path = ''/);
  });


  it('replaces preview with rounded stop coords and no owner_id', () => {
    const preview =
      stopsSql.match(
        /create or replace function public\.carpool_trip_preview[\s\S]*?end;\n\$\$;/,
      )?.[0] ?? '';
    expect(preview).toMatch(/pg_catalog\.round\(st\.lat::numeric, 3\)/);
    expect(preview).toMatch(/pg_catalog\.round\(st\.lng::numeric, 3\)/);
    expect(preview).not.toMatch(/'owner_id'/);
    expect(preview).not.toMatch(/t\.owner_id as/);
    expect(preview).toMatch(/'stops'/);
  });
});

describe('carpool taxi trunk migration', () => {
  it('is a new file after trip_stops and does not edit earlier carpool SQL', () => {
    expect(sql).not.toMatch(/carpool_taxi_trunk/);
    expect(stopsSql).not.toMatch(/carpool_trips_taxi_trunk/);
    expect(taxiTrunkSql).toMatch(/create or replace function private\.carpool_taxi_trunk\(\)/);
    expect(taxiTrunkSql).toMatch(/select 100::numeric, 40::numeric, 50::numeric/);
    expect(taxiTrunkSql).toMatch(/carpool_trips_taxi_trunk_preset/);
  });

  it('backfills taxi trunks before the trigger and CHECK', () => {
    const updateAt = taxiTrunkSql.indexOf('update public.carpool_trips t');
    const triggerAt = taxiTrunkSql.indexOf('create trigger carpool_trips_taxi_trunk');
    const checkAt = taxiTrunkSql.indexOf('carpool_trips_taxi_trunk_preset');
    expect(updateAt).toBeGreaterThan(0);
    expect(updateAt).toBeLessThan(triggerAt);
    expect(updateAt).toBeLessThan(checkAt);
    expect(taxiTrunkSql).toMatch(/t\.kind = 'taxi'/);
  });

  it('forces taxi dims via a trigger with no EXECUTE grant', () => {
    expect(taxiTrunkSql).toMatch(/set search_path = ''/);
    expect(taxiTrunkSql).toMatch(
      /revoke execute on function public\.carpool_trips_taxi_trunk\(\) from public, anon, authenticated;/,
    );
    expect(taxiTrunkSql).toMatch(
      /revoke all on function private\.carpool_taxi_trunk\(\) from public, anon, authenticated;/,
    );
    expect(taxiTrunkSql).not.toMatch(/grant execute on function public\.carpool_trips_taxi_trunk/);
    expect(taxiTrunkSql).toMatch(/if new\.kind = 'taxi'/);
    expect(taxiTrunkSql).toMatch(/kind <> 'taxi'/);
  });

  it('adds anonymized preview luggage ordered by volume, not owner', () => {
    const preview =
      taxiTrunkSql.match(
        /create or replace function public\.carpool_trip_preview[\s\S]*?end;\n\$\$;/,
      )?.[0] ?? '';
    expect(preview).toMatch(/'luggage'/);
    expect(preview).toMatch(
      /order by\s+\(b\.luggage_h_cm \* b\.luggage_w_cm \* b\.luggage_d_cm\) desc/,
    );
    expect(preview).not.toMatch(/rider_id = t\.owner_id/);
    expect(preview).not.toMatch(/b\.created_at/);
    expect(preview).not.toMatch(/'rider_id'/);
    expect(preview).not.toMatch(/'owner_id'/);
    expect(preview).toMatch(/'is_mine'/);
    expect(preview).toMatch(/'stops'/);
  });

  it('adds is_mine and province/district filters to discover without exposing owner_id', () => {
    expect(taxiTrunkSql).toMatch(/drop function if exists public\.carpool_discover_trips/);
    expect(taxiTrunkSql).toMatch(/p_origin_province_code text default null/);
    expect(taxiTrunkSql).toMatch(/\(t\.owner_id = uid\) as is_mine/);
    expect(taxiTrunkSql).not.toMatch(/t\.owner_id as/);
    expect(taxiTrunkSql).toMatch(
      /grant execute on function public\.carpool_discover_trips\(\s*public\.carpool_trip_kind, text, text, text, text\s*\) to authenticated, service_role;/,
    );
    expect(taxiTrunkSql).toMatch(/carpool_trips_origin_district_matches_province/);
    expect(taxiTrunkSql).toMatch(/left\(origin_district_code, 2\) = origin_province_code/);
    expect(taxiTrunkSql).toMatch(/left\(dest_district_code, 2\) = dest_province_code/);
  });

  it('adds NaN detour CHECK and freezes dest/luggage after the trip starts', () => {
    const disableAt = taxiTrunkSql.indexOf('disable trigger carpool_bookings_guard');
    const nanAt = taxiTrunkSql.indexOf("detour_km = 'NaN'");
    const enableAt = taxiTrunkSql.indexOf('enable trigger carpool_bookings_guard');
    const checkAt = taxiTrunkSql.indexOf('carpool_bookings_detour_not_nan');
    expect(disableAt).toBeGreaterThan(0);
    expect(nanAt).toBeGreaterThan(disableAt);
    expect(enableAt).toBeGreaterThan(nanAt);
    expect(checkAt).toBeGreaterThan(enableAt);
    expect(taxiTrunkSql).not.toMatch(/session_replication_role/);
    expect(taxiTrunkSql).not.toMatch(/^\s*begin\s*;/im);
    expect(taxiTrunkSql).not.toMatch(/^\s*commit\s*;/im);
    expect(taxiTrunkSql).toMatch(/check \(detour_km <> 'NaN'\)/);
    expect(stopsSql).not.toMatch(/carpool_bookings_detour_not_nan/);
    expect(stopsSql).not.toMatch(/cannot change drop-off or luggage after the trip has started/);
    const guard =
      taxiTrunkSql.match(
        /create or replace function public\.carpool_bookings_guard[\s\S]*?end;\n\$\$;/,
      )?.[0] ?? '';
    expect(guard).toMatch(/in_progress', 'completed', 'cancelled'/);
    expect(guard).toMatch(/cannot change drop-off or luggage after the trip has started/);
    expect(guard).toMatch(/new\.detour_km := old\.detour_km/);
    expect(guard).toMatch(/private\.carpool_enforce_max_detour/);
    expect(guard).toMatch(/set search_path = ''/);
    expect(taxiTrunkSql).toMatch(
      /revoke execute on function public\.carpool_bookings_guard\(\) from public, anon, authenticated;/,
    );
    expect(taxiTrunkSql).not.toMatch(/add table public\.carpool_/);
  });

  it('adds taxi max_detour_km with default 5, range 1–30, and book_seat cap', () => {
    const colAt = taxiTrunkSql.indexOf('add column if not exists max_detour_km');
    const checkAt = taxiTrunkSql.indexOf('carpool_trips_max_detour_km');
    expect(colAt).toBeGreaterThan(0);
    expect(taxiTrunkSql).toMatch(/set max_detour_km = 5/);
    expect(checkAt).toBeGreaterThan(colAt);
    expect(taxiTrunkSql).toMatch(/max_detour_km >= 1/);
    expect(taxiTrunkSql).toMatch(/max_detour_km <= 30/);
    expect(taxiTrunkSql).toMatch(/'max_detour_km', t.max_detour_km/);
    const book =
      taxiTrunkSql.match(
        /create or replace function public\.carpool_book_seat[\s\S]*?end;\n\$\$;/,
      )?.[0] ?? '';
    expect(book).toMatch(/private\.carpool_enforce_max_detour/);
    expect(book).toMatch(/ไม่สามารถจองทริปของตนเองได้/);
    expect(book).toMatch(/ที่นั่งนี้เพิ่งถูกจอง/);
    expect(book).toMatch(/set search_path = ''/);
    expect(taxiTrunkSql).toMatch(/จุดลงนี้ออกนอกเส้นทาง/);
    expect(taxiTrunkSql).not.toMatch(/t\.owner_id as/);
  });
});

describe('carpool taxi trunk backfill runner', () => {
  const seedSql = readFileSync(join(root, 'tests/carpool_taxi_trunk_seed.sql'), 'utf8');
  const backfillSql = readFileSync(join(root, 'tests/carpool_taxi_trunk_backfill.sql'), 'utf8');
  const runner = readFileSync(join(root, 'tests/run-carpool-rls.sh'), 'utf8');

  it('seeds a legacy taxi 100×50×50 and a private custom trunk before the migration', () => {
    expect(seedSql).toMatch(/100, 50, 50/);
    expect(seedSql).toMatch(/'taxi'/);
    expect(seedSql).toMatch(/140, 40, 150/);
    expect(seedSql).toMatch(/'private'/);
    expect(seedSql).toMatch(/'NaN'::numeric/);
    expect(seedSql).toMatch(/session_replication_role/);
    expect(runner).toMatch(/carpool_taxi_trunk_seed\.sql/);
    expect(runner.indexOf('carpool_taxi_trunk_seed.sql')).toBeLessThan(
      runner.indexOf('20261118130000_carpool_taxi_trunk.sql'),
    );
  });

  it('asserts backfill, private unchanged, and CHECK after the migration', () => {
    expect(backfillSql).toMatch(/100×40×50/);
    expect(backfillSql).toMatch(/140×40×150/);
    expect(backfillSql).toMatch(/check_violation/);
    expect(backfillSql).toMatch(/legacy NaN detour must backfill to 0/);
    expect(backfillSql).toMatch(/carpool_bookings_detour_not_nan/);
    expect(runner).toMatch(/carpool_taxi_trunk_backfill\.sql/);
    expect(runner.indexOf('20261118130000_carpool_taxi_trunk.sql')).toBeLessThan(
      runner.indexOf('carpool_taxi_trunk_backfill.sql'),
    );
    expect(runner).toMatch(/20261118140000_carpool_c24_lows\.sql/);
    expect(runner.indexOf('carpool_taxi_trunk_backfill.sql')).toBeLessThan(
      runner.indexOf('20261118140000_carpool_c24_lows.sql'),
    );
  });
});

describe('carpool C2.4 lows migration', () => {
  it('is a new file after taxi_trunk and does not edit earlier carpool SQL', () => {
    expect(sql).not.toMatch(/carpool_c24_lows/);
    expect(stopsSql).not.toMatch(/max_detour_km numeric\n\)/);
    expect(taxiTrunkSql).not.toMatch(/ลดระยะออกนอกเส้นทางสูงสุดไม่ได้/);
    expect(c24LowsSql).toMatch(/drop function if exists public\.carpool_discover_trips/);
    expect(c24LowsSql).not.toMatch(/^\s*begin\s*;/im);
    expect(c24LowsSql).not.toMatch(/^\s*commit\s*;/im);
    expect(c24LowsSql).not.toMatch(/add table public\.carpool_/);
  });

  it('adds max_detour_km to discover without exposing owner_id and re-grants EXECUTE', () => {
    expect(c24LowsSql).toMatch(/t\.max_detour_km/);
    expect(c24LowsSql).toMatch(/\(t\.owner_id = uid\) as is_mine/);
    expect(c24LowsSql).not.toMatch(/t\.owner_id as/);
    expect(c24LowsSql).toMatch(/p_origin_province_code text default null/);
    expect(c24LowsSql).toMatch(
      /grant execute on function public\.carpool_discover_trips\(\s*public\.carpool_trip_kind, text, text, text, text\s*\) to authenticated, service_role;/,
    );
    expect(c24LowsSql).toMatch(
      /revoke all on function public\.carpool_discover_trips\(\s*public\.carpool_trip_kind, text, text, text, text\s*\) from public, anon;/,
    );
  });

  it('blocks lowering max_detour_km against the haversine floor, not stored detour_km', () => {
    const guard =
      c24LowsSql.match(
        /create or replace function public\.carpool_trips_guard[\s\S]*?end;\n\$\$;/,
      )?.[0] ?? '';
    expect(guard).toMatch(/set search_path = ''/);
    expect(guard).toMatch(/cannot change owner_id/);
    expect(guard).toMatch(/cannot change trip kind/);
    expect(guard).toMatch(/cannot change vehicle_type/);
    expect(guard).toMatch(/invalid carpool status transition/);
    expect(guard).toMatch(/private\.carpool_detour_floor_km/);
    expect(guard).toMatch(/ลดระยะออกนอกเส้นทางสูงสุดไม่ได้ มีผู้โดยสารที่จองไว้ออกนอกเส้นทาง/);
    expect(guard).not.toMatch(/b\.detour_km/);
    expect(c24LowsSql).toMatch(
      /revoke execute on function public\.carpool_trips_guard\(\) from public, anon, authenticated;/,
    );
    expect(c24LowsSql).not.toMatch(/grant execute on function public\.carpool_trips_guard/);
  });

  it('translates bookings_guard RAISE strings to Thai and keeps freeze/floor logic', () => {
    const guard =
      c24LowsSql.match(
        /create or replace function public\.carpool_bookings_guard[\s\S]*?end;\n\$\$;/,
      )?.[0] ?? '';
    expect(guard).toMatch(/set search_path = ''/);
    expect(guard).toMatch(/in_progress', 'completed', 'cancelled'/);
    expect(guard).toMatch(/ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว/);
    expect(guard).toMatch(/เฉพาะผู้โดยสารที่ยกเลิกการจองได้/);
    expect(guard).toMatch(/ไม่สามารถโอนการจองได้/);
    expect(guard).toMatch(/เฉพาะผู้โดยสารที่แก้ไขการจองได้/);
    expect(guard).not.toMatch(/cannot change drop-off or luggage after the trip has started/);
    expect(guard).not.toMatch(/only the rider can cancel their booking/);
    expect(guard).not.toMatch(/cannot reassign a booking/);
    expect(guard).not.toMatch(/only the rider can edit their booking/);
    expect(guard).toMatch(/private\.carpool_enforce_max_detour/);
    expect(guard).toMatch(/new\.detour_km := old\.detour_km/);
    expect(c24LowsSql).toMatch(
      /revoke execute on function public\.carpool_bookings_guard\(\) from public, anon, authenticated;/,
    );
  });
});

describe('carpool C2.5 drop admin geo + nearby search + LOWs', () => {
  const runner = readFileSync(join(root, 'tests/run-carpool-rls.sh'), 'utf8');

  it('is a new file after C2.4 and does not edit earlier carpool SQL', () => {
    expect(sql).not.toMatch(/carpool_c25_drop_admin_geo/);
    expect(stopsSql).not.toMatch(/carpool_search_distances/);
    expect(taxiTrunkSql).not.toMatch(/p_pickup_lat/);
    expect(c24LowsSql).not.toMatch(/carpool_c25_drop_admin_geo/);
    expect(c25Sql).toMatch(/alter column origin_province_code drop not null/);
    expect(c25Sql).not.toMatch(/^\s*begin\s*;/im);
    expect(c25Sql).not.toMatch(/^\s*commit\s*;/im);
    expect(c25Sql).not.toMatch(/add table public\.carpool_/);
    expect(runner).toMatch(/20261118150000_carpool_c25_drop_admin_geo_reqs\.sql/);
    expect(runner.indexOf('20261118140000_carpool_c24_lows.sql')).toBeLessThan(
      runner.indexOf('20261118150000_carpool_c25_drop_admin_geo_reqs.sql'),
    );
    expect(runner).toMatch(/PGHOST="\$\{PGHOST:-localhost\}"/);
    expect(runner).toMatch(/PGPORT="\$\{PGPORT:-5432\}"/);
    expect(runner).toMatch(/psql -h "\$PGHOST" -p "\$PGPORT"/);
  });

  it('drops pairing CHECKs, keeps format CHECKs, never drops geo columns', () => {
    expect(c25Sql).toMatch(/drop constraint if exists carpool_trips_origin_district_matches_province/);
    expect(c25Sql).toMatch(/drop constraint if exists carpool_trips_dest_district_matches_province/);
    expect(c25Sql).not.toMatch(/drop column.*origin_province_code/);
    expect(c25Sql).not.toMatch(/drop constraint if exists carpool_trips_origin_province_code/);
    expect(taxiTrunkSql).toMatch(/origin_province_code ~ '\^\[0-9\]\{2\}\$'/);
    expect(taxiTrunkSql).toMatch(/origin_district_code ~ '\^\[0-9\]\{4\}\$'/);
  });

  it('redefines discover with ignored geo params, nearby points, extra_km, no owner_id', () => {
    expect(c25Sql).toMatch(/drop function if exists public\.carpool_discover_trips/);
    expect(c25Sql).toMatch(/p_pickup_lat double precision default null/);
    expect(c25Sql).toMatch(/p_radius_km numeric default null/);
    expect(c25Sql).toMatch(/pickup_distance_km numeric/);
    expect(c25Sql).toMatch(/extra_km numeric/);
    expect(c25Sql).toMatch(/order by m\.extra_km nulls last, t\.depart_at/);
    expect(c25Sql).toMatch(/\(t\.owner_id = uid\) as is_mine/);
    expect(c25Sql).not.toMatch(/t\.owner_id as/);
    expect(c25Sql).toMatch(
      /grant execute on function public\.carpool_discover_trips\(\s*public\.carpool_trip_kind, text, text, text, text,\s*double precision, double precision, double precision, double precision, numeric\s*\) to authenticated, service_role;/,
    );
    expect(c25Sql).toMatch(/set search_path = ''/);
    expect(c25Sql).toMatch(/private\.carpool_route_vertices/);
    expect(c25Sql).toMatch(/private\.carpool_detour_floor_km/);
    expect(c25Sql).toMatch(/carpool_round_km_half/);
    expect(c25Sql).toMatch(/TODO: add a spatial index/);
    expect(c25Sql).toMatch(/พิกัดไม่ถูกต้อง/);
  });

  it('skips cap-lowering on cancelled/completed and locks the trip FOR UPDATE', () => {
    const tripsGuard =
      c25Sql.match(/create or replace function public\.carpool_trips_guard[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    expect(tripsGuard).toMatch(/old\.status not in \('cancelled', 'completed'\)/);
    expect(tripsGuard).toMatch(/private\.carpool_detour_floor_km/);
    expect(tripsGuard).toMatch(/ลดระยะออกนอกเส้นทางสูงสุดไม่ได้/);
    expect(tripsGuard).toMatch(/set search_path = ''/);
    const book =
      c25Sql.match(/create or replace function public\.carpool_book_seat[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    expect(book).toMatch(/from public\.carpool_trips t/);
    expect(book).toMatch(/for update/);
    expect((book.match(/for update/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const bookingsGuard =
      c25Sql.match(/create or replace function public\.carpool_bookings_guard[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    expect(bookingsGuard).toMatch(/for update/);
    expect(bookingsGuard).toMatch(/private\.carpool_enforce_max_detour/);
    expect(c25Sql).toMatch(
      /revoke execute on function public\.carpool_trips_guard\(\) from public, anon, authenticated;/,
    );
    expect(c25Sql).toMatch(
      /revoke execute on function public\.carpool_bookings_guard\(\) from public, anon, authenticated;/,
    );
  });

  it('locks trip then seat then booking on cancel, claim, set_seat_open, refresh, dest', () => {
    const cancel =
      c25Sql.match(/create or replace function public\.carpool_cancel_booking[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    const claim =
      c25Sql.match(/create or replace function public\.carpool_claim_owner_seat[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    const setOpen =
      c25Sql.match(/create or replace function public\.carpool_set_seat_open[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    const refresh =
      c25Sql.match(/create or replace function private\.carpool_refresh_status[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    const dest =
      c25Sql.match(/create or replace function private\.carpool_apply_booking_dest[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    const book =
      c25Sql.match(/create or replace function public\.carpool_book_seat[\s\S]*?end;\n\$\$;/)?.[0] ?? '';
    expect(cancel).toMatch(/from public\.carpool_trips t/);
    expect(cancel).toMatch(/for update/);
    expect(cancel.indexOf('from public.carpool_trips t')).toBeLessThan(
      cancel.indexOf('from public.carpool_seats s'),
    );
    expect(cancel.indexOf('from public.carpool_seats s')).toBeLessThan(
      cancel.indexOf('from public.carpool_bookings b where b.id'),
    );
    expect(claim).toMatch(/from public\.carpool_trips t/);
    expect(claim.indexOf('from public.carpool_trips t')).toBeLessThan(
      claim.indexOf('from public.carpool_seats s'),
    );
    expect(setOpen).toMatch(/from public\.carpool_trips t/);
    expect(setOpen.indexOf('from public.carpool_trips t')).toBeLessThan(
      setOpen.indexOf('update public.carpool_seats s'),
    );
    expect(refresh).toMatch(/for update/);
    expect(dest).toMatch(/from public\.carpool_trips t/);
    expect(dest.indexOf('from public.carpool_trips t')).toBeLessThan(
      dest.indexOf('from public.carpool_bookings b'),
    );
    expect(book.indexOf('from public.carpool_trips t')).toBeLessThan(
      book.indexOf('from public.carpool_seats s'),
    );
    expect(book.indexOf('from public.carpool_seats s')).toBeLessThan(
      book.indexOf('insert into public.carpool_bookings'),
    );
    expect(c25Sql).toMatch(/seats_guard only READs trip\.owner_id/);
  });

  it('adds carpool_set_booking_dest and revokes dest_* UPDATE', () => {
    expect(c25Sql).toMatch(/create or replace function private\.carpool_apply_booking_dest/);
    expect(c25Sql).toMatch(/create or replace function public\.carpool_set_booking_dest/);
    expect(c25Sql).toMatch(/revoke update on table public\.carpool_bookings from public, anon, authenticated;/);
    expect(c25Sql).toMatch(
      /revoke update \(\s*dest_label, dest_lat, dest_lng,\s*luggage_h_cm, luggage_w_cm, luggage_d_cm, updated_at\s*\)/,
    );
    expect(c25Sql).not.toMatch(/grant update \(\s*luggage_h_cm/);
    expect(c25Sql).toMatch(
      /grant execute on function public\.carpool_set_booking_dest\(\s*uuid, text, double precision, double precision\s*\) to authenticated, service_role;/,
    );
    expect(c25Sql).toMatch(
      /revoke all on function private\.carpool_apply_booking_dest\(\s*uuid, uuid, text, double precision, double precision\s*\) from public, anon, authenticated;/,
    );
    expect(sql).toMatch(/create policy "carpool_bookings_select"/);
    expect(sql).toMatch(/rider_id = \(select auth\.uid\(\)\)/);
    expect(c25Sql).not.toMatch(/drop policy.*carpool_bookings_select/);
    expect(c25Sql).not.toMatch(/create policy "carpool_bookings_select"/);
    expect(stopsSql).toMatch(/Driver waypoints/);
    expect(testSql).toMatch(/rider A reads own dest, not rider B/);
    expect(testSql).toMatch(/stranger reads no booking dest/);
    expect(testSql).toMatch(/discover distances snap to 0.5 km/);
    expect(testSql).toMatch(/probe grid cannot beat 0.5 km rounding/);
    expect(testSql).toMatch(/discover rejects NaN\/out-of-range lat lng in Thai/);
    expect(testSql).toMatch(/discover excludes taxi when floor exceeds max_detour_km/);
    expect(testSql).toMatch(/book vs cancel same seat 15x no 40P01/);
    expect(testSql).toMatch(/dest vs cancel same booking 15x no 40P01/);
    expect(testSql).toMatch(/direct UPDATE dest_\* is permission denied/);
    expect(testSql).toMatch(/direct UPDATE on carpool_bookings by authenticated is 42501/);
    expect(testSql).toMatch(/coarse province allowlist canonical Thai/);
    expect(testSql).toMatch(/tests\.dblink_conn\(\)/);
    expect(testSql).toMatch(/dblink conn includes host and port/);
    expect(testSql).toMatch(/non-owner payloads never leak house\/soi\/digits/);
    expect(testSql).toMatch(/offset bearing kept when true point moves under 200 m/);
    expect(testSql).toMatch(/offset bearing regenerates when true point moves over 200 m/);
  });

  it('stores a per-trip privacy offset in private schema and masks non-owner geo', () => {
    expect(c25Sql).toMatch(/add column if not exists hide_dest boolean not null default false/);
    expect(c25Sql).toMatch(/create table if not exists private\.carpool_trip_offset/);
    expect(c25Sql).toMatch(/revoke all on table private\.carpool_trip_offset/);
    expect(c25Sql).toMatch(/alter table private\.carpool_trip_offset enable row level security/);
    expect(c25Sql).toMatch(/private\.carpool_visible_geo/);
    expect(c25Sql).toMatch(/interval '30 minutes'/);
    expect(c25Sql).toMatch(/ซ่อนตำแหน่งปลายทางจริง/);
    expect(c25Sql).toMatch(/revoke select on table public\.carpool_trips from authenticated;/);
    expect(c25Sql).toMatch(/grant select \(\s*id, owner_id, kind, vehicle_type, car_icon,/);
    expect(c25Sql).not.toMatch(/grant select \([^)]*pickup_lat/);
    expect(c25Sql).toMatch(/create or replace function public\.carpool_visible_trips\(\)/);
    expect(c25Sql).toMatch(/grant execute on function public\.carpool_visible_trips\(\) to authenticated, service_role;/);
    expect(c25Sql).toMatch(/carpool-web never sets in_progress/);
    expect(c25Sql).toMatch(/moves more than ~200 m/);
    expect(c25Sql).toMatch(/drop function if exists private\.carpool_coarse_area_part/);
    expect(c25Sql).toMatch(/create or replace function private\.carpool_text_has_number/);
    expect(c25Sql).toMatch(/create or replace function private\.carpool_province_pairs/);
    expect(c25Sql).toMatch(/create or replace function private\.carpool_lookup_province/);
    expect(c25Sql).toMatch(/create or replace function private\.carpool_coarse_label/);
    expect(c25Sql).toMatch(/private\.carpool_text_has_number\(last_part\)/);
    expect(c25Sql).toMatch(/canonical allowlisted name, never input text/);
    expect(testSql).toMatch(/province allowlist 77 canonical/);
    expect(testSql).toMatch(/soi\/street last part falls back/);
    expect(testSql).toMatch(/google addresses yield canonical Thai province/);
    expect(testSql).toMatch(/stranger preview pickup must be ~1 km from true/);
    expect(testSql).toMatch(/authenticated cannot SELECT true pickup_lat/);
    expect(testSql).toMatch(/dest offset only when hide_dest is on/);
    expect(testSql).toMatch(/booked rider before reveal gets offset pickup/);
    expect(testSql).toMatch(/booked rider after reveal gets true pickup/);
    expect(testSql).toMatch(/probe discover cannot recover true point better than offset/);
  });
});
