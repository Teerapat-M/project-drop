import { describe, expect, it } from 'vitest';
import { offsetKmFromTrue } from '@drop/carpool-core';
import type { TripCard } from '../types';
import { maskTripForViewer } from './privacyMask';

const trip: TripCard = {
  id: 't1',
  kind: 'private',
  vehicle_type: 'sedan',
  car_icon: 'sedan',
  route_km: 12,
  depart_at: '2026-12-01T08:00:00Z',
  status: 'open',
  pickup_label: 'บ้านเลขที่ 9, คลองเตย, กรุงเทพมหานคร',
  dest_label: 'อยุธยา',
  pickup_lat: 13.7563,
  pickup_lng: 100.5018,
  dest_lat: 14.35,
  dest_lng: 100.57,
  trunk_w_cm: 100,
  trunk_h_cm: 50,
  trunk_l_cm: 50,
  open_seats: 2,
  bookable_seats: 3,
  owner_display_name: 'โก้',
};

describe('maskTripForViewer', () => {
  it('leaves the owner on the true pin', () => {
    const shown = maskTripForViewer(trip, { isOwner: true, isBookedRider: false });
    expect(shown.pickup_lat).toBe(trip.pickup_lat);
    expect(shown.pickup_approx).toBe(false);
    expect(shown.pickup_label).toBe(trip.pickup_label);
  });

  it('offsets pickup ~1 km for a stranger and coarsens the label', () => {
    const shown = maskTripForViewer(trip, { isOwner: false, isBookedRider: false });
    const km = offsetKmFromTrue(
      { lat: trip.pickup_lat, lng: trip.pickup_lng },
      { lat: shown.pickup_lat, lng: shown.pickup_lng },
    );
    expect(km).toBeGreaterThanOrEqual(0.8);
    expect(km).toBeLessThanOrEqual(1.2);
    expect(shown.pickup_approx).toBe(true);
    expect(shown.pickup_label).toBe('กรุงเทพมหานคร');
    expect(shown.dest_lat).toBe(trip.dest_lat);
  });

  it('offsets dest only when hide_dest is on', () => {
    const shown = maskTripForViewer(
      { ...trip, hide_dest: true, dest_label: 'บ้านเลขที่ 99 ซอยลาดพร้าว 15, กรุงเทพฯ' },
      { isOwner: false, isBookedRider: false },
    );
    const km = offsetKmFromTrue(
      { lat: trip.dest_lat, lng: trip.dest_lng },
      { lat: shown.dest_lat, lng: shown.dest_lng },
    );
    expect(km).toBeGreaterThanOrEqual(0.8);
    expect(km).toBeLessThanOrEqual(1.2);
    expect(shown.dest_label).toBe('กรุงเทพมหานคร');
    expect(shown.dest_label).not.toMatch(/\d/);
    expect(shown.dest_label).not.toMatch(/ซอย|soi/i);
  });
});
