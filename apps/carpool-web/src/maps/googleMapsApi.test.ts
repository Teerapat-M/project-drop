import { describe, expect, it } from 'vitest';
import { ROUTES_FIELD_MASK, buildComputeRoutesBody, kmFromMeters } from './googleMapsApi';
import { FallbackMapProvider, isMapsConfigured } from './MapProvider';

describe('Google Maps request shape + no-key fallback', () => {
  it('asks Routes API for a minimal field mask', () => {
    expect(ROUTES_FIELD_MASK).toBe(
      'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    );
    const body = buildComputeRoutesBody([
      { lat: 18.788, lng: 98.985 },
      { lat: 18.7, lng: 99 },
      { lat: 18.574, lng: 99.009 },
    ]);
    expect(body.languageCode).toBe('th');
    expect(body.regionCode).toBe('TH');
    expect(body.intermediates).toHaveLength(1);
    expect(kmFromMeters(12345)).toBe(12.3);
  });

  it('treats a missing Maps key as unavailable (no throw)', async () => {
    expect(isMapsConfigured()).toBe(false);
    const fallback = new FallbackMapProvider();
    expect(fallback.available).toBe(false);
    await expect(fallback.load()).resolves.toBeUndefined();
    await expect(fallback.autocomplete('เชียงใหม่', 't')).resolves.toEqual([]);
    await expect(fallback.autocomplete('ab', 't')).resolves.toEqual([]);
    fallback.endAutocompleteSession('t');
  });
});
