import { describe, expect, it } from '@jest/globals';
import {
  BANGKOK_CENTER,
  BANGKOK_PROVINCE_CODE,
  THAI_PROVINCES,
  provinceByCode,
} from './thaiAdmin';

describe('THAI_PROVINCES', () => {
  it('has exactly 77 unique codes and names', () => {
    expect(THAI_PROVINCES).toHaveLength(77);
    expect(new Set(THAI_PROVINCES.map((p) => p.code)).size).toBe(77);
    expect(new Set(THAI_PROVINCES.map((p) => p.nameTh)).size).toBe(77);
  });

  it('puts กรุงเทพมหานคร first, then Thai alphabetical order', () => {
    expect(THAI_PROVINCES[0]?.code).toBe(BANGKOK_PROVINCE_CODE);
    expect(THAI_PROVINCES[0]?.nameTh).toBe('กรุงเทพมหานคร');
    const rest = THAI_PROVINCES.slice(1).map((p) => p.nameTh);
    const sorted = [...rest].sort((a, b) => a.localeCompare(b, 'th'));
    expect(rest).toEqual(sorted);
  });

  it('uses Bell’s Bangkok city-center pin', () => {
    expect(BANGKOK_CENTER).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(provinceByCode('10')).toMatchObject(BANGKOK_CENTER);
    for (const p of THAI_PROVINCES) {
      expect(p.lat).toBeGreaterThan(5);
      expect(p.lat).toBeLessThan(21);
      expect(p.lng).toBeGreaterThan(97);
      expect(p.lng).toBeLessThan(106);
    }
  });
});
