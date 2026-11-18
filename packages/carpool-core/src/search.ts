import { haversineMeters, type GeoPoint } from './dropoffOrder';
import { roundKm } from './detour';

/**
 * Nearby-point trip search radius (Bell).
 * Min 1 km / default 5 km / max 30 km — same envelope as the taxi
 * max-detour cap, so a search never outruns a taxi the rider couldn't join.
 */
export const SEARCH_RADIUS_KM_MIN = 1;
export const SEARCH_RADIUS_KM_DEFAULT = 5;
export const SEARCH_RADIUS_KM_MAX = 30;

export function clampSearchRadiusKm(raw: number, fallback = SEARCH_RADIUS_KM_DEFAULT): number {
  if (!Number.isFinite(raw)) return fallback;
  if (raw < SEARCH_RADIUS_KM_MIN) return SEARCH_RADIUS_KM_MIN;
  if (raw > SEARCH_RADIUS_KM_MAX) return SEARCH_RADIUS_KM_MAX;
  return roundKm(raw);
}

export type NearestVertex = {
  index: number;
  km: number;
};

export type SearchMatch = {
  pickupDistanceKm: number | null;
  destDistanceKm: number | null;
  extraKm: number | null;
};

/** Point-to-vertex (not point-to-segment). Index is into the ordered route. */
export function nearestRouteVertex(
  point: GeoPoint,
  route: readonly GeoPoint[],
  fromIndex = 0,
): NearestVertex | null {
  let best: NearestVertex | null = null;
  for (let i = Math.max(0, fromIndex); i < route.length; i++) {
    const vertex = route[i];
    if (!vertex) continue;
    const km = haversineMeters(point, vertex) / 1000;
    if (!best || km < best.km) best = { index: i, km };
  }
  return best;
}

/**
 * Client/demo copy of private.carpool_search_distances: min haversine to
 * ordered route vertices (origin → stops in seq → dest). Pickup records i_p;
 * dest only considers vertices with index >= i_p. Taxi dest radius is
 * least(search radius, max_detour_km). Returns null when the trip is out of
 * range. No points → include with null distances.
 */
export function matchSearchRoute(input: {
  route: readonly GeoPoint[];
  pickup?: GeoPoint | null;
  dest?: GeoPoint | null;
  radiusKm: number;
  taxiMaxDetourKm?: number | null;
}): SearchMatch | null {
  const hasPickup = input.pickup != null && Number.isFinite(input.pickup.lat) && Number.isFinite(input.pickup.lng);
  const hasDest = input.dest != null && Number.isFinite(input.dest.lat) && Number.isFinite(input.dest.lng);
  if (!hasPickup && !hasDest) {
    return { pickupDistanceKm: null, destDistanceKm: null, extraKm: null };
  }
  if (input.route.length === 0) return null;

  const radius = clampSearchRadiusKm(input.radiusKm);
  let iP = 0;
  let pickupKm: number | null = null;

  if (hasPickup && input.pickup) {
    const nearest = nearestRouteVertex(input.pickup, input.route, 0);
    if (!nearest || nearest.km > radius) return null;
    iP = nearest.index;
    pickupKm = roundKm(nearest.km);
  }

  let destKm: number | null = null;
  if (hasDest && input.dest) {
    const destRadius =
      input.taxiMaxDetourKm != null && Number.isFinite(input.taxiMaxDetourKm)
        ? Math.min(radius, input.taxiMaxDetourKm)
        : radius;
    const nearest = nearestRouteVertex(input.dest, input.route, iP);
    if (!nearest || nearest.km > destRadius) return null;
    destKm = roundKm(nearest.km);
  }

  const extra = roundKm((pickupKm ?? 0) + (destKm ?? 0));
  return { pickupDistanceKm: pickupKm, destDistanceKm: destKm, extraKm: extra };
}
