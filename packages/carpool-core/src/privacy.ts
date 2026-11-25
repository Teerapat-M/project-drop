import { haversineMeters, type GeoPoint } from './dropoffOrder';
import { roundCoord } from './search';
import {
  NEARBY_AREA_LABEL,
  isCountryOnlyPart,
  lookupCanonicalProvince,
  stripFormatChars,
  stripTrailingPostcode,
  textHasNumber,
} from './thaiProvinces';

export { NEARBY_AREA_LABEL, textHasNumber } from './thaiProvinces';

/** Cap for coarse-label lookup and stored pickup/dest labels. */
export const COARSE_LABEL_MAX_CHARS = 200;

/** Keep the tail: province/country sit at the end of formatted addresses. */
export function capCoarseLookupInput(value: string): string {
  return value.length <= COARSE_LABEL_MAX_CHARS ? value : value.slice(-COARSE_LABEL_MAX_CHARS);
}

/** First 200 chars so a CHECK on stored columns does not reject the write. */
export function capStoredLabel(value: string): string {
  return value.length <= COARSE_LABEL_MAX_CHARS ? value : value.slice(0, COARSE_LABEL_MAX_CHARS);
}

/** Offset distance stored per trip (random in this range, once). */
export const PRIVACY_OFFSET_KM_MIN = 0.9;
export const PRIVACY_OFFSET_KM_MAX = 1.1;
export const PRIVACY_OFFSET_KM = 1;

/**
 * Confirmed riders see the true pickup this long before depart_at.
 * carpool-web never sets status=in_progress, so a status-only reveal
 * would hide the meeting point forever and break taxi-share pickup.
 */
export const PICKUP_REVEAL_BEFORE_MS = 30 * 60 * 1000;

/** Stored bearing regenerates only when the true point moves farther than this. */
export const OFFSET_REGEN_KM = 0.2;

const EARTH_KM = 6371;

export function offsetPoint(origin: GeoPoint, bearingRad: number, km: number): GeoPoint {
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const d = km / EARTH_KM;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: roundCoord((lat2 * 180) / Math.PI),
    lng: roundCoord((((lng2 * 180) / Math.PI + 540) % 360) - 180),
  };
}

/** Stable demo bearing/km from a trip id so pins don't jitter. */
export function stableOffset(seed: string): { bearingRad: number; km: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) / 0xffffffff;
  return {
    bearingRad: u * 2 * Math.PI,
    km: PRIVACY_OFFSET_KM_MIN + (u * (PRIVACY_OFFSET_KM_MAX - PRIVACY_OFFSET_KM_MIN)),
  };
}

/**
 * Non-owners see the canonical Thai province when the last comma-separated
 * part (after dropping a trailing country-only part and a trailing 5-digit
 * ASCII postcode) matches the 77-province allowlist. Anything else, a
 * single-part label, or a remaining \p{N} digit → พื้นที่ใกล้เคียง.
 *
 * Google formatted addresses usually end with ", Thailand" / ", ประเทศไทย"
 * and a postcode (e.g. "..., Bangkok 10110, Thailand"). Those tokens are
 * stripped before matching; the return value is always the allowlisted
 * canonical name, never input text.
 */
export function coarseAddress(address: string | null | undefined): string {
  const raw = capCoarseLookupInput(stripFormatChars(address ?? ''));
  if (!raw.includes(',')) return NEARBY_AREA_LABEL;
  const parts = raw.split(/\s*,\s*/).filter((p) => p.length > 0);
  while (parts.length > 0 && isCountryOnlyPart(parts[parts.length - 1] ?? '')) {
    parts.pop();
  }
  const last = stripTrailingPostcode(parts[parts.length - 1] ?? '');
  if (!last || textHasNumber(last)) return NEARBY_AREA_LABEL;
  const canon = lookupCanonicalProvince(last) ?? NEARBY_AREA_LABEL;
  return canon.length <= COARSE_LABEL_MAX_CHARS ? canon : canon.slice(0, COARSE_LABEL_MAX_CHARS);
}

export function shouldRegenOffset(prev: GeoPoint, next: GeoPoint): boolean {
  return offsetKmFromTrue(prev, next) > OFFSET_REGEN_KM;
}

export function offsetKmFromTrue(truePoint: GeoPoint, shown: GeoPoint): number {
  return haversineMeters(truePoint, shown) / 1000;
}

export function shouldRevealPickup(input: {
  isOwner: boolean;
  isBookedRider: boolean;
  status: string;
  departAt: string | Date;
  now?: Date;
}): boolean {
  if (input.isOwner) return true;
  if (!input.isBookedRider) return false;
  if (input.status === 'in_progress' || input.status === 'completed') return true;
  const depart = input.departAt instanceof Date ? input.departAt : new Date(input.departAt);
  const now = input.now ?? new Date();
  return now.getTime() >= depart.getTime() - PICKUP_REVEAL_BEFORE_MS;
}
