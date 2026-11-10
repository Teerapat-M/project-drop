import type { Ride, Role } from '@drop/types';

export type Actor = { id: string; role: Role | null };

/** Mirrors rides SELECT RLS. Nearby filtering is not here — do it in the API/RPC. */
export function canSelectRide(actor: Actor, ride: Ride): boolean {
  if (actor.role === 'admin') return true;
  if (ride.rider_id === actor.id) return true;
  if (ride.driver_id === actor.id) return true;
  return actor.role === 'driver' && ride.status === 'requested';
}

export function canSelectRidePin(actor: Actor, ride: Ride): boolean {
  if (actor.role === 'admin') return true;
  return ride.rider_id === actor.id;
}

export function canInsertRide(actor: Actor, riderId: string): boolean {
  if (actor.role === 'admin') return true;
  return actor.role === 'rider' && actor.id === riderId;
}

export function canWriteDriverLocation(actor: Actor, driverId: string): boolean {
  if (actor.role === 'admin') return true;
  return actor.role === 'driver' && actor.id === driverId;
}

export function presentRidePin(actor: Actor, ride: Ride, pin: string | null): string | null | undefined {
  if (!canSelectRidePin(actor, ride)) return undefined;
  return pin;
}
