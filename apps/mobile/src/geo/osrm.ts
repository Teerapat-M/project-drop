export const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';

export type RoutePreview = {
  distanceM: number;
  durationS: number;
  coordinates: [number, number][];
};

function osrmBase(): string {
  return (process.env.EXPO_PUBLIC_OSRM_URL ?? DEFAULT_OSRM_URL).replace(/\/$/, '');
}

export function osrmRouteUrl(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  base = osrmBase(),
): string {
  return `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
}

export function parseOsrmRoute(payload: unknown): RoutePreview | null {
  if (!payload || typeof payload !== 'object') return null;
  const routes = (payload as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || !routes[0] || typeof routes[0] !== 'object') return null;
  const route = routes[0] as {
    distance?: unknown;
    duration?: unknown;
    geometry?: { coordinates?: unknown };
  };
  const distanceM = Number(route.distance);
  const durationS = Number(route.duration);
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationS)) return null;
  const coords = route.geometry?.coordinates;
  const coordinates: [number, number][] = [];
  if (Array.isArray(coords)) {
    for (const c of coords) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) coordinates.push([lng, lat]);
    }
  }
  return { distanceM, durationS, coordinates };
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<RoutePreview | null> {
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(osrmRouteUrl(from, to), { signal: opts.signal });
  if (!res.ok) return null;
  return parseOsrmRoute(await res.json());
}
