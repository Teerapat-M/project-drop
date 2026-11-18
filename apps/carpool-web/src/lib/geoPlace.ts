import { haversineMeters, type GeoPoint } from '@drop/carpool-core';
import type { PickedPlace } from '../maps/MapProvider';

/** Clear a pin if it is farther than this from the selected province/district centroid. */
export const PIN_MAX_METERS = 80_000;

export function pinFitsCentroid(
  pin: GeoPoint | PickedPlace | null | undefined,
  centroid: GeoPoint | null | undefined,
  maxMeters = PIN_MAX_METERS,
): boolean {
  if (!pin || !centroid) return true;
  if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return true;
  return haversineMeters(pin, centroid) <= maxMeters;
}

export function keepPinIfInRange<T extends PickedPlace>(
  pin: T | null,
  centroid: GeoPoint | null | undefined,
): T | null {
  return pinFitsCentroid(pin, centroid) ? pin : null;
}
