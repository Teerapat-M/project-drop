import type { LatLng } from './MapProvider';

export const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** Minimal Routes API field mask — distance for fare, polyline for the mini map. */
export const ROUTES_FIELD_MASK =
  'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';

export type ComputeRoutesBody = {
  origin: { location: { latLng: { latitude: number; longitude: number } } };
  destination: { location: { latLng: { latitude: number; longitude: number } } };
  intermediates?: { location: { latLng: { latitude: number; longitude: number } } }[];
  travelMode: 'DRIVE';
  languageCode: 'th';
  regionCode: 'TH';
};

function latLng(p: LatLng) {
  return { latitude: p.lat, longitude: p.lng };
}

export function buildComputeRoutesBody(points: readonly LatLng[]): ComputeRoutesBody {
  if (points.length < 2) {
    throw new Error('route needs origin and destination');
  }
  const origin = points[0];
  const destination = points[points.length - 1];
  const middles = points.slice(1, -1);
  const body: ComputeRoutesBody = {
    origin: { location: { latLng: latLng(origin) } },
    destination: { location: { latLng: latLng(destination) } },
    travelMode: 'DRIVE',
    languageCode: 'th',
    regionCode: 'TH',
  };
  if (middles.length) {
    body.intermediates = middles.map((p) => ({ location: { latLng: latLng(p) } }));
  }
  return body;
}

export function kmFromMeters(meters: number | undefined): number {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return 0;
  return Math.round((meters / 1000) * 10) / 10;
}

export function secondsFromDuration(duration: string | undefined): number | undefined {
  if (!duration) return undefined;
  const m = /^(\d+)s$/.exec(duration);
  return m ? Number(m[1]) : undefined;
}
