import type { LatLng, MapProvider, RouteResult } from './MapProvider';
import { pointSetKey, readRouteCache, writeRouteCache } from './routeCache';

export async function fetchRoute(
  provider: MapProvider,
  points: readonly LatLng[],
): Promise<RouteResult> {
  const key = pointSetKey(points);
  const cached = readRouteCache(key);
  if (cached) return cached;
  const result = await provider.route(points);
  writeRouteCache(key, result);
  return result;
}
