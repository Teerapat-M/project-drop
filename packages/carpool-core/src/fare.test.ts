import { describe, expect, it } from '@jest/globals';
import {
  RATE_THB_PER_KM,
  FareError,
  computeFare,
  splitSatang,
  type SeatInput,
} from './fare';

const passenger = (id: string, extra?: Partial<SeatInput>): SeatInput => ({
  id,
  open: true,
  booked: true,
  role: 'passenger',
  ...extra,
});

function byId(result: ReturnType<typeof computeFare>) {
  return Object.fromEntries(result.persons.map((p) => [p.id, p]));
}

function sumAmounts(result: ReturnType<typeof computeFare>): number {
  return result.persons.reduce((n, p) => n + p.amountThb, 0);
}

describe('RATE_THB_PER_KM', () => {
  it('is 7 and overridable per call', () => {
    expect(RATE_THB_PER_KM).toBe(7);
    const custom = computeFare({
      mainRouteKm: 10,
      rateThbPerKm: 10,
      seats: [passenger('A')],
    });
    expect(custom.rateThbPerKm).toBe(10);
    expect(custom.totalThb).toBe(100);
  });
});

describe('computeFare — taxi A/B/C 12 km, B detour 1.5 km', () => {
  const result = computeFare({
    vehicle: 'taxi',
    mainRouteKm: 12,
    seats: [passenger('A'), passenger('B', { detourKm: 1.5 }), passenger('C')],
  });
  const p = byId(result);

  it('splits 84 THB equally and charges B the 21 THB detour (A 28, B 49, C 28, total 105)', () => {
    expect(result.mainFareThb).toBe(84);
    expect(p.A.amountThb).toBe(28);
    expect(p.B.amountThb).toBe(49);
    expect(p.C.amountThb).toBe(28);
    expect(result.totalThb).toBe(105);
    expect(sumAmounts(result)).toBe(105);
  });

  it('returns share + detour breakdown', () => {
    expect(p.A.breakdown).toEqual({ shareThb: 28, detourThb: 0 });
    expect(p.B.breakdown).toEqual({ shareThb: 28, detourThb: 21 });
    expect(p.C.breakdown).toEqual({ shareThb: 28, detourThb: 0 });
  });

  it('returns percent of the 105 THB total', () => {
    expect(p.A.percentOfTotal).toBeCloseTo((28 / 105) * 100, 10);
    expect(p.B.percentOfTotal).toBeCloseTo((49 / 105) * 100, 10);
    expect(p.C.percentOfTotal).toBeCloseTo((28 / 105) * 100, 10);
  });

  it('does not label taxi passengers as owner-driver cost-sharing', () => {
    expect(p.A.ownerDriverCostSharing).toBe(false);
    expect(p.B.ownerDriverCostSharing).toBe(false);
    expect(p.C.ownerDriverCostSharing).toBe(false);
  });
});

describe('computeFare — private car + owner-driver', () => {
  const result = computeFare({
    vehicle: 'private_car',
    mainRouteKm: 12,
    seats: [
      passenger('A'),
      passenger('B', { detourKm: 1.5 }),
      passenger('C'),
      { id: 'driver', open: true, booked: true, role: 'owner_driver' },
    ],
  });
  const p = byId(result);

  it('counts the owner-driver as a payer (A 21, B 42, C 21, driver 21, total 105)', () => {
    expect(result.mainFareThb).toBe(84);
    expect(p.A.amountThb).toBe(21);
    expect(p.B.amountThb).toBe(42);
    expect(p.C.amountThb).toBe(21);
    expect(p.driver.amountThb).toBe(21);
    expect(result.totalThb).toBe(105);
    expect(sumAmounts(result)).toBe(105);
  });

  it('labels the owner-driver as cost-sharing only (no wage)', () => {
    expect(p.driver.ownerDriverCostSharing).toBe(true);
    expect(p.A.ownerDriverCostSharing).toBe(false);
    expect(p.driver.breakdown).toEqual({ shareThb: 21, detourThb: 0 });
    expect(p.B.breakdown).toEqual({ shareThb: 21, detourThb: 21 });
  });
});

