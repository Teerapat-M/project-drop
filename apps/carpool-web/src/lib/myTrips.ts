import type { TripStatus } from '../types';

export function isPastTrip(
  trip: { depart_at: string; status: TripStatus },
  now = Date.now(),
): boolean {
  if (trip.status === 'completed' || trip.status === 'cancelled') return true;
  const at = new Date(trip.depart_at).getTime();
  return Number.isFinite(at) && at <= now;
}

export function splitMyTrips<T extends { depart_at: string; status: TripStatus }>(
  trips: readonly T[],
  now = Date.now(),
): { upcoming: T[]; past: T[] } {
  const upcoming = trips
    .filter((t) => !isPastTrip(t, now))
    .sort((a, b) => new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime());
  const past = trips
    .filter((t) => isPastTrip(t, now))
    .sort((a, b) => new Date(b.depart_at).getTime() - new Date(a.depart_at).getTime());
  return { upcoming, past };
}
