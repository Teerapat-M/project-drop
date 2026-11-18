import { afterEach, describe, expect, it } from 'vitest';
import { fetchRoute } from './fetchRoute';
import { clearRouteCacheMemory, pointSetKey, resetRouteCache } from './routeCache';
import { createMockMapProvider } from '../test/mockMapProvider';

const POINTS = [
  { lat: 18.788, lng: 98.985 },
  { lat: 18.574, lng: 99.009 },
];

describe('route cache', () => {
  afterEach(() => {
    resetRouteCache();
  });

  it('hits memory then sessionStorage without a second provider.route call', async () => {
    const provider = createMockMapProvider();
    const first = await fetchRoute(provider, POINTS);
    expect(first.distanceKm).toBe(12);
    expect(provider.route).toHaveBeenCalledTimes(1);

    const memoryHit = await fetchRoute(provider, POINTS);
    expect(memoryHit).toEqual(first);
    expect(provider.route).toHaveBeenCalledTimes(1);

    clearRouteCacheMemory();
    const sessionHit = await fetchRoute(provider, POINTS);
    expect(sessionHit).toEqual(first);
    expect(provider.route).toHaveBeenCalledTimes(1);
    expect(pointSetKey(POINTS)).toContain('18.78800');
  });
});
