import { describe, expect, it } from '@jest/globals';
import {
  SEARCH_RADIUS_KM_DEFAULT,
  SEARCH_RADIUS_KM_MAX,
  SEARCH_RADIUS_KM_MIN,
  clampSearchRadiusKm,
  matchSearchRoute,
  nearestRouteVertex,
  roundCoord,
  roundKmHalf,
} from './search';

const origin = { lat: 13.75, lng: 100.5 };
const stop = { lat: 14.0, lng: 100.53 };
const dest = { lat: 14.35, lng: 100.57 };
const route = [origin, stop, dest];

describe('search radius constants', () => {
  it('documents min 1 / default 5 / max 30', () => {
    expect(SEARCH_RADIUS_KM_MIN).toBe(1);
    expect(SEARCH_RADIUS_KM_DEFAULT).toBe(5);
    expect(SEARCH_RADIUS_KM_MAX).toBe(30);
  });

  it('clamps below min and above max', () => {
    expect(clampSearchRadiusKm(0)).toBe(1);
    expect(clampSearchRadiusKm(40)).toBe(30);
    expect(clampSearchRadiusKm(Number.NaN)).toBe(5);
  });
});

describe('rounding', () => {
  it('snaps coords to 3 decimals and km to 0.5', () => {
    expect(roundCoord(13.75634)).toBe(13.756);
    expect(roundKmHalf(0.24)).toBe(0);
    expect(roundKmHalf(0.25)).toBe(0.5);
    expect(roundKmHalf(1.24)).toBe(1);
    expect(roundKmHalf(1.26)).toBe(1.5);
  });
});

describe('nearestRouteVertex', () => {
  it('picks the closest vertex and can start at an index', () => {
    const nearOrigin = nearestRouteVertex({ lat: 13.751, lng: 100.501 }, route);
    expect(nearOrigin?.index).toBe(0);
    const afterPickup = nearestRouteVertex({ lat: 13.751, lng: 100.501 }, route, 1);
    expect(afterPickup?.index).toBe(1);
  });
});

describe('matchSearchRoute', () => {
  it('includes every trip when no points are given', () => {
    expect(matchSearchRoute({ route, radiusKm: 5 })).toEqual({
      pickupDistanceKm: null,
      destDistanceKm: null,
      extraKm: null,
    });
  });

  it('matches pickup only and dest only with 0.5 km distances', () => {
    const pickup = matchSearchRoute({
      route,
      pickup: { lat: 13.751, lng: 100.501 },
      radiusKm: 5,
    });
    expect(pickup?.pickupDistanceKm).not.toBeNull();
    expect(pickup?.destDistanceKm).toBeNull();
    expect(pickup?.extraKm).toBe(pickup?.pickupDistanceKm);
    expect(((pickup?.pickupDistanceKm ?? 0) * 2) % 1).toBe(0);

    const drop = matchSearchRoute({
      route,
      dest: { lat: 14.351, lng: 100.571 },
      radiusKm: 5,
    });
    expect(drop?.pickupDistanceKm).toBeNull();
    expect(drop?.destDistanceKm).not.toBeNull();
    expect(((drop?.destDistanceKm ?? 0) * 2) % 1).toBe(0);
    expect(((drop?.extraKm ?? 0) * 2) % 1).toBe(0);
  });

  it('matches both points and snaps extra_km to 0.5', () => {
    const both = matchSearchRoute({
      route,
      pickup: { lat: 13.751, lng: 100.501 },
      dest: { lat: 14.351, lng: 100.571 },
      radiusKm: 5,
    });
    expect(both?.pickupDistanceKm).not.toBeNull();
    expect(both?.destDistanceKm).not.toBeNull();
    expect(((both?.extraKm ?? 0) * 2) % 1).toBe(0);
  });

  it('rejects a point outside the radius', () => {
    const chiangMai = { lat: 18.788, lng: 98.985 };
    expect(matchSearchRoute({ route, pickup: chiangMai, radiusKm: 5 })).toBeNull();
  });

  it('excludes pickup after drop-off along the route', () => {
    const swapped = matchSearchRoute({
      route,
      pickup: dest,
      dest: origin,
      radiusKm: 5,
    });
    expect(swapped).toBeNull();
  });

  it('matches via an intermediate stop', () => {
    const viaStop = matchSearchRoute({
      route,
      pickup: { lat: 14.001, lng: 100.531 },
      dest,
      radiusKm: 5,
    });
    expect(viaStop).not.toBeNull();
    expect(viaStop?.pickupDistanceKm).toBeLessThan(1);
  });

  it('excludes a taxi dest whose detour floor exceeds the cap', () => {
    const offDest = { lat: 14.35, lng: 100.61 };
    const open = matchSearchRoute({
      route,
      dest: offDest,
      radiusKm: 5,
    });
    expect(open).not.toBeNull();
    const taxi = matchSearchRoute({
      route,
      dest: offDest,
      radiusKm: 5,
      taxiMaxDetourKm: 1,
    });
    expect(taxi).toBeNull();
  });

  it('does not leak meter-level distances across a probe grid', () => {
    const stored = { lat: 13.75634, lng: 100.50187 };
    const distances = new Set<number>();
    for (let i = -10; i <= 10; i++) {
      for (let j = -10; j <= 10; j++) {
        const match = matchSearchRoute({
          route: [stored, dest],
          pickup: { lat: stored.lat + i * 0.0001, lng: stored.lng + j * 0.0001 },
          radiusKm: 5,
        });
        expect(match).not.toBeNull();
        expect(match?.pickupDistanceKm).not.toBeNull();
        expect(((match?.pickupDistanceKm ?? 0) * 2) % 1).toBe(0);
        distances.add(match?.pickupDistanceKm ?? -1);
      }
    }
    expect(distances.size).toBeLessThanOrEqual(2);
    expect([...distances].every((km) => km === 0 || km === 0.5)).toBe(true);
  });
});
