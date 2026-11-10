import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NEARBY_DISTANCE_BUCKET_M,
  NEARBY_RIDES_MAX_RADIUS_M,
  type Ride,
} from '@drop/types';
import {
  bucketNearbyDistanceM,
  canAcceptRide,
  canRiderMutate,
  canSelectRide,
  canSelectRidePin,
  canVerifyTripPin,
  canWriteDriverLocation,
  clampNearbyRadiusM,
  haversineMeters,
  nearbyDistanceM,
  presentRidePin,
  roundPickup,
  toNearbyRide,
} from './rls';

const ride = (over: Partial<Ride> = {}): Ride => ({
  id: 'r1',
  rider_id: 'rider-1',
  driver_id: null,
  status: 'requested',
  vehicle_type: 'car',
  pickup_lat: 13.7466,
  pickup_lng: 100.5347,
  pickup_label: 'Siam',
  dropoff_lat: 13.8,
  dropoff_lng: 100.55,
  dropoff_label: 'Chatuchak',
  route_distance_m: 9800,
  route_duration_s: 1440,
  route_polyline: null,
  fare_estimate: null,
  pin_required: false,
  created_at: 't',
  updated_at: 't',
  accepted_at: null,
  started_at: null,
  cancelled_at: null,
  completed_at: null,
  ...over,
});

