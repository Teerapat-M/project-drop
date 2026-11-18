import {
  MAX_DETOUR_KM_DEFAULT,
  MAX_DETOUR_KM_MAX,
  MAX_DETOUR_KM_MIN,
  clampMaxDetourKm,
  detourFloorKm,
  formatKm,
  maxDetourExceeded,
  maxDetourWarning,
  parseMaxDetourKm,
  roundKm,
} from './detour';

describe('roundKm / formatKm', () => {
  it('rounds 0.1+0.2-style float noise to 0.1 km', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundKm(0.1 + 0.2)).toBe(0.3);
    expect(roundKm(0.1000000000000001)).toBe(0.1);
    expect(formatKm(0.1 + 0.2)).toBe('0.3');
    expect(formatKm(0.1000000000000001)).toBe('0.1');
    expect(formatKm(12)).toBe('12');
    expect(formatKm(12.5)).toBe('12.5');
  });
});

describe('max detour constants and clamp', () => {
  it('documents min 1 / default 5 / max 30', () => {
    expect(MAX_DETOUR_KM_MIN).toBe(1);
    expect(MAX_DETOUR_KM_DEFAULT).toBe(5);
    expect(MAX_DETOUR_KM_MAX).toBe(30);
  });

  it('clamps below min and above max', () => {
    expect(clampMaxDetourKm(0)).toBe(1);
    expect(clampMaxDetourKm(31)).toBe(30);
    expect(clampMaxDetourKm(5.24)).toBe(5.2);
    expect(clampMaxDetourKm(Number.NaN)).toBe(5);
  });

  it('parses the B20 field with an inline error', () => {
    expect(parseMaxDetourKm('5').error).toBeNull();
    expect(parseMaxDetourKm('0').error).toMatch(/อย่างน้อย/);
    expect(parseMaxDetourKm('40').error).toMatch(/ไม่เกิน/);
    expect(parseMaxDetourKm('').value).toBe(5);
  });
});

describe('detourFloorKm', () => {
  const pickup = { lat: 13.75, lng: 100.5 };
  const dest = { lat: 14.35, lng: 100.57 };

  it('is ~0 when the rider dest is the trip dest', () => {
    expect(detourFloorKm({ pickup, destination: dest, riderDest: dest })).toBe(0);
  });

  it('is large when the rider dest is far off the main path', () => {
    const chiangMai = { lat: 18.788, lng: 98.985 };
    const floor = detourFloorKm({ pickup, destination: dest, riderDest: chiangMai });
    expect(floor).toBeGreaterThan(30);
    expect(maxDetourExceeded(floor, 5)).toBe(true);
    expect(maxDetourWarning(floor, 5)).toMatch(/ออกนอกเส้นทาง/);
    expect(maxDetourWarning(floor, 5)).toMatch(/สูงสุด 5 กม/);
  });
});
