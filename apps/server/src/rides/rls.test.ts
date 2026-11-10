import { describe, expect, it } from '@jest/globals';
import type { Ride } from '@drop/types';
import { canSelectRide, canSelectRidePin, canWriteDriverLocation, presentRidePin } from './rls';

const ride = (over: Partial<Ride> = {}): Ride => ({
  id: 'r1',
  rider_id: 'rider-1',
  driver_id: null,
  status: 'requested',
  vehicle_type: 'car',
  pickup_lat: 13.74,
  pickup_lng: 100.53,
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

  it('lets drivers see requested rides plus rides assigned to them', () => {
    const open = ride();
    const taken = ride({ status: 'accepted', driver_id: 'driver-1' });
    expect(canSelectRide({ id: 'driver-1', role: 'driver' }, open)).toBe(true);
    expect(canSelectRide({ id: 'driver-2', role: 'driver' }, taken)).toBe(false);
    expect(canSelectRide({ id: 'driver-1', role: 'driver' }, taken)).toBe(true);
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
