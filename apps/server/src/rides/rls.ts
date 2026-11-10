import type { NearbyRide, Ride, RideStatus, Role } from '@drop/types';

export type Actor = { id: string; role: Role | null };

export type RidePatch = {
  status?: RideStatus;
  driver_id?: string | null;
};

/** Table SELECT RLS: rider own, assigned driver, admin. Not the requested queue. */
export function canSelectRide(actor: Actor, ride: Ride): boolean {
  if (actor.role === 'admin') return true;
  if (ride.rider_id === actor.id) return true;
  if (ride.driver_id === actor.id) return true;
  return false;
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

/** accept_ride RPC: role=driver, not the rider, still requested. */
export function canAcceptRide(actor: Actor, ride: Ride): boolean {
  return (
    actor.role === 'driver' &&
    actor.id !== ride.rider_id &&
    ride.status === 'requested' &&
    ride.driver_id === null
  );
}

/** Rider WITH CHECK + trigger: cancel, or keep status/driver_id. */
export function canRiderMutate(actor: Actor, ride: Ride, patch: RidePatch): boolean {
  if (actor.id !== ride.rider_id) return false;
  const nextDriver = patch.driver_id === undefined ? ride.driver_id : patch.driver_id;
  const nextStatus = patch.status === undefined ? ride.status : patch.status;
  if (nextDriver !== ride.driver_id) return false;
  if (nextStatus !== ride.status && nextStatus !== 'cancelled') return false;
  return true;
}

/** verify_trip_pin / start: assigned driver, role=driver, not the rider. */
export function canVerifyTripPin(actor: Actor, ride: Ride): boolean {
  return (
    actor.role === 'driver' &&
    ride.driver_id === actor.id &&
    ride.driver_id !== ride.rider_id
  );
}

export function presentRidePin(actor: Actor, ride: Ride, pin: string | null): string | null | undefined {
  if (!canSelectRidePin(actor, ride)) return undefined;
  return pin;
}

export function roundPickup(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function toNearbyRide(ride: Ride, distanceM: number): NearbyRide {
  return {
    id: ride.id,
    vehicle_type: ride.vehicle_type,
    pickup_lat: roundPickup(ride.pickup_lat),
    pickup_lng: roundPickup(ride.pickup_lng),
    route_distance_m: ride.route_distance_m,
    route_duration_s: ride.route_duration_s,
    distance_m: Math.round(distanceM),
  };
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(s)));
}
