import { describe, expect, it } from 'vitest';
import { BANGKOK_PROVINCE_CODE, THAI_PROVINCES } from '@drop/carpool-core';
import { districtKindLabel, loadDistricts } from './loadDistricts';

const districtModules = import.meta.glob('./districts/*.json', { eager: true }) as Record<
  string,
  { default: Array<{ code: string; nameTh: string; lat: number; lng: number }> }
>;

describe('Thai district dataset', () => {
  const all = Object.entries(districtModules).flatMap(([path, mod]) => {
    const provinceCode = path.match(/\/(\d+)\.json$/)?.[1] ?? '';
    return (mod.default ?? []).map((d) => ({ ...d, provinceCode }));
  });

  it('has 928 districts, 50 Bangkok khet, every row maps to a province', () => {
    expect(all).toHaveLength(928);
    expect(all.filter((d) => d.provinceCode === BANGKOK_PROVINCE_CODE)).toHaveLength(50);
    const codes = new Set(THAI_PROVINCES.map((p) => p.code));
    expect(Object.keys(districtModules)).toHaveLength(77);
    for (const row of all) {
      expect(codes.has(row.provinceCode)).toBe(true);
      expect(row.code.length).toBeGreaterThanOrEqual(4);
      expect(row.lat).toBeGreaterThan(5);
      expect(row.lng).toBeGreaterThan(97);
    }
    expect(new Set(all.map((d) => d.code)).size).toBe(928);
  });

  it('uses TIS 1099 district codes whose first two digits are the province code', () => {
    expect(all.length).toBe(928);
    for (const row of all) {
      expect(row.code.slice(0, 2)).toBe(row.provinceCode);
      expect(row.code).toMatch(/^[0-9]{4}$/);
    }
  });

  it('lazy-loads one province chunk (Bangkok เขต)', async () => {
    expect(districtKindLabel('10')).toBe('เขต');
    expect(districtKindLabel('50')).toBe('อำเภอ');
    const bkk = await loadDistricts('10');
    expect(bkk).toHaveLength(50);
    const names = bkk.map((d) => d.nameTh);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'th')));
    const empty = await loadDistricts('00');
    expect(empty).toEqual([]);
  });
});
