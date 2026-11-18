import { describe, expect, it } from '@jest/globals';
import {
  SEARCH_RADIUS_KM_DEFAULT,
  SEARCH_RADIUS_KM_MAX,
  SEARCH_RADIUS_KM_MIN,
  clampSearchRadiusKm,
  matchSearchRoute,
  nearestRouteVertex,
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

  it('matches pickup only and dest only', () => {
    const pickup = matchSearchRoute({
      route,
      pickup: { lat: 13.751, lng: 100.501 },
      radiusKm: 5,
    });
    expect(pickup?.pickupDistanceKm).not.toBeNull();
    expect(pickup?.destDistanceKm).toBeNull();
    expect(pickup?.extraKm).toBe(pickup?.pickupDistanceKm);

    const drop = matchSearchRoute({
      route,
      dest: { lat: 14.351, lng: 100.571 },
      radiusKm: 5,
    });
    expect(drop?.pickupDistanceKm).toBeNull();
    expect(drop?.destDistanceKm).not.toBeNull();
    expect(drop?.extraKm).toBe(drop?.destDistanceKm);
  });

  it('matches both points and sums extra_km', () => {
    const both = matchSearchRoute({
      route,
      pickup: { lat: 13.751, lng: 100.501 },
      dest: { lat: 14.351, lng: 100.571 },
      radiusKm: 5,
    });
    expect(both?.pickupDistanceKm).not.toBeNull();
    expect(both?.destDistanceKm).not.toBeNull();
    expect(both?.extraKm).toBeCloseTo((both?.pickupDistanceKm ?? 0) + (both?.destDistanceKm ?? 0));
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

  it('tightens the dest radius to the taxi cap', () => {
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
});
