import { describe, expect, it } from 'vitest';
import { estimateViewerFare, estimateViewerFareFromSeats } from './estimateFare';

describe('estimateViewerFare (computeFare, viewer occupies one more seat)', () => {
  it('uses satang so 10 km / 1 payer is 70.00 not 69.99', () => {
    const est = estimateViewerFare({
      mainRouteKm: 10,
      kind: 'taxi',
      bookedPassengerCount: 0,
    });
    expect(est.payerCount).toBe(1);
    expect(est.amountThb).toBe(70);
    expect(est.totalThb).toBe(70);
  });

  it('splits among seated occupants, not open seats', () => {
    const est = estimateViewerFare({
      mainRouteKm: 12,
      kind: 'taxi',
      bookedPassengerCount: 1,
    });
    // 1 already seated + viewer = 2, 84/2 = 42. Four open seats would have been 21.
    expect(est.payerCount).toBe(2);
    expect(est.amountThb).toBe(42);
  });

  it('charges detour only to the viewer (taxi A/B/C: viewer is B at 49)', () => {
    const est = estimateViewerFare({
      mainRouteKm: 12,
      kind: 'taxi',
      bookedPassengerCount: 2,
      detourKm: 1.5,
    });
    expect(est.payerCount).toBe(3);
    expect(est.amountThb).toBe(49);
    expect(est.totalThb).toBe(105);
  });

  it('counts the private-car owner-driver as a payer', () => {
    const est = estimateViewerFare({
      mainRouteKm: 12,
      kind: 'private',
      bookedPassengerCount: 0,
    });
    // owner-driver + viewer = 2, 84/2 = 42
    expect(est.payerCount).toBe(2);
    expect(est.amountThb).toBe(42);
  });

  it('matches mint 32 km private with 2 booked passengers (~56 ฿ / 4 คน)', () => {
    const est = estimateViewerFare({
      mainRouteKm: 32,
      kind: 'private',
      bookedPassengerCount: 2,
    });
    expect(est.payerCount).toBe(4);
    expect(est.amountThb).toBe(56);
  });

  it('builds booked count from open+booked seats, ignoring empty open ones', () => {
    const est = estimateViewerFareFromSeats({
      mainRouteKm: 12,
      kind: 'taxi',
      seats: [
        { id: 'a', is_open: true, is_booked: true },
        { id: 'b', is_open: true, is_booked: true },
        { id: 'c', is_open: true, is_booked: false },
        { id: 'd', is_open: false, is_booked: false },
      ],
      detourKm: 1.5,
    });
    expect(est.payerCount).toBe(3);
    expect(est.amountThb).toBe(49);
  });
});
