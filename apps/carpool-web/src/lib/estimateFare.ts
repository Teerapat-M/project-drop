import { computeFare, type FareResult, type SeatInput } from '@drop/carpool-core';
import type { TripKind } from '../types';

export const VIEWER_ID = 'viewer';
export const OWNER_DRIVER_ID = 'owner_driver';

export type SeatLike = {
  id: string;
  is_open: boolean;
  is_booked: boolean;
};

export type ViewerFareEstimate = {
  amountThb: number;
  payerCount: number;
  totalThb: number;
};

function vehicle(kind: TripKind) {
  return kind === 'taxi' ? 'taxi' : 'private_car';
}

/** Main-route preview from mini-map km. Luggage is ignored (not an argument). */
export function previewMainFare(mainRouteKm: number, kind: TripKind): FareResult {
  return computeFare({
    mainRouteKm,
    vehicle: vehicle(kind),
    seats:
      kind === 'taxi'
        ? [{ id: 'preview', open: true, booked: true }]
        : [{ id: 'driver', open: true, booked: true, role: 'owner_driver' }],
  });
}

/**
 * Pre-booking estimate via computeFare: current seated occupants
 * (open AND booked passengers, plus the private-car owner-driver)
 * plus the viewer occupying one more seat. Detour applies only to the viewer.
 */
export function estimateViewerFare(input: {
  mainRouteKm: number;
  kind: TripKind;
  bookedPassengerCount: number;
  detourKm?: number;
}): ViewerFareEstimate {
  const seats: SeatInput[] = [];
  if (input.kind === 'private') {
    seats.push({ id: OWNER_DRIVER_ID, open: true, booked: true, role: 'owner_driver' });
  }
  const booked = Math.max(0, input.bookedPassengerCount);
  for (let i = 0; i < booked; i += 1) {
    seats.push({ id: `booked-${i}`, open: true, booked: true });
  }
  seats.push({
    id: VIEWER_ID,
    open: true,
    booked: true,
    detourKm: input.detourKm ?? 0,
  });
  const result = computeFare({
    mainRouteKm: input.mainRouteKm,
    vehicle: vehicle(input.kind),
    seats,
  });
  const viewer = result.persons.find((p) => p.id === VIEWER_ID);
  const payerCount = result.persons.filter((p) => p.amountThb > 0 || p.ownerDriverCostSharing).length;
  return {
    amountThb: viewer?.amountThb ?? 0,
    payerCount,
    totalThb: result.totalThb,
  };
}

export function estimateViewerFareFromSeats(input: {
  mainRouteKm: number;
  kind: TripKind;
  seats: readonly SeatLike[];
  detourKm?: number;
}): ViewerFareEstimate {
  const bookedPassengerCount = input.seats.filter((s) => s.is_open && s.is_booked).length;
  return estimateViewerFare({
    mainRouteKm: input.mainRouteKm,
    kind: input.kind,
    bookedPassengerCount,
    detourKm: input.detourKm,
  });
}
