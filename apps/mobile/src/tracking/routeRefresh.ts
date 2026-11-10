import { haversineMeters } from '../geo/haversine';

export const ROUTE_REFRESH_MIN_INTERVAL_MS = 15_000;
export const ROUTE_REFRESH_MIN_MOVE_M = 40;

export type RouteFix = { at: number; lat: number; lng: number };

export function shouldRefreshRoute(last: RouteFix | null, next: RouteFix): boolean {
  if (!last) return true;
  if (next.at - last.at < ROUTE_REFRESH_MIN_INTERVAL_MS) return false;
  return haversineMeters(last, next) >= ROUTE_REFRESH_MIN_MOVE_M;
}
