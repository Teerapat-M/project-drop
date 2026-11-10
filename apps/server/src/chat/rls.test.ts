import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canInsertMessage, canSelectMessage, type Ride } from '@drop/types';

const ride = (over: Partial<Ride> = {}): Ride => ({
  id: 'r1',
  rider_id: 'rider-1',
  driver_id: 'driver-1',
  status: 'accepted',
  vehicle_type: 'car',
  pickup_lat: 13.7,
  pickup_lng: 100.5,
  pickup_label: 'Siam',
  dropoff_lat: 13.8,
  dropoff_lng: 100.55,
  dropoff_label: 'Chatuchak',
  route_distance_m: null,
  route_duration_s: null,
  route_polyline: null,
  fare_estimate: null,
  pin_required: false,
  created_at: 't',
  updated_at: 't',
  accepted_at: 't',
  started_at: null,
  cancelled_at: null,
  completed_at: null,
  ...over,
});

describe('chat RLS mirrors', () => {
  const r = ride();
  it('lets the rider and assigned driver read and insert', () => {
    expect(canSelectMessage({ id: 'rider-1', role: 'rider' }, r)).toBe(true);
    expect(canSelectMessage({ id: 'driver-1', role: 'driver' }, r)).toBe(true);
    expect(canInsertMessage({ id: 'rider-1', role: 'rider' }, r, 'rider-1')).toBe(true);
    expect(canInsertMessage({ id: 'driver-1', role: 'driver' }, r, 'driver-1')).toBe(true);
  });

  it('blocks a non-participant driver/rider from read and insert', () => {
    expect(canSelectMessage({ id: 'driver-2', role: 'driver' }, r)).toBe(false);
    expect(canSelectMessage({ id: 'rider-2', role: 'rider' }, r)).toBe(false);
    expect(canInsertMessage({ id: 'driver-2', role: 'driver' }, r, 'driver-2')).toBe(false);
    expect(canInsertMessage({ id: 'rider-2', role: 'rider' }, r, 'rider-2')).toBe(false);
  });

  it('lets admin read but not insert', () => {
    expect(canSelectMessage({ id: 'admin-1', role: 'admin' }, r)).toBe(true);
    expect(canInsertMessage({ id: 'admin-1', role: 'admin' }, r, 'admin-1')).toBe(false);
  });

  it('blocks inserts after completed or cancelled', () => {
    expect(canInsertMessage({ id: 'rider-1', role: 'rider' }, ride({ status: 'completed' }), 'rider-1')).toBe(
      false,
    );
    expect(canInsertMessage({ id: 'driver-1', role: 'driver' }, ride({ status: 'cancelled' }), 'driver-1')).toBe(
      false,
    );
    expect(canSelectMessage({ id: 'rider-1', role: 'rider' }, ride({ status: 'completed' }))).toBe(true);
  });

  it('nobody can impersonate a sender', () => {
    expect(canInsertMessage({ id: 'rider-1', role: 'rider' }, r, 'driver-1')).toBe(false);
    expect(canInsertMessage({ id: 'driver-1', role: 'driver' }, r, 'rider-1')).toBe(false);
    expect(canInsertMessage({ id: 'admin-1', role: 'admin' }, r, 'rider-1')).toBe(false);
  });
});

describe('trip_chat migration security text', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20261111090000_trip_chat.sql'),
    'utf8',
  );
  const ridesSql = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20261110180000_rides.sql'),
    'utf8',
  );

  it('publishes messages only and never ride_pins', () => {
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.messages/);
    expect(sql).toMatch(/drop table public\.ride_pins/);
    expect(sql).not.toMatch(/add table public\.ride_pins/i);
    expect(ridesSql).not.toMatch(/add table public\.ride_pins/i);
  });

  it('does not grant translated columns to authenticated', () => {
    expect(sql).toMatch(
      /grant insert \(ride_id, sender_id, original_text, is_preset, preset_key\)/,
    );
    expect(sql).toMatch(/new\.translated_text := null/);
    expect(sql).toMatch(/sender_id = \(select auth\.uid\(\)\)/);
  });

  it('leaves accept_ride as the only accept path', () => {
    expect(sql).not.toMatch(/create or replace function public\.accept_ride/);
    expect(ridesSql).toMatch(/create or replace function public\.accept_ride/);
  });

  it('revokes execute on messages_guard without touching RPC grants', () => {
    const revoke = readFileSync(
      join(__dirname, '../../../../supabase/migrations/20261111120000_revoke_trigger_fn_execute.sql'),
      'utf8',
    );
    expect(revoke).toMatch(
      /revoke execute on function public\.messages_guard\(\) from public, anon, authenticated;/,
    );
    expect(revoke).toMatch(
      /revoke execute on function public\.rides_guard\(\) from public, anon, authenticated;/,
    );
    expect(revoke).not.toMatch(
      /(?:revoke|grant) execute on function public\.(?:accept_ride|nearby_requested_rides|verify_trip_pin|ride_peer)/,
    );
    expect(sql).not.toMatch(/revoke execute on function public\.messages_guard\(\)/);
  });
});
