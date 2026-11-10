export type Coord = { lat: number; lng: number };

const R = 6_371_000;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function haversineMeters(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function sortByDistance<T>(origin: Coord, items: T[], of: (item: T) => Coord): T[] {
  return [...items].sort((x, y) => haversineMeters(origin, of(x)) - haversineMeters(origin, of(y)));
}

export function formatDistanceM(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function formatDurationS(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  return `${min} min`;
}
