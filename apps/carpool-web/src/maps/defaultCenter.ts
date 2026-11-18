import { BANGKOK_CENTER } from '@drop/carpool-core';
import type { LatLng } from './MapProvider';

export const BANGKOK_MAP_CENTER: LatLng = {
  lat: BANGKOK_CENTER.lat,
  lng: BANGKOK_CENTER.lng,
};

function finite(points: readonly LatLng[] | null | undefined): LatLng[] {
  return (points ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Route bounds centroid when a path exists, else district/province centroid, else Bangkok. */
export function defaultMapCenter(input: {
  routePoints?: readonly LatLng[] | null;
  centroid?: LatLng | null;
}): LatLng {
  const route = finite(input.routePoints);
  if (route.length >= 2) {
    const lats = route.map((p) => p.lat);
    const lngs = route.map((p) => p.lng);
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }
  if (route.length === 1) return route[0]!;
  const c = input.centroid;
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) return c;
  return BANGKOK_MAP_CENTER;
}