describe('ride RLS helpers', () => {
  it('lets the rider see their ride and PIN, not another rider', () => {
    const r = ride({ pin_required: true });
    expect(canSelectRide({ id: 'rider-1', role: 'rider' }, r)).toBe(true);
    expect(canSelectRide({ id: 'rider-2', role: 'rider' }, r)).toBe(false);
    expect(canSelectRidePin({ id: 'rider-1', role: 'rider' }, r)).toBe(true);
    expect(canSelectRidePin({ id: 'driver-1', role: 'driver' }, r)).toBe(false);
  });

  it('does not let drivers SELECT requested rides (queue is nearby_requested_rides)', () => {
    const open = ride();
    const taken = ride({ status: 'accepted', driver_id: 'driver-1' });
    expect(canSelectRide({ id: 'driver-1', role: 'driver' }, open)).toBe(false);
    expect(canSelectRide({ id: 'driver-2', role: 'driver' }, taken)).toBe(false);
    expect(canSelectRide({ id: 'driver-1', role: 'driver' }, taken)).toBe(true);
  });

  it('blocks the rider self-accept attack (status=accepted + driver_id=self)', () => {
    const open = ride();
    const rider = { id: 'rider-1', role: 'rider' as const };
    expect(canAcceptRide(rider, open)).toBe(false);
    expect(canRiderMutate(rider, open, { status: 'accepted', driver_id: 'rider-1' })).toBe(false);
    expect(canRiderMutate(rider, open, { driver_id: 'driver-1' })).toBe(false);
    expect(canRiderMutate(rider, open, { status: 'accepted' })).toBe(false);
    expect(canRiderMutate(rider, open, { status: 'cancelled' })).toBe(true);
    expect(canRiderMutate(rider, open, { status: 'requested' })).toBe(true);
  });

  it('accept_ride requires driver role, not the rider, requested + empty driver_id', () => {
    const open = ride();
    expect(canAcceptRide({ id: 'driver-1', role: 'driver' }, open)).toBe(true);
    expect(canAcceptRide({ id: 'rider-1', role: 'driver' }, open)).toBe(false);
    expect(canAcceptRide({ id: 'driver-1', role: 'rider' }, open)).toBe(false);
    expect(
      canAcceptRide({ id: 'driver-1', role: 'driver' }, ride({ status: 'accepted', driver_id: 'driver-2' })),
    ).toBe(false);
  });

  it('verify_trip_pin / start require assigned driver, role=driver, driver_id <> rider_id', () => {
    const assigned = ride({ status: 'accepted', driver_id: 'driver-1', pin_required: true });
    const forged = ride({ status: 'accepted', driver_id: 'rider-1', pin_required: true });
    expect(canVerifyTripPin({ id: 'driver-1', role: 'driver' }, assigned)).toBe(true);
    expect(canVerifyTripPin({ id: 'rider-1', role: 'rider' }, assigned)).toBe(false);
    expect(canVerifyTripPin({ id: 'rider-1', role: 'rider' }, forged)).toBe(false);
    expect(canVerifyTripPin({ id: 'rider-1', role: 'driver' }, forged)).toBe(false);
    expect(canVerifyTripPin({ id: 'driver-2', role: 'driver' }, assigned)).toBe(false);
  });

  it('sanitizes the driver queue: no rider_id/dropoff, pickup rounded to 3 decimals', () => {
    const origin = { lat: 13.75, lng: 100.54 };
    const r = ride();
    const nearby = toNearbyRide(r, origin);
    expect(nearby).toEqual({
      id: 'r1',
      vehicle_type: 'car',
      pickup_lat: roundPickup(13.7466),
      pickup_lng: roundPickup(100.5347),
      route_distance_m: 9800,
      route_duration_s: 1440,
      distance_m: nearbyDistanceM(origin, { lat: r.pickup_lat, lng: r.pickup_lng }),
    });
    expect(nearby.pickup_lat).toBe(13.747);
    expect(nearby).not.toHaveProperty('rider_id');
    expect(nearby).not.toHaveProperty('dropoff_lat');
    expect(nearby).not.toHaveProperty('dropoff_label');
    expect(nearby).not.toHaveProperty('pickup_label');
  });

  it('clamps nearby radius to 10 km', () => {
    expect(NEARBY_RIDES_MAX_RADIUS_M).toBe(10_000);
    expect(clampNearbyRadiusM(50_000)).toBe(NEARBY_RIDES_MAX_RADIUS_M);
    expect(clampNearbyRadiusM(10_000)).toBe(10_000);
    expect(clampNearbyRadiusM(5_000)).toBe(5_000);
    expect(clampNearbyRadiusM(undefined)).toBe(5_000);
    expect(clampNearbyRadiusM(-1)).toBe(0);
  });

  it('buckets distance_m up to 250 m', () => {
    expect(NEARBY_DISTANCE_BUCKET_M).toBe(250);
    expect(bucketNearbyDistanceM(0)).toBe(0);
    expect(bucketNearbyDistanceM(1)).toBe(250);
    expect(bucketNearbyDistanceM(250)).toBe(250);
    expect(bucketNearbyDistanceM(251)).toBe(500);
    expect(bucketNearbyDistanceM(1234.6)).toBe(1250);
  });

  it('computes nearby distance from rounded pickup coords, not the exact ones', () => {
    const exact = { lat: 13.7466, lng: 100.5347 };
    const rounded = { lat: roundPickup(exact.lat), lng: roundPickup(exact.lng) };
    expect(rounded).toEqual({ lat: 13.747, lng: 100.535 });
    // Standing on the true pickup: exact haversine is 0, rounded-cell distance is not.
    expect(haversineMeters(exact, exact)).toBe(0);
    expect(haversineMeters(exact, rounded)).toBeGreaterThan(40);
    expect(nearbyDistanceM(exact, exact)).toBe(NEARBY_DISTANCE_BUCKET_M);
    expect(nearbyDistanceM(rounded, exact)).toBe(0);
    const origin = { lat: 13.75, lng: 100.54 };
    const fromRounded = haversineMeters(origin, rounded);
    const fromExact = haversineMeters(origin, exact);
    expect(fromRounded).not.toBe(fromExact);
    expect(nearbyDistanceM(origin, exact)).toBe(bucketNearbyDistanceM(fromRounded));
    expect(nearbyDistanceM(origin, exact)).not.toBe(Math.round(fromExact));
  });

  it('never puts the PIN on a driver-facing payload', () => {
    const r = ride({ driver_id: 'driver-1', status: 'accepted', pin_required: true });
    expect(presentRidePin({ id: 'driver-1', role: 'driver' }, r, '4821')).toBeUndefined();
    expect(presentRidePin({ id: 'rider-1', role: 'rider' }, r, '4821')).toBe('4821');
    expect(presentRidePin({ id: 'admin-1', role: 'admin' }, r, '4821')).toBe('4821');
  });

  it('lets a driver write only their own location row', () => {
    expect(canWriteDriverLocation({ id: 'd1', role: 'driver' }, 'd1')).toBe(true);
    expect(canWriteDriverLocation({ id: 'd1', role: 'driver' }, 'd2')).toBe(false);
    expect(canWriteDriverLocation({ id: 'r1', role: 'rider' }, 'r1')).toBe(false);
  });

  it('lets admin see everything', () => {
    expect(canSelectRide({ id: 'a', role: 'admin' }, ride())).toBe(true);
  });
});

