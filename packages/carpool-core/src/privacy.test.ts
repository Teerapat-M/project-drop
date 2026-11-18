import { describe, expect, it } from '@jest/globals';
import {
  PRIVACY_OFFSET_KM_MAX,
  PRIVACY_OFFSET_KM_MIN,
  coarseAddress,
  offsetKmFromTrue,
  offsetPoint,
  shouldRegenOffset,
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
  const nearby = 'พื้นที่ใกล้เคียง';

  it('keeps only the last comma part when it has no digits', () => {
    expect(coarseAddress('บ้านเลขที่ 99 ซอยลาดพร้าว 15, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('๙๙, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('９９, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('ซ.ลาดพร้าว, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('ซ.๑๕, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('ถ.สุขุมวิท, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('Main St, Bangkok')).toBe('Bangkok');
    expect(coarseAddress('ซ\u200Bอยลาดพร้าว, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('คอนโด ABC, กรุงเทพฯ')).toBe('กรุงเทพฯ');
    expect(coarseAddress('12 หมู่ 4 ถนนพหลโยธิน, เชียงใหม่')).toBe('เชียงใหม่');
  });

  it('falls back when there is no comma, or the last part has digits', () => {
    expect(coarseAddress('')).toBe(nearby);
    expect(coarseAddress('จุดนัด')).toBe(nearby);
    expect(coarseAddress('99/1 ซอยลาดพร้าว')).toBe(nearby);
    expect(coarseAddress('บ้านเลขที่ 9 แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร')).toBe(nearby);
    expect(coarseAddress('123 ซอยสุขุมวิท, คลองเตย, กรุงเทพมหานคร 10110')).toBe(nearby);
    expect(coarseAddress('บ้าน, กรุงเทพฯ 10900')).toBe(nearby);
  });
});

describe('shouldRegenOffset', () => {
  it('is false under 200 m and true beyond', () => {
    expect(shouldRegenOffset(home, { lat: home.lat + 0.0005, lng: home.lng })).toBe(false);
    expect(shouldRegenOffset(home, { lat: home.lat + 0.003, lng: home.lng })).toBe(true);
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
