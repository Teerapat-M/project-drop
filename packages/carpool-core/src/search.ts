import { haversineMeters, type GeoPoint } from './dropoffOrder';
import { detourFloorKm } from './detour';

/**
 * Nearby-point trip search radius (Bell).
 * Min 1 km / default 5 km / max 30 km — same envelope as the taxi
 * max-detour cap, so a search never outruns a taxi the rider couldn't join.
 */
export const SEARCH_RADIUS_KM_MIN = 1;
export const SEARCH_RADIUS_KM_DEFAULT = 5;
export const SEARCH_RADIUS_KM_MAX = 30;

/** ~111 m. Matches private.carpool_round_deg / discover returned coords. */
export function roundCoord(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 1000) / 1000;
}

/** 0.5 km steps. Matches private.carpool_round_km_half. */
export function roundKmHalf(km: number): number {
  if (!Number.isFinite(km)) return 0;
  return Math.round(km * 2) / 2;
}

export function clampSearchRadiusKm(raw: number, fallback = SEARCH_RADIUS_KM_DEFAULT): number {
  if (!Number.isFinite(raw)) return fallback;
  if (raw < SEARCH_RADIUS_KM_MIN) return SEARCH_RADIUS_KM_MIN;
  if (raw > SEARCH_RADIUS_KM_MAX) return SEARCH_RADIUS_KM_MAX;
  return roundKmHalf(raw);
}

function roundPoint(p: GeoPoint): GeoPoint {
  return { lat: roundCoord(p.lat), lng: roundCoord(p.lng) };
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
  const probe = roundPoint(point);
  let best: NearestVertex | null = null;
  for (let i = Math.max(0, fromIndex); i < route.length; i++) {
    const vertex = route[i];
    if (!vertex) continue;
    const km = haversineMeters(probe, roundPoint(vertex)) / 1000;
    if (!best || km < best.km) best = { index: i, km };
  }
  return best;
}

/**
 * Client/demo copy of private.carpool_search_distances: min haversine to
 * ordered route vertices (origin → stops in seq → dest) on 3-decimal coords.
 * Pickup records i_p; dest only considers vertices with index >= i_p.
 * Distances snap to 0.5 km. extra_km dest component is detourFloorKm (same
 * as book_seat). Taxi excluded when that floor exceeds max_detour_km.
 * Returns null when the trip is out of range. No points → include with
 * null distances.
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
    pickupKm = roundKmHalf(nearest.km);
  }

  let destKm: number | null = null;
  let destFloor = 0;
  if (hasDest && input.dest) {
    const nearest = nearestRouteVertex(input.dest, input.route, iP);
    if (!nearest || nearest.km > radius) return null;
    destKm = roundKmHalf(nearest.km);
    const origin = input.route[0];
    const tripDest = input.route[input.route.length - 1];
    if (origin && tripDest) {
      destFloor = detourFloorKm({
        pickup: origin,
        destination: tripDest,
        riderDest: input.dest,
        stops: input.route.slice(1, -1),
      });
      if (
        input.taxiMaxDetourKm != null &&
        Number.isFinite(input.taxiMaxDetourKm) &&
        destFloor > input.taxiMaxDetourKm
      ) {
        return null;
      }
    }
  }

  const extra = roundKmHalf((pickupKm ?? 0) + (hasDest ? destFloor : 0));
  return { pickupDistanceKm: pickupKm, destDistanceKm: destKm, extraKm: extra };
}
