import { describe, expect, it } from 'vitest';
import { BANGKOK_CENTER } from '@drop/carpool-core';
import { keepPinIfInRange, pinFitsCentroid, PIN_MAX_METERS } from './geoPlace';

describe('pinFitsCentroid', () => {
  it('keeps a Bangkok pin inside the city and drops Chiang Mai', () => {
    expect(pinFitsCentroid(BANGKOK_CENTER, BANGKOK_CENTER)).toBe(true);
    expect(pinFitsCentroid({ lat: 13.76, lng: 100.5 }, BANGKOK_CENTER)).toBe(true);
    expect(pinFitsCentroid({ lat: 18.788, lng: 98.985 }, BANGKOK_CENTER)).toBe(false);
    expect(PIN_MAX_METERS).toBe(80_000);
    expect(keepPinIfInRange({ lat: 18.788, lng: 98.985, address: 'เชียงใหม่' }, BANGKOK_CENTER)).toBeNull();
  });
});
