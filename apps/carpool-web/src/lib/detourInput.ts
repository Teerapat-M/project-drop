/** Clamp Join detour field. Empty → 0; NaN / negative → last valid value. */
export function parseDetourKm(raw: string, lastValid: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return lastValid;
  return n;
}
