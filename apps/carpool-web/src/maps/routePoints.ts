import { orderDropoffs, type GeoPoint } from '@drop/carpool-core';
import type { LatLng } from './MapProvider';

export type NamedStop = { id: string; coord: LatLng; label: string };

export type OrderedRoute = {
  points: LatLng[];
  labels: string[];
};

function finiteStops(stops: readonly NamedStop[]): NamedStop[] {
  return stops.filter((s) => Number.isFinite(s.coord.lat) && Number.isFinite(s.coord.lng));
}

/**
 * origin → saved waypoints (fixed seq) → extra stops in carpool-core shortest
 * drop-off order (from the last waypoint, else origin) → destination.
 * Destination stays last (not part of the permutation).
 */
export async function orderedRoute(input: {
  origin: LatLng | null;
  originLabel: string;
  waypoints?: readonly NamedStop[];
  stops?: readonly NamedStop[];
  destination: LatLng | null;
  destinationLabel: string;
}): Promise<OrderedRoute | null> {
  if (!input.origin || !input.destination) return null;
  const waypoints = finiteStops(input.waypoints ?? []);
  const extra = finiteStops(input.stops ?? []);
  let middle: NamedStop[] = [...waypoints];
  if (extra.length) {
    const pickup = (middle.at(-1)?.coord ?? input.origin) as GeoPoint;
    const result = await orderDropoffs({
      pickup,
      riders: extra.map((s) => ({ id: s.id, coord: s.coord })),
    });
    const byId = new Map(extra.map((s) => [s.id, s]));
    middle = [
      ...middle,
      ...result.order.map((id) => byId.get(id)).filter((s): s is NamedStop => Boolean(s)),
    ];
  }
  return {
    points: [input.origin, ...middle.map((s) => s.coord), input.destination],
    labels: [input.originLabel, ...middle.map((s) => s.label), input.destinationLabel],
  };
}

/** Persist create-trip จุดแวะ in the ordered path (skip origin + destination). */
export function waypointsFromOrdered(ordered: OrderedRoute): {
  seq: number;
  lat: number;
  lng: number;
  address: string;
}[] {
  return ordered.points.slice(1, -1).map((p, i) => ({
    seq: i + 1,
    lat: p.lat,
    lng: p.lng,
    address: ordered.labels[i + 1] ?? '',
  }));
}

/** Detour charged only to that requester via computeFare `detourKm`. */
export function detourFromViaKm(viaKm: number, mainRouteKm: number): number {
  if (!Number.isFinite(viaKm) || !Number.isFinite(mainRouteKm)) return 0;
  return Math.max(0, viaKm - mainRouteKm);
}
