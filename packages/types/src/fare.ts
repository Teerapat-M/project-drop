/**
 * TODO(fare-formula): replace with a real tariff (base + distance + time + vehicle).
 * Always returns null until a formula is agreed. Callers must store fare_estimate as null
 * and show a placeholder in the UI.
 */
export function estimateFare(
  _distanceM: number,
  _durationS: number,
  _vehicleType: 'car' | 'bike',
): number | null {
  return null;
}
