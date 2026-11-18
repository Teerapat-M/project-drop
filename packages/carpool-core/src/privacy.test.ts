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
  textHasNumber,
} from './privacy';
import { THAI_PROVINCE_ALIASES, lookupCanonicalProvince } from './thaiProvinces';

const home = { lat: 13.75634, lng: 100.50187 };
const nearby = 'พื้นที่ใกล้เคียง';
const bkk = 'กรุงเทพมหานคร';

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
  it('lists 77 canonical provinces', () => {
    expect(THAI_PROVINCE_ALIASES).toHaveLength(77);
    expect(new Set(THAI_PROVINCE_ALIASES.map(([c]) => c)).size).toBe(77);
  });

  it('returns the canonical Thai province for the last allowlisted part', () => {
    expect(coarseAddress('บ้านเลขที่ 99 ซอยลาดพร้าว 15, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('๙๙, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('９９, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('ซ.ลาดพร้าว, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('ซ.๑๕, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('ถ.สุขุมวิท, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('Main St, Bangkok')).toBe(bkk);
    expect(coarseAddress('ซ\u200Bอยลาดพร้าว, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('คอนโด ABC, กรุงเทพฯ')).toBe(bkk);
    expect(coarseAddress('12 หมู่ 4 ถนนพหลโยธิน, เชียงใหม่')).toBe('เชียงใหม่');
    expect(coarseAddress('บ้าน, กรุงเทพฯ 10900')).toBe(bkk);
    expect(coarseAddress('123 ซอยสุขุมวิท, คลองเตย, กรุงเทพมหานคร 10110')).toBe(bkk);
  });

  it('never leaks a street/soi/condo last part', () => {
    const leaks = [
      'กรุงเทพฯ, ซ.ลาดพร้าว',
      'Bangkok, Main St',
      'กรุงเทพฯ, Soi ⑤',
      'กรุงเทพฯ, Soi ²',
      'กรุงเทพฯ, Ⅻ',
      'สุขุมวิท, คอนโด ABC',
    ];
    for (const addr of leaks) {
      const shown = coarseAddress(addr);
      expect(shown).toBe(nearby);
      expect(shown).not.toMatch(/ซ\.|ลาดพร้าว|Main St|Soi|คอนโด|Ⅻ|⑤|²/i);
    }
  });

  it('maps realistic Google addresses with postcode and country', () => {
    expect(coarseAddress('Sukhumvit Road, Khlong Toei, Bangkok 10110, Thailand')).toBe(bkk);
    expect(coarseAddress('ถนนสุเทพ, เชียงใหม่ 50200, ประเทศไทย')).toBe('เชียงใหม่');
    expect(coarseAddress('Beach Rd, Pattaya, Chon Buri 20150, Thailand')).toBe('ชลบุรี');
    expect(coarseAddress('Mueang, Nonthaburi 11000, Thailand')).toBe('นนทบุรี');
    expect(coarseAddress('Bang Phli, Samut Prakarn 10540, Thailand')).toBe('สมุทรปราการ');
    expect(coarseAddress('Pratu Chai, Phra Nakhon Si Ayutthaya 13000, Thailand')).toBe(
      'พระนครศรีอยุธยา',
    );
    expect(coarseAddress('Hat Yai, Songkhla 90110, Thailand')).toBe('สงขลา');
    expect(coarseAddress('ซอย 1, จ.เชียงใหม่')).toBe('เชียงใหม่');
    expect(coarseAddress('Soi 1, Chiang Mai Province')).toBe('เชียงใหม่');
  });

  it('falls back for single-part labels and non-province last parts', () => {
    expect(coarseAddress('')).toBe(nearby);
    expect(coarseAddress('จุดนัด')).toBe(nearby);
    expect(coarseAddress('99/1 ซอยลาดพร้าว')).toBe(nearby);
    expect(coarseAddress('บ้านเลขที่ 9 แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร')).toBe(nearby);
    expect(coarseAddress('กรุงเทพมหานคร')).toBe(nearby);
    expect(coarseAddress('Bangkok')).toBe(nearby);
  });

  it('treats circled, superscript, and roman numbers as digits', () => {
    expect(textHasNumber('Soi ⑤')).toBe(true);
    expect(textHasNumber('Soi ²')).toBe(true);
    expect(textHasNumber('Ⅻ')).toBe(true);
    expect(textHasNumber('๙')).toBe(true);
    expect(lookupCanonicalProvince('Bangkok')).toBe(bkk);
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
