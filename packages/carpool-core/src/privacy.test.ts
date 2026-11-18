import { describe, expect, it } from '@jest/globals';
import {
  PRIVACY_OFFSET_KM_MAX,
  PRIVACY_OFFSET_KM_MIN,
  coarseAddress,
  offsetKmFromTrue,
  offsetPoint,
  shouldRevealPickup,
  stableOffset,
} from './privacy';

const home = { lat: 13.75634, lng: 100.50187 };

describe('privacy offset', () => {
  it('lands 0.9–1.1 km from the true point', () => {
    for (let i = 0; i < 8; i++) {
      const shown = offsetPoint(home, (i * Math.PI) / 4, 1);
      const km = offsetKmFromTrue(home, shown);
      expect(km).toBeGreaterThanOrEqual(PRIVACY_OFFSET_KM_MIN);
      expect(km).toBeLessThanOrEqual(PRIVACY_OFFSET_KM_MAX);
    }
  });

  it('is stable for a seed and differs from the true point', () => {
    const a = stableOffset('trip-a');
    const b = stableOffset('trip-a');
    expect(a.bearingRad).toBe(b.bearingRad);
    const shown = offsetPoint(home, a.bearingRad, a.km);
    expect(shown.lat).not.toBe(home.lat);
  });
});

describe('coarseAddress', () => {
  it('keeps the last two comma parts and drops the house line', () => {
    expect(coarseAddress('123 ซอยสุขุมวิท, คลองเตย, กรุงเทพมหานคร 10110')).toBe(
      'คลองเตย, กรุงเทพมหานคร 10110',
    );
    expect(coarseAddress('บ้านเลขที่ 9 แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร')).toBe(
      'แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร',
    );
    expect(coarseAddress('')).toBe('พื้นที่ใกล้เคียง');
    expect(coarseAddress('จุดนัด')).toBe('พื้นที่ใกล้เคียง');
  });
});

describe('shouldRevealPickup', () => {
  const depart = new Date('2026-11-18T12:00:00Z');

  it('is true for the owner, false for a stranger', () => {
    expect(
      shouldRevealPickup({
        isOwner: true,
        isBookedRider: false,
        status: 'open',
        departAt: depart,
        now: new Date('2026-11-18T00:00:00Z'),
      }),
    ).toBe(true);
    expect(
      shouldRevealPickup({
        isOwner: false,
        isBookedRider: false,
        status: 'open',
        departAt: depart,
        now: new Date('2026-11-18T11:50:00Z'),
      }),
    ).toBe(false);
  });

  it('reveals to a booked rider within 30 minutes or once in_progress', () => {
    expect(
      shouldRevealPickup({
        isOwner: false,
        isBookedRider: true,
        status: 'open',
        departAt: depart,
        now: new Date('2026-11-18T11:20:00Z'),
      }),
    ).toBe(false);
    expect(
      shouldRevealPickup({
        isOwner: false,
        isBookedRider: true,
        status: 'open',
        departAt: depart,
        now: new Date('2026-11-18T11:31:00Z'),
      }),
    ).toBe(true);
    expect(
      shouldRevealPickup({
        isOwner: false,
        isBookedRider: true,
        status: 'in_progress',
        departAt: depart,
        now: new Date('2026-11-18T00:00:00Z'),
      }),
    ).toBe(true);
  });
});