describe('rides migration security text', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20261110180000_rides.sql'),
    'utf8',
  );
  const hardening = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20261110200000_nearby_rides_hardening.sql'),
    'utf8',
  );

  it('does not publish ride_pins or any PIN column', () => {
    expect(sql).not.toMatch(/add table public\.ride_pins/i);
    expect(sql).toMatch(/drop table public\.ride_pins/);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.rides/);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.driver_locations/);
    const ridesCols = sql.match(/create table public\.rides \(([\s\S]*?)\n\);/)?.[1] ?? '';
    expect(ridesCols).toMatch(/pin_required boolean/);
    expect(ridesCols).not.toMatch(/^\s*pin\b/m);
    expect(ridesCols).not.toMatch(/pin_hash|pin_hmac/);
  });

  it('accepts only through accept_ride and locks rider status/driver_id', () => {
    expect(sql).toMatch(/create or replace function public\.accept_ride/);
    expect(sql).toMatch(/rider cannot change driver_id/);
    expect(sql).toMatch(/rider can only cancel/);
    expect(sql).toMatch(/driver_id is distinct from uid/);
    expect(sql).toMatch(/create or replace function public\.nearby_requested_rides/);
  });

  it('revokes execute on rides_guard without touching RPC grants', () => {
    const revoke = readFileSync(
      join(__dirname, '../../../../supabase/migrations/20261111120000_revoke_trigger_fn_execute.sql'),
      'utf8',
    );
    expect(revoke).toMatch(
      /revoke execute on function public\.rides_guard\(\) from public, anon, authenticated;/,
    );
    expect(revoke).toMatch(
      /revoke execute on function public\.messages_guard\(\) from public, anon, authenticated;/,
    );
    expect(revoke).not.toMatch(
      /(?:revoke|grant) execute on function public\.(?:accept_ride|nearby_requested_rides|verify_trip_pin|ride_peer)/,
    );
    expect(sql).not.toMatch(/revoke execute on function public\.rides_guard\(\)/);
  });

  it('hardens nearby_requested_rides without editing the live rides migration', () => {
    expect(sql).not.toMatch(/max_radius_m constant double precision := 10000/);
    expect(hardening).toMatch(/create or replace function public\.nearby_requested_rides/);
    expect(hardening).toMatch(/least\(greatest\(coalesce\(p_radius_m, 5000\), 0\), max_radius_m\)/);
    expect(hardening).toMatch(/max_radius_m constant double precision := 10000/);
    expect(hardening).toMatch(/bucket_m constant double precision := 250/);
    expect(hardening).toMatch(/ceil\(q\.raw_m \/ bucket_m\)/);
    expect(hardening).toMatch(
      /private\.haversine_m\(\s*p_lat,\s*p_lng,\s*round\(r\.pickup_lat::numeric, 3\)::double precision,\s*round\(r\.pickup_lng::numeric, 3\)::double precision\s*\)/,
    );
    expect(hardening).not.toMatch(
      /private\.haversine_m\(p_lat, p_lng, r\.pickup_lat, r\.pickup_lng\)/,
    );
  });
});
