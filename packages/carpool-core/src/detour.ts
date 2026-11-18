import { haversineMeters, type GeoPoint } from './dropoffOrder';

/**
 * Taxi "ระยะออกนอกเส้นทางสูงสุด".
 *
 * Min 1 km (Bell). Default 5 km: a typical extra drop in the same metro
 * without turning the taxi into a side trip. Cap 30 km: hard stop so a
 * join cannot become a cross-province detour. Private trips leave the
 * column null for now; the helpers still clamp any vehicle.
 */
export const MAX_DETOUR_KM_MIN = 1;
export const MAX_DETOUR_KM_DEFAULT = 5;
export const MAX_DETOUR_KM_MAX = 30;

/** Round km to 0.1 (100 m) so 0.1+0.2 never becomes 0.30000000000000004. */
export function roundKm(km: number): number {
  if (!Number.isFinite(km)) return 0;
  return Math.round(km * 10) / 10;
}

export function formatKm(km: number): string {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(roundKm(km));
}

export function clampMaxDetourKm(raw: number, fallback = MAX_DETOUR_KM_DEFAULT): number {
  if (!Number.isFinite(raw)) return fallback;
  if (raw < MAX_DETOUR_KM_MIN) return MAX_DETOUR_KM_MIN;
  if (raw > MAX_DETOUR_KM_MAX) return MAX_DETOUR_KM_MAX;
  return roundKm(raw);
}

export function parseMaxDetourKm(raw: string): { value: number; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { value: MAX_DETOUR_KM_DEFAULT, error: `อย่างน้อย ${MAX_DETOUR_KM_MIN} กม.` };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { value: MAX_DETOUR_KM_DEFAULT, error: 'ใส่ระยะเป็นกิโลเมตร' };
  }
  if (n < MAX_DETOUR_KM_MIN) {
    return { value: MAX_DETOUR_KM_MIN, error: `อย่างน้อย ${MAX_DETOUR_KM_MIN} กม.` };
  }
  if (n > MAX_DETOUR_KM_MAX) {
    return { value: MAX_DETOUR_KM_MAX, error: `ไม่เกิน ${MAX_DETOUR_KM_MAX} กม.` };
  }
  return { value: roundKm(n), error: null };
}

function pathMeters(points: readonly GeoPoint[]): number {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    meters += haversineMeters(a, b);
  }
  return meters;
}

/**
 * Client-side copy of private.carpool_detour_floor_km: haversine via the
 * rider dest minus the main path (origin → stops in seq → dest), ROAD_FACTOR 1.0.
 * Rounded to 3 decimals like the SQL floor.
 */
export function detourFloorKm(input: {
  pickup: GeoPoint;
  destination: GeoPoint;
  riderDest: GeoPoint;
  stops?: readonly GeoPoint[];
}): number {
  const stops = input.stops ?? [];
  const mainM = pathMeters([input.pickup, ...stops, input.destination]);
  const viaM = pathMeters([input.pickup, ...stops, input.riderDest, input.destination]);
  const km = Math.max(0, (viaM - mainM) / 1000);
  return Math.round(km * 1000) / 1000;
}

export function maxDetourExceeded(detourKm: number, maxKm: number | null | undefined): boolean {
  if (maxKm == null || !Number.isFinite(maxKm)) return false;
  return detourKm > maxKm;
}

export function maxDetourWarning(detourKm: number, maxKm: number): string {
  return `จุดลงนี้ออกนอกเส้นทาง ${formatKm(detourKm)} กม. เกินที่เจ้าของทริปกำหนด (สูงสุด ${formatKm(maxKm)} กม.)`;
}
