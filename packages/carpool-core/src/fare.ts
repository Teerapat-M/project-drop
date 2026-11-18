/**
 * เพื่อนร่วมทาง fare (Phase C1).
 *
 * Formula:
 *   mainFare = mainRouteKm * rate
 *   Taxi: split equally among seated PASSENGERS only (open AND booked).
 *     The taxi driver pays nothing and is not a payer.
 *   Private car: split equally among seated occupants (open AND booked),
 *     including the owner-driver (cost-sharing only, no wage).
 *   Closed or unbooked seats pay 0.
 *   Detour surcharge for a passenger-requested off-route stop:
 *     detourKm * 2 * rate, charged only to that passenger.
 *   Detour km are NOT part of mainRouteKm. Luggage does not affect fare.
 *
 * Money is computed in satang integers (1 THB = 100 satang). Leftover satang
 * from the equal split are given one-by-one to payers in ascending id order
 * so the amounts always sum to the rounded total.
 */

/** Default tariff; pass `rateThbPerKm` to override. */
export const RATE_THB_PER_KM = 7;

export type VehicleKind = 'taxi' | 'private_car';

export type SeatRole = 'passenger' | 'owner_driver';

export type SeatInput = {
  id: string;
  /** Seat is available (not folded/closed). */
  open: boolean;
  /** Occupant is booked into this seat. */
  booked: boolean;
  /**
   * Extra km for a stop this occupant requested off the main route.
   * Omitted / 0 = no detour. Ignored for non-payers.
   */
  detourKm?: number;
  /**
   * Private-car owner who is driving. Counts as a seated occupant when
   * open+booked on a private car; labelled cost-sharing / no wage.
   * On a taxi this seat is never a payer.
   */
  role?: SeatRole;
};

export type FareBreakdown = {
  shareThb: number;
  detourThb: number;
};

export type PersonFare = {
  id: string;
  amountThb: number;
  percentOfTotal: number;
  breakdown: FareBreakdown;
  /** True for the private-car owner-driver (cost-sharing only, no wage). */
  ownerDriverCostSharing: boolean;
};

export type ComputeFareInput = {
  mainRouteKm: number;
  seats: readonly SeatInput[];
  /** Taxi: passengers only. Private (default if omitted): driver counts. */
  vehicle?: VehicleKind;
  /** Override {@link RATE_THB_PER_KM}. */
  rateThbPerKm?: number;
};

export type FareResult = {
  rateThbPerKm: number;
  mainFareThb: number;
  totalThb: number;
  persons: PersonFare[];
};

export class FareError extends Error {
  readonly code: 'INVALID_DISTANCE' | 'INVALID_RATE' | 'ZERO_PAYERS' | 'DUPLICATE_ID';

  constructor(code: FareError['code'], message: string) {
    super(message);
    this.name = 'FareError';
    this.code = code;
  }
}

function satangFromThb(thb: number): number {
  return Math.round(thb * 100);
}

function thbFromSatang(satang: number): number {
  return satang / 100;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new FareError('INVALID_DISTANCE', `${label} must be a finite number ≥ 0`);
  }
}

function isPayer(seat: SeatInput, vehicle?: VehicleKind): boolean {
  if (!(seat.open && seat.booked)) return false;
  if (vehicle === 'taxi' && seat.role === 'owner_driver') return false;
  return true;
}

/**
 * Split `total` satang equally. Leftover 0..n-1 satang go to the first
 * `remainder` ids when sorted ascending (UTF-16). Non-listed ids are omitted.
 */
export function splitSatang(total: number, payerIds: readonly string[]): Map<string, number> {
  const n = payerIds.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  const sorted = [...payerIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const base = Math.trunc(total / n);
  const rem = total % n;
  sorted.forEach((id, i) => {
    out.set(id, base + (i < rem ? 1 : 0));
  });
  return out;
}

export function computeFare(input: ComputeFareInput): FareResult {
  const rate = input.rateThbPerKm ?? RATE_THB_PER_KM;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
    throw new FareError('INVALID_RATE', 'rateThbPerKm must be a finite number ≥ 0');
  }
  assertFiniteNonNegative(input.mainRouteKm, 'mainRouteKm');

  const ids = new Set<string>();
  for (const seat of input.seats) {
    if (ids.has(seat.id)) {
      throw new FareError('DUPLICATE_ID', `duplicate seat id: ${seat.id}`);
    }
    ids.add(seat.id);
    if (seat.detourKm !== undefined) {
      assertFiniteNonNegative(seat.detourKm, `detourKm (${seat.id})`);
    }
  }

  const payers = input.seats.filter((s) => isPayer(s, input.vehicle));
  if (payers.length === 0) {
    throw new FareError('ZERO_PAYERS', 'need at least one seated occupant (open AND booked)');
  }

  const mainFareSatang = satangFromThb(input.mainRouteKm * rate);
  const shareById = splitSatang(
    mainFareSatang,
    payers.map((s) => s.id),
  );

  let detourTotalSatang = 0;
  const detourById = new Map<string, number>();
  for (const seat of payers) {
    const detourKm = seat.detourKm ?? 0;
    const detourSatang = satangFromThb(detourKm * 2 * rate);
    detourById.set(seat.id, detourSatang);
    detourTotalSatang += detourSatang;
  }

  const totalSatang = mainFareSatang + detourTotalSatang;

  const persons: PersonFare[] = input.seats.map((seat) => {
    const ownerDriverCostSharing =
      seat.role === 'owner_driver' && input.vehicle !== 'taxi';
    if (!isPayer(seat, input.vehicle)) {
      return {
        id: seat.id,
        amountThb: 0,
        percentOfTotal: 0,
        breakdown: { shareThb: 0, detourThb: 0 },
        ownerDriverCostSharing,
      };
    }
    const shareSatang = shareById.get(seat.id) ?? 0;
    const detourSatang = detourById.get(seat.id) ?? 0;
    const amountSatang = shareSatang + detourSatang;
    const percentOfTotal = totalSatang === 0 ? 0 : (100 * amountSatang) / totalSatang;
    return {
      id: seat.id,
      amountThb: thbFromSatang(amountSatang),
      percentOfTotal,
      breakdown: {
        shareThb: thbFromSatang(shareSatang),
        detourThb: thbFromSatang(detourSatang),
      },
      ownerDriverCostSharing,
    };
  });

  return {
    rateThbPerKm: rate,
    mainFareThb: thbFromSatang(mainFareSatang),
    totalThb: thbFromSatang(totalSatang),
    persons,
  };
}
