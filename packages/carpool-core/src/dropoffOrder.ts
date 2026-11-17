/**
 * Drop-off order: shortest pickup → d1 → d2 → … path.
 *
 * Brute-force every permutation for n ≤ {@link MAX_DROPOFF_RIDERS} (4! = 24).
 * n > 4 throws {@link DropoffOrderError} (`TOO_MANY_RIDERS`). A later phase
 * may plug in OSRM or a heuristic; this module does not fall back silently.
 *
 * Distance is pluggable and may be async. Default is haversine (meters).
 * Equal totals tie-break by lexicographically smaller id sequence.
 */

export const MAX_DROPOFF_RIDERS = 4;

/** Mean Earth radius used by the default haversine (meters). */
export const EARTH_RADIUS_M = 6_371_000;

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type RiderDestination = {
  id: string;
  coord: GeoPoint;
};

export type DistanceFn = (from: GeoPoint, to: GeoPoint) => number | Promise<number>;

export type DropoffOrderInput = {
  pickup: GeoPoint;
  riders: readonly RiderDestination[];
  /** Defaults to {@link haversineMeters}. OSRM can be passed in later. */
  distance?: DistanceFn;
};

export type DropoffOrderResult = {
  order: string[];
  totalDistance: number;
};

export class DropoffOrderError extends Error {
  readonly code: 'TOO_MANY_RIDERS' | 'INVALID_COORD' | 'DUPLICATE_ID';

  constructor(code: DropoffOrderError['code'], message: string) {
    super(message);
    this.name = 'DropoffOrderError';
    this.code = code;
  }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function assertCoord(point: GeoPoint, label: string): void {
  if (
    typeof point.lat !== 'number' ||
    typeof point.lng !== 'number' ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng)
  ) {
    throw new DropoffOrderError('INVALID_COORD', `${label} must have finite lat/lng`);
  }
}

/** Great-circle distance in meters. Default {@link DistanceFn}. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const perm of permutations(rest)) out.push([item, ...perm]);
  });
  return out;
}

function idKey(riders: readonly RiderDestination[]): string {
  return riders.map((r) => r.id).join('\0');
}

/**
 * Shortest drop-off order from `pickup` through every rider destination.
 * Throws if `riders.length > MAX_DROPOFF_RIDERS`.
 */
export async function orderDropoffs(input: DropoffOrderInput): Promise<DropoffOrderResult> {
  assertCoord(input.pickup, 'pickup');
  if (input.riders.length > MAX_DROPOFF_RIDERS) {
    throw new DropoffOrderError(
      'TOO_MANY_RIDERS',
      `brute-force drop-off order supports at most ${MAX_DROPOFF_RIDERS} riders ` +
        `(${input.riders.length} given); OSRM/heuristic comes later`,
    );
  }

  const seen = new Set<string>();
  for (const rider of input.riders) {
    if (seen.has(rider.id)) {
      throw new DropoffOrderError('DUPLICATE_ID', `duplicate rider id: ${rider.id}`);
    }
    seen.add(rider.id);
    assertCoord(rider.coord, `rider ${rider.id}`);
  }

  if (input.riders.length === 0) {
    return { order: [], totalDistance: 0 };
  }

  const distance = input.distance ?? haversineMeters;
  const DIST_EPS = 1e-9;

  let best: DropoffOrderResult | null = null;
  let bestKey = '';

  for (const perm of permutations(input.riders)) {
    let total = 0;
    let prev = input.pickup;
    for (const rider of perm) {
      total += await distance(prev, rider.coord);
      prev = rider.coord;
    }
    const key = idKey(perm);
    const better =
      best === null ||
      total < best.totalDistance - DIST_EPS ||
      (Math.abs(total - best.totalDistance) <= DIST_EPS && key < bestKey);
    if (better) {
      best = { order: perm.map((r) => r.id), totalDistance: total };
      bestKey = key;
    }
  }

  return best as DropoffOrderResult;
}
