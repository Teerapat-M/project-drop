import { describe, expect, it } from 'vitest';
import { BANGKOK_CENTER } from '@drop/carpool-core';
import { BANGKOK_MAP_CENTER, defaultMapCenter } from './defaultCenter';

describe('defaultMapCenter', () => {
  it('fits the route bounds centroid, not Chiang Mai', () => {
    const origin = { lat: 13.7563, lng: 100.5018 };
    const dest = { lat: 14.35, lng: 100.57 };
    const center = defaultMapCenter({ routePoints: [origin, dest] });
    expect(center.lat).toBeCloseTo((13.7563 + 14.35) / 2);
    expect(center.lng).toBeCloseTo((100.5018 + 100.57) / 2);
    expect(center.lat).toBeLessThan(15);
    expect(center.lat).not.toBeCloseTo(18.788, 1);
  });

  it('falls back to district/province centroid, then Bangkok', () => {
    expect(defaultMapCenter({ centroid: { lat: 14.35, lng: 100.57 } })).toEqual({
      lat: 14.35,
      lng: 100.57,
    });
    expect(defaultMapCenter({})).toEqual(BANGKOK_MAP_CENTER);
    expect(BANGKOK_MAP_CENTER).toEqual({ lat: BANGKOK_CENTER.lat, lng: BANGKOK_CENTER.lng });
  });
});
