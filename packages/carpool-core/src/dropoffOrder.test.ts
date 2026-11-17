import { describe, expect, it } from '@jest/globals';
import {
  MAX_DROPOFF_RIDERS,
  haversineMeters,
  orderDropoffs,
  type DistanceFn,
  type GeoPoint,
} from './dropoffOrder';

/** Fixed Bangkok landmarks (WGS84). */
const BKK = {
  siamParagon: { lat: 13.7466, lng: 100.5347 },
  mbk: { lat: 13.7444, lng: 100.5298 },
  asok: { lat: 13.7373, lng: 100.5604 },
  chatuchak: { lat: 13.7999, lng: 100.5503 },
  lumphini: { lat: 13.7308, lng: 100.5416 },
} as const;

function pointKey(p: GeoPoint): string {
  return `${p.lat},${p.lng}`;
}

/** Directed lookup; missing pair throws so tests cannot silently use 0. */
function matrixDistance(matrix: Record<string, Record<string, number>>): DistanceFn {
  return (from, to) => {
    const a = pointKey(from);
    const b = pointKey(to);
    const n = matrix[a]?.[b];
    if (n === undefined) throw new Error(`no stub distance ${a} → ${b}`);
    return n;
  };
}

describe('orderDropoffs — stub distance matrix', () => {
  const pickup = { lat: 13.75, lng: 100.5 };
  const A = { lat: 13.76, lng: 100.51 };
  const B = { lat: 13.77, lng: 100.52 };
  const C = { lat: 13.78, lng: 100.53 };
  const k = pointKey;
  const matrix: Record<string, Record<string, number>> = {
    [k(pickup)]: { [k(A)]: 1, [k(B)]: 5, [k(C)]: 10 },
    [k(A)]: { [k(B)]: 1, [k(C)]: 10 },
    [k(B)]: { [k(A)]: 1, [k(C)]: 1 },
    [k(C)]: { [k(A)]: 10, [k(B)]: 1 },
  };
  const distance = matrixDistance(matrix);

  it('picks pickup → A → B → C (total 3) over the other 5 permutations', async () => {
    const result = await orderDropoffs({
      pickup,
      riders: [
        { id: 'C', coord: C },
        { id: 'A', coord: A },
        { id: 'B', coord: B },
      ],
      distance,
    });
    expect(result.order).toEqual(['A', 'B', 'C']);
    expect(result.totalDistance).toBe(3);
  });

  it('accepts an async distance function', async () => {
    const asyncDistance: DistanceFn = async (from, to) => distance(from, to);
    const result = await orderDropoffs({
      pickup,
      riders: [
        { id: 'A', coord: A },
        { id: 'B', coord: B },
      ],
      distance: asyncDistance,
    });
    expect(result.order).toEqual(['A', 'B']);
    expect(result.totalDistance).toBe(2);
  });
});

describe('orderDropoffs — deterministic tie-break', () => {
  it('picks the lexicographically smaller id sequence when totals match', async () => {
    const pickup = { lat: 13.75, lng: 100.5 };
    const X = { lat: 13.76, lng: 100.51 };
    const Y = { lat: 13.77, lng: 100.52 };
    const k = pointKey;
    const distance = matrixDistance({
      [k(pickup)]: { [k(X)]: 4, [k(Y)]: 4 },
      [k(X)]: { [k(Y)]: 6 },
      [k(Y)]: { [k(X)]: 6 },
    });
    const result = await orderDropoffs({
      pickup,
      riders: [
        { id: 'y', coord: Y },
        { id: 'x', coord: X },
      ],
      distance,
    });
    // both routes total 10; "x\0y" < "y\0x"
    expect(result.order).toEqual(['x', 'y']);
    expect(result.totalDistance).toBe(10);
  });
});

describe('orderDropoffs — Bangkok haversine default', () => {
  it('drops the nearest landmark first from Siam Paragon', async () => {
    const result = await orderDropoffs({
      pickup: BKK.siamParagon,
      riders: [
        { id: 'chatuchak', coord: BKK.chatuchak },
        { id: 'mbk', coord: BKK.mbk },
        { id: 'asok', coord: BKK.asok },
      ],
    });
    expect(result.order[0]).toBe('mbk');
    expect(result.order).toHaveLength(3);
    expect(result.totalDistance).toBeGreaterThan(0);
    const mbkFirst = haversineMeters(BKK.siamParagon, BKK.mbk);
    expect(result.totalDistance).toBeGreaterThan(mbkFirst);
  });

  it('returns an empty order for no riders', async () => {
    const result = await orderDropoffs({ pickup: BKK.siamParagon, riders: [] });
    expect(result).toEqual({ order: [], totalDistance: 0 });
  });
});

describe('orderDropoffs — n > 4', () => {
  it(`throws TOO_MANY_RIDERS above ${MAX_DROPOFF_RIDERS} (no silent fallback)`, async () => {
    const pickup = BKK.siamParagon;
    const riders = [1, 2, 3, 4, 5].map((n) => ({
      id: `r${n}`,
      coord: { lat: 13.74 + n * 0.01, lng: 100.53 },
    }));
    await expect(orderDropoffs({ pickup, riders })).rejects.toMatchObject({
      name: 'DropoffOrderError',
      code: 'TOO_MANY_RIDERS',
    });
    await expect(orderDropoffs({ pickup, riders })).rejects.toThrow(/OSRM/);
  });

  it('brute-forces all 24 permutations at n = 4', async () => {
    const pickup = { lat: 0, lng: 0 };
    const pts = [1, 2, 3, 4].map((n) => ({ lat: n, lng: n }));
    let calls = 0;
    const distance: DistanceFn = (from, to) => {
      calls += 1;
      return Math.abs(to.lat - from.lat);
    };
    const result = await orderDropoffs({
      pickup,
      riders: pts.map((coord, i) => ({ id: `p${i + 1}`, coord })),
      distance,
    });
    // 24 perms × 4 hops
    expect(calls).toBe(24 * 4);
    expect(result.order).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
