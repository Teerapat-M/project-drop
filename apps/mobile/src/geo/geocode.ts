import { GEOCODE_MIN_LENGTH } from './debounce';

export const DEFAULT_GEOCODER_URL = 'https://photon.komoot.io/api';

export const GEOCODER_HEADERS = {
  'User-Agent': 'Drop/0.1 (https://github.com/Teerapat-M/project-drop; ride-hailing portfolio)',
  Referer: 'https://github.com/Teerapat-M/project-drop',
  Accept: 'application/json',
} as const;

export type PlaceHit = {
  lat: number;
  lng: number;
  label: string;
  name: string;
  details: string;
};

function geocoderBase(): string {
  return (process.env.EXPO_PUBLIC_GEOCODER_URL ?? DEFAULT_GEOCODER_URL).replace(/\/$/, '');
}

function isNominatim(url: string): boolean {
  return url.includes('nominatim');
}

export function geocodeSearchUrl(query: string, base = geocoderBase()): string {
  if (isNominatim(base)) {
    const origin = base.includes('/search') ? base : `${new URL(base).origin}/search`;
    const u = new URL(origin);
    u.searchParams.set('q', query);
    u.searchParams.set('format', 'json');
    u.searchParams.set('limit', '6');
    u.searchParams.set('addressdetails', '0');
    return u.toString();
  }
  const u = new URL(base.includes('/api') ? base : `${base}/api`);
  u.searchParams.set('q', query);
  u.searchParams.set('limit', '6');
  return u.toString();
}

export function reverseGeocodeUrl(lat: number, lng: number, base = geocoderBase()): string {
  const origin = new URL(base).origin;
  if (isNominatim(base)) {
    return `${origin}/reverse?lat=${lat}&lon=${lng}&format=json`;
  }
  return `${origin}/reverse?lat=${lat}&lon=${lng}`;
}

function photonLabel(props: Record<string, unknown>): { name: string; details: string; label: string } {
  const name = String(props.name ?? props.street ?? 'Dropped pin');
  const parts = [props.street, props.city, props.state, props.country]
    .filter((p) => typeof p === 'string' && p && p !== name)
    .map(String);
  const details = parts.join(', ');
  return { name, details, label: details ? `${name}, ${details}` : name };
}

export function parseGeocodeResponse(payload: unknown): PlaceHit[] {
  if (payload && typeof payload === 'object' && 'features' in payload) {
    const features = (payload as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];
    const hits: PlaceHit[] = [];
    for (const f of features) {
      if (!f || typeof f !== 'object') continue;
      const geom = (f as { geometry?: { coordinates?: unknown } }).geometry;
      const coords = geom?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const props = ((f as { properties?: Record<string, unknown> }).properties ?? {}) as Record<
        string,
        unknown
      >;
      const { name, details, label } = photonLabel(props);
      hits.push({ lat, lng, name, details, label });
    }
    return hits;
  }
  if (Array.isArray(payload)) {
    const hits: PlaceHit[] = [];
    for (const row of payload) {
      if (!row || typeof row !== 'object') continue;
      const lat = Number((row as { lat?: unknown }).lat);
      const lng = Number((row as { lon?: unknown }).lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const label = String((row as { display_name?: unknown }).display_name ?? 'Dropped pin');
      const name = label.split(',')[0]?.trim() || label;
      hits.push({ lat, lng, name, details: label, label });
    }
    return hits;
  }
  if (payload && typeof payload === 'object' && 'lat' in payload) {
    return parseGeocodeResponse([payload]);
  }
  return [];
}

export async function searchPlaces(
  query: string,
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < GEOCODE_MIN_LENGTH) return [];
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(geocodeSearchUrl(q), {
    headers: GEOCODER_HEADERS,
    signal: opts.signal,
  });
  if (!res.ok) return [];
  return parseGeocodeResponse(await res.json());
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<PlaceHit | null> {
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(reverseGeocodeUrl(lat, lng), {
    headers: GEOCODER_HEADERS,
    signal: opts.signal,
  });
  if (!res.ok) return null;
  const hits = parseGeocodeResponse(await res.json());
  if (hits[0]) return hits[0];
  return { lat, lng, name: 'Dropped pin', details: '', label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
}
