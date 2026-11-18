import { orderDropoffs, type GeoPoint } from '@drop/carpool-core';
import type { LatLng } from './MapProvider';

export type NamedStop = { id: string; coord: LatLng; label: string };

export type OrderedRoute = {
  points: LatLng[];
  labels: string[];
};

/**
 * origin → stops in carpool-core shortest drop-off order → destination.
 * Destination stays last (not part of the permutation).
 */
export async function orderedRoute(input: {
  origin: LatLng | null;
  originLabel: string;
  stops: readonly NamedStop[];
  destination: LatLng | null;
  destinationLabel: string;
}): Promise<OrderedRoute | null> {
  if (!input.origin || !input.destination) return null;
  const stops = input.stops.filter((s) => Number.isFinite(s.coord.lat) && Number.isFinite(s.coord.lng));
  if (!stops.length) {
    return {
      points: [input.origin, input.destination],
      labels: [input.originLabel, input.destinationLabel],
    };
  }
  const result = await orderDropoffs({
    pickup: input.origin as GeoPoint,
    riders: stops.map((s) => ({ id: s.id, coord: s.coord })),
  });
  const byId = new Map(stops.map((s) => [s.id, s]));
  const ordered = result.order
    .map((id) => byId.get(id))
    .filter((s): s is NamedStop => Boolean(s));
  return {
    points: [input.origin, ...ordered.map((s) => s.coord), input.destination],
    labels: [input.originLabel, ...ordered.map((s) => s.label), input.destinationLabel],
  };
}
