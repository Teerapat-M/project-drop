import { roundKm } from '@drop/carpool-core';
import type { LatLng, MapProvider, RouteResult } from './MapProvider';
import { pointSetKey, readRouteCache, writeRouteCache } from './routeCache';

/** Don't leave join waiting on a hung Routes call. */
export const ROUTE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('route-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function fetchRoute(
  provider: MapProvider,
  points: readonly LatLng[],
): Promise<RouteResult> {
  const key = pointSetKey(points);
  const cached = readRouteCache(key);
  if (cached) return cached;
  const result = await withTimeout(provider.route(points), ROUTE_TIMEOUT_MS);
  const rounded = { ...result, distanceKm: roundKm(result.distanceKm) };
  writeRouteCache(key, rounded);
  return rounded;
}
