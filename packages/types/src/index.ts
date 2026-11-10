export const ROLES = ['rider', 'driver', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Roles a mobile user may self-assign. Admin is dashboard-only. */
export const APP_ROLES = ['rider', 'driver'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const RIDE_STATUSES = [
  'requested',
  'accepted',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const VEHICLE_TYPES = ['car', 'bike'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export type Profile = {
  id: string;
  role: Role | null;
  full_name: string | null;
  phone: string | null;
  trip_pin_enabled: boolean;
  created_at: string;
  updated_at: string;
};

/** GET /me — Express, after a verified Supabase JWT. */
export type MeResponse = {
  id: string;
  role: Role | null;
  trip_pin_enabled: boolean;
};

export type Ride = {
  id: string;
  rider_id: string;
  driver_id: string | null;
  status: RideStatus;
  vehicle_type: VehicleType;
  pickup_lat: number;
  pickup_lng: number;
  pickup_label: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_label: string;
  route_distance_m: number | null;
  route_duration_s: number | null;
  route_polyline: string | null;
  fare_estimate: number | null;
  pin_required: boolean;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
};

/**
 * GET /rides/:id for the rider (or admin). `trip_pin` is never included for the driver.
 * PIN lives in `ride_pins`, not on `rides`.
 */
export type RideResponse = Ride & {
  trip_pin?: string | null;
};

/**
 * GET /rides/nearby and `nearby_requested_rides` clamp `radius_m` to this (10 km).
 * SQL and Express both enforce it.
 */
export const NEARBY_RIDES_MAX_RADIUS_M = 10_000;

/** Driver-queue `distance_m` is ceiled up to this bucket so ranging cannot recover exact pickup. */
export const NEARBY_DISTANCE_BUCKET_M = 250;

/** Driver matching queue. No rider_id, no dropoff, pickup rounded to ~3 decimals. `distance_m` is from the rounded pickup, then ceiled to `NEARBY_DISTANCE_BUCKET_M`. */
export type NearbyRide = {
  id: string;
  vehicle_type: VehicleType;
  pickup_lat: number;
  pickup_lng: number;
  route_distance_m: number | null;
  route_duration_s: number | null;
  distance_m: number;
};

export type DriverLocation = {
  driver_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  is_online: boolean;
  vehicle_type: VehicleType | null;
  updated_at: string;
};

export type CreateRideRequest = {
  pickup_lat: number;
  pickup_lng: number;
  pickup_label: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_label: string;
  vehicle_type: VehicleType;
  route_distance_m?: number | null;
  route_duration_s?: number | null;
  route_polyline?: string | null;
};

export type StartRideRequest = {
  pin?: string;
};

export type UpsertDriverLocationRequest = {
  lat: number;
  lng: number;
  heading?: number | null;
  is_online: boolean;
  vehicle_type?: VehicleType | null;
};

export type ApiErrorBody = {
  error: string;
  attempts_remaining?: number;
};

export function isRole(value: unknown): value is Role {
  return value === 'rider' || value === 'driver' || value === 'admin';
}

export function isAppRole(value: unknown): value is AppRole {
  return value === 'rider' || value === 'driver';
}

export function isRideStatus(value: unknown): value is RideStatus {
  return (RIDE_STATUSES as readonly string[]).includes(value as string);
}

export function isVehicleType(value: unknown): value is VehicleType {
  return value === 'car' || value === 'bike';
}

export { estimateFare } from './fare';