describe('computeFare — rounding remainder (10 km / 3 payers)', () => {
  const result = computeFare({
    mainRouteKm: 10,
    seats: [passenger('A'), passenger('B'), passenger('C')],
  });
  const p = byId(result);
  const amounts = result.persons.map((person) => person.amountThb);

  it('works in satang so the 70 THB total is exact', () => {
    expect(result.mainFareThb).toBe(70);
    expect(result.totalThb).toBe(70);
    expect(sumAmounts(result)).toBe(70);
    expect(amounts.every((n) => Number.isInteger(n * 100))).toBe(true);
  });

  it('gives leftover satang to the first payer in id order (A 23.34, B/C 23.33)', () => {
    expect(p.A.amountThb).toBe(23.34);
    expect(p.B.amountThb).toBe(23.33);
    expect(p.C.amountThb).toBe(23.33);
  });
});

describe('computeFare — closed / unbooked seats pay 0', () => {
  const result = computeFare({
    mainRouteKm: 12,
    seats: [
      passenger('A'),
      passenger('B', { detourKm: 1.5 }),
      passenger('C'),
      { id: 'closed', open: false, booked: true },
      { id: 'empty', open: true, booked: false, detourKm: 9 },
    ],
  });
  const p = byId(result);

  it('charges only open+booked occupants; closed and unbooked are 0 even with detourKm', () => {
    expect(p.A.amountThb).toBe(28);
    expect(p.B.amountThb).toBe(49);
    expect(p.C.amountThb).toBe(28);
    expect(p.closed.amountThb).toBe(0);
    expect(p.empty.amountThb).toBe(0);
    expect(p.empty.breakdown).toEqual({ shareThb: 0, detourThb: 0 });
    expect(result.totalThb).toBe(105);
    expect(sumAmounts(result)).toBe(105);
  });
});

describe('computeFare — luggage is not an input', () => {
  it('has no luggage field; same seats/km produce the same fare', () => {
    const a = computeFare({
      mainRouteKm: 12,
      seats: [passenger('A'), passenger('B', { detourKm: 1.5 }), passenger('C')],
    });
    const b = computeFare({
      mainRouteKm: 12,
      seats: [passenger('A'), passenger('B', { detourKm: 1.5 }), passenger('C')],
    });
    expect(a).toEqual(b);
  });
});

describe('computeFare — validation', () => {
  it('rejects negative or non-finite km', () => {
    expect(() => computeFare({ mainRouteKm: -1, seats: [passenger('A')] })).toThrow(FareError);
    expect(() => computeFare({ mainRouteKm: -1, seats: [passenger('A')] })).toThrow(/mainRouteKm/);
    expect(() =>
      computeFare({ mainRouteKm: 1, seats: [passenger('A', { detourKm: -0.1 })] }),
    ).toThrow(/detourKm/);
    expect(() => computeFare({ mainRouteKm: Number.NaN, seats: [passenger('A')] })).toThrow(
      FareError,
    );
  });

  it('rejects zero payers (all closed or unbooked)', () => {
    expect(() =>
      computeFare({
        mainRouteKm: 12,
        seats: [
          { id: 'closed', open: false, booked: true },
          { id: 'empty', open: true, booked: false },
        ],
      }),
    ).toThrow(/seated occupant/);
    expect(() => computeFare({ mainRouteKm: 12, seats: [] })).toThrow(FareError);
  });
});

describe('splitSatang', () => {
  it('is independent of input order (id sort)', () => {
    const a = splitSatang(7000, ['C', 'A', 'B']);
    const b = splitSatang(7000, ['A', 'B', 'C']);
    expect(a).toEqual(b);
    expect(a.get('A')).toBe(2334);
    expect(a.get('B')).toBe(2333);
    expect(a.get('C')).toBe(2333);
  });
});
