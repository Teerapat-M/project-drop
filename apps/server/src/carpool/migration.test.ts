import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../../../supabase');
const sql = readFileSync(join(root, 'migrations/20261118100000_carpool.sql'), 'utf8');
const stopsSql = readFileSync(join(root, 'migrations/20261118120000_carpool_trip_stops.sql'), 'utf8');
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
