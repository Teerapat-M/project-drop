import type { LatLng, RouteResult } from './MapProvider';

export const ROUTE_CACHE_STORAGE_KEY = 'carpool.route.v1';
export const ROUTE_DEBOUNCE_MS = 300;
const MAX_SESSION_ENTRIES = 30;

const memory = new Map<string, RouteResult>();

export function pointSetKey(points: readonly LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}

export function readRouteCache(key: string): RouteResult | null {
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(ROUTE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, RouteResult>;
    const stored = parsed[key];
    if (!stored) return null;
    memory.set(key, stored);
    return stored;
  } catch {
    return null;
  }
}

export function writeRouteCache(key: string, result: RouteResult): void {
  memory.set(key, result);
  try {
    const raw = sessionStorage.getItem(ROUTE_CACHE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, RouteResult>) : {};
    parsed[key] = result;
    const keys = Object.keys(parsed);
    // ponytail: drop oldest keys by insertion order if the blob grows past 30; LRU if quota bites.
    if (keys.length > MAX_SESSION_ENTRIES) {
      for (const extra of keys.slice(0, keys.length - MAX_SESSION_ENTRIES)) {
        delete parsed[extra];
      }
    }
    sessionStorage.setItem(ROUTE_CACHE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // quota / private mode — memory cache still works
  }
}

export function clearRouteCacheMemory(): void {
  memory.clear();
}

export function resetRouteCache(): void {
  memory.clear();
  try {
    sessionStorage.removeItem(ROUTE_CACHE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
