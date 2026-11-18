import { roundKm } from '@drop/carpool-core';

/** Clamp Join detour field. Empty → 0; NaN / negative → last valid value. Rounded to 0.1 km. */
export function parseDetourKm(raw: string, lastValid: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return lastValid;
  return roundKm(n);
}
