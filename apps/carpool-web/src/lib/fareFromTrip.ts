import { computeFare, type FareResult, type SeatInput } from '@drop/carpool-core';
import type { BookingRow, SeatState, TripKind } from '../types';

function vehicle(kind: TripKind) {
  return kind === 'taxi' ? 'taxi' : 'private_car';
}

/** Map open/booked seats + booking detours into carpool-core SeatInput. No extra fare math. */
export function fareSeatsFromOccupants(input: {
  kind: TripKind;
  seats: readonly SeatState[];
  bookings?: readonly BookingRow[];
}): SeatInput[] {
  const bySeatId = new Map((input.bookings ?? []).map((b) => [b.seat_id, b]));
  const seats: SeatInput[] = input.seats.map((s) => {
    const booking = bySeatId.get(s.id);
    return {
      id: booking?.id ?? s.id,
      open: s.is_open,
      booked: s.is_booked,
      detourKm: Number(booking?.detour_km ?? 0),
    };
  });
  if (input.kind === 'private') {
    seats.push({ id: 'driver', open: true, booked: true, role: 'owner_driver' });
  }
  return seats;
}

export function fareForTrip(input: {
  kind: TripKind;
  mainRouteKm: number;
  seats: readonly SeatState[];
  bookings?: readonly BookingRow[];
}): FareResult {
  return computeFare({
    vehicle: vehicle(input.kind),
    mainRouteKm: input.mainRouteKm,
    seats: fareSeatsFromOccupants(input),
  });
}

export function isWaitingStatus(status: string | undefined): boolean {
  return status === 'open' || status === 'full' || status === undefined;
}
