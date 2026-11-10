import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  estimateFare,
  isVehicleType,
  type NearbyRide,
  type Ride,
  type RidePeer,
  type RideResponse,
  type Role,
  type VehicleType,
} from '@drop/types';
import { getSupabaseConfig } from '../config';
import { RideError } from './errors';
import { generateTripPin, PIN_MAX_ATTEMPTS, pinsMatch } from './pin';
import {
  canAcceptRide,
  canInsertRide,
  canSelectRide,
  canSelectRidePin,
  canVerifyTripPin,
  canWriteDriverLocation,
  clampNearbyRadiusM,
  haversineMeters,
  roundPickup,
  toNearbyRide,
  type Actor,
} from './rls';
import { canTransition } from './transitions';

export type RideActor = Actor & { token: string };

export type CreateRideInput = {
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

export type LocationInput = {
  lat: number;
  lng: number;
  heading?: number | null;
  is_online: boolean;
  vehicle_type?: VehicleType | null;
};

export type RideService = {
  create(actor: RideActor, input: CreateRideInput): Promise<RideResponse>;
  get(actor: RideActor, id: string): Promise<RideResponse>;
  list(actor: RideActor, status?: string): Promise<RideResponse[]>;
  listNearby(
    actor: RideActor,
    lat: number,
    lng: number,
    radiusM?: number,
  ): Promise<NearbyRide[]>;
  accept(actor: RideActor, id: string): Promise<RideResponse>;
  decline(actor: RideActor, id: string): Promise<{ declined: true }>;
  arrive(actor: RideActor, id: string): Promise<RideResponse>;
  start(actor: RideActor, id: string, pin?: string): Promise<RideResponse>;
  cancel(actor: RideActor, id: string): Promise<RideResponse>;
  upsertLocation(actor: RideActor, input: LocationInput): Promise<{
    driver_id: string;
    lat: number;
    lng: number;
    heading: number | null;
    is_online: boolean;
    vehicle_type: VehicleType | null;
    updated_at: string;
  }>;
};

type PinRow = { pin: string; attempts: number; verified_at: string | null };
type ProfileRow = {
  role: Role | null;
  trip_pin_enabled: boolean;
  full_name?: string | null;
  phone?: string | null;
  preferred_language?: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function requireDriverRole(actor: RideActor): void {
  if (actor.role !== 'driver') {
    throw new RideError('forbidden', 'driver role required');
  }
}

function requireAssignedDriver(actor: RideActor, ride: Ride): void {
  if (!canVerifyTripPin(actor, ride)) {
    throw new RideError('forbidden', 'not assigned driver');
  }
}

function present(actor: Actor, ride: Ride, pin: string | null, peer?: RidePeer | null): RideResponse {
  const body: RideResponse = { ...ride };
  if (canSelectRidePin(actor, ride) && pin) body.trip_pin = pin;
  if (peer) body.peer = peer;
  return body;
}

export function parseCreateRide(body: unknown): CreateRideInput {
  if (!body || typeof body !== 'object') throw new RideError('invalid', 'invalid body');
  const b = body as Record<string, unknown>;
  const num = (k: string): number => {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RideError('invalid', `${k} required`);
    return v;
  };
  const str = (k: string): string => {
    const v = b[k];
    if (typeof v !== 'string' || !v.trim()) throw new RideError('invalid', `${k} required`);
    return v.trim().slice(0, 200);
  };
  const pickup_lat = num('pickup_lat');
  const pickup_lng = num('pickup_lng');
  const dropoff_lat = num('dropoff_lat');
  const dropoff_lng = num('dropoff_lng');
  if (pickup_lat < -90 || pickup_lat > 90 || dropoff_lat < -90 || dropoff_lat > 90) {
    throw new RideError('invalid', 'latitude out of range');
  }
  if (pickup_lng < -180 || pickup_lng > 180 || dropoff_lng < -180 || dropoff_lng > 180) {
    throw new RideError('invalid', 'longitude out of range');
  }
  if (!isVehicleType(b.vehicle_type)) throw new RideError('invalid', 'vehicle_type must be car or bike');
  const optInt = (k: string): number | null => {
    const v = b[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RideError('invalid', `${k} invalid`);
    return Math.round(v);
  };
  const poly = b.route_polyline;
  return {
    pickup_lat,
    pickup_lng,
    pickup_label: str('pickup_label'),
    dropoff_lat,
    dropoff_lng,
    dropoff_label: str('dropoff_label'),
    vehicle_type: b.vehicle_type,
    route_distance_m: optInt('route_distance_m'),
    route_duration_s: optInt('route_duration_s'),
    route_polyline: typeof poly === 'string' ? poly.slice(0, 20000) : null,
  };
}

function fareNull(input: CreateRideInput): number | null {
  return estimateFare(input.route_distance_m ?? 0, input.route_duration_s ?? 0, input.vehicle_type);
}

type MemoryState = {
  rides: Map<string, Ride>;
  pins: Map<string, PinRow>;
  profiles: Map<string, ProfileRow>;
  locations: Map<string, LocationInput & { driver_id: string; updated_at: string }>;
  seq: number;
};

export function createMemoryRideService(
  seed: { profiles?: Record<string, ProfileRow> } = {},
): RideService & { state: MemoryState } {
  const state: MemoryState = {
    rides: new Map(),
    pins: new Map(),
    profiles: new Map(Object.entries(seed.profiles ?? {})),
    locations: new Map(),
    seq: 0,
  };

  const profileOf = (id: string): ProfileRow =>
    state.profiles.get(id) ?? { role: null, trip_pin_enabled: false };

  const peerOf = (actor: RideActor, ride: Ride): RidePeer | null => {
    const otherId = actor.id === ride.rider_id ? ride.driver_id : ride.rider_id;
    if (!otherId) return null;
    const p = profileOf(otherId);
    return {
      id: otherId,
      full_name: p.full_name ?? null,
      phone: p.phone ?? null,
      preferred_language: p.preferred_language ?? null,
    };
  };

  const getRide = (id: string): Ride => {
    const ride = state.rides.get(id);
    if (!ride) throw new RideError('not_found', 'ride not found');
    return ride;
  };

  const save = (ride: Ride): Ride => {
    const next = { ...ride, updated_at: nowIso() };
    state.rides.set(next.id, next);
    return next;
  };

  const service: RideService & { state: MemoryState } = {
    state,
    async create(actor, input) {
      if (!canInsertRide(actor, actor.id)) throw new RideError('forbidden', 'rider role required');
      state.seq += 1;
      const t = nowIso();
      const ride: Ride = {
        id: `ride-${state.seq}`,
        rider_id: actor.id,
        driver_id: null,
        status: 'requested',
        vehicle_type: input.vehicle_type,
        pickup_lat: input.pickup_lat,
        pickup_lng: input.pickup_lng,
        pickup_label: input.pickup_label,
        dropoff_lat: input.dropoff_lat,
        dropoff_lng: input.dropoff_lng,
        dropoff_label: input.dropoff_label,
        route_distance_m: input.route_distance_m ?? null,
        route_duration_s: input.route_duration_s ?? null,
        route_polyline: input.route_polyline ?? null,
        fare_estimate: fareNull(input),
        pin_required: false,
        created_at: t,
        updated_at: t,
        accepted_at: null,
        started_at: null,
        cancelled_at: null,
        completed_at: null,
      };
      state.rides.set(ride.id, ride);
      return present(actor, ride, null, peerOf(actor, ride));
    },
    async get(actor, id) {
      const ride = getRide(id);
      if (!canSelectRide(actor, ride)) throw new RideError('not_found', 'ride not found');
      const pin = state.pins.get(id)?.pin ?? null;
      return present(actor, ride, pin, peerOf(actor, ride));
    },
    async list(actor, status) {
      const out: RideResponse[] = [];
      for (const ride of state.rides.values()) {
        if (status && ride.status !== status) continue;
        if (!canSelectRide(actor, ride)) continue;
        const pin = state.pins.get(ride.id)?.pin ?? null;
        out.push(present(actor, ride, pin, peerOf(actor, ride)));
      }
      return out;
    },
    async listNearby(actor, lat, lng, radiusM = 5000) {
      requireDriverRole(actor);
      const origin = { lat, lng };
      const radius = clampNearbyRadiusM(radiusM);
      const out: NearbyRide[] = [];
      for (const ride of state.rides.values()) {
        if (ride.status !== 'requested' || ride.driver_id !== null) continue;
        if (ride.rider_id === actor.id) continue;
        const rounded = { lat: roundPickup(ride.pickup_lat), lng: roundPickup(ride.pickup_lng) };
        const rawM = haversineMeters(origin, rounded);
        if (rawM > radius) continue;
        out.push(toNearbyRide(ride, origin));
      }
      return out.sort((a, b) => a.distance_m - b.distance_m);
    },
    async accept(actor, id) {
      const ride = getRide(id);
      if (!canAcceptRide(actor, ride)) {
        if (actor.role !== 'driver' || actor.id === ride.rider_id) {
          throw new RideError('forbidden', 'driver role required');
        }
        throw new RideError('conflict', 'ride already taken');
      }
      const rider = profileOf(ride.rider_id);
      const pinOn = rider.trip_pin_enabled === true;
      if (pinOn) {
        state.pins.set(id, { pin: generateTripPin(), attempts: 0, verified_at: null });
      }
      const next = save({
        ...ride,
        status: 'accepted',
        driver_id: actor.id,
        pin_required: pinOn,
        accepted_at: nowIso(),
      });
      return present(actor, next, null, peerOf(actor, next));
    },
    async decline(actor, id) {
      requireDriverRole(actor);
      const ride = state.rides.get(id);
      if (!ride) throw new RideError('not_found', 'ride not found');
      if (ride.driver_id === actor.id || ride.status !== 'requested') {
        throw new RideError('conflict', 'ride already taken');
      }
      return { declined: true };
    },
    async arrive(actor, id) {
      const ride = getRide(id);
      if (!canTransition(ride.status, 'arrived')) throw new RideError('conflict', 'invalid_transition');
      requireAssignedDriver(actor, ride);
      const arrived = save({ ...ride, status: 'arrived' });
      return present(actor, arrived, null, peerOf(actor, arrived));
    },
    async start(actor, id, pin) {
      const ride = getRide(id);
      if (!canTransition(ride.status, 'in_progress')) throw new RideError('conflict', 'invalid_transition');
      requireAssignedDriver(actor, ride);
      if (ride.pin_required) {
        const row = state.pins.get(id);
        if (!row) throw new RideError('pin_required', 'trip pin required');
        if (row.verified_at) {
          /* already verified */
        } else if (row.attempts >= PIN_MAX_ATTEMPTS) {
          throw new RideError('pin_locked', 'too many pin attempts', { attempts_remaining: 0 });
        } else if (!pin || !pinsMatch(row.pin, pin)) {
          row.attempts += 1;
          if (row.attempts >= PIN_MAX_ATTEMPTS) {
            throw new RideError('pin_locked', 'too many pin attempts', { attempts_remaining: 0 });
          }
          throw new RideError('invalid_pin', 'invalid pin', {
            attempts_remaining: PIN_MAX_ATTEMPTS - row.attempts,
          });
        } else {
          row.verified_at = nowIso();
        }
      }
      const started = save({ ...ride, status: 'in_progress', started_at: nowIso() });
      return present(actor, started, null, peerOf(actor, started));
    },
    async cancel(actor, id) {
      const ride = getRide(id);
      const isRider = ride.rider_id === actor.id;
      const isDriver = ride.driver_id === actor.id;
      if (!isRider && !isDriver && actor.role !== 'admin') {
        throw new RideError('forbidden', 'cannot cancel');
      }
      if (!canTransition(ride.status, 'cancelled')) throw new RideError('conflict', 'invalid_transition');
      const cancelled = save({ ...ride, status: 'cancelled', cancelled_at: nowIso() });
      return present(actor, cancelled, state.pins.get(id)?.pin ?? null, peerOf(actor, cancelled));
    },
    async upsertLocation(actor, input) {
      if (!canWriteDriverLocation(actor, actor.id)) {
        throw new RideError('forbidden', 'driver role required');
      }
      const row = {
        driver_id: actor.id,
        lat: input.lat,
        lng: input.lng,
        heading: input.heading ?? null,
        is_online: input.is_online,
        vehicle_type: input.vehicle_type ?? null,
        updated_at: nowIso(),
      };
      state.locations.set(actor.id, row);
      return row;
    },
  };
  return service;
}

function userClient(token: string): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) throw new RideError('invalid', 'supabase is not configured');
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function asRide(row: Ride): Ride {
  return {
    ...row,
    fare_estimate: row.fare_estimate === undefined ? null : row.fare_estimate,
    pin_required: row.pin_required === true,
  };
}

async function loadPin(supabase: SupabaseClient, rideId: string): Promise<string | null> {
  const { data } = await supabase.from('ride_pins').select('pin').eq('ride_id', rideId).maybeSingle();
  const pin = (data as { pin?: string } | null)?.pin;
  return typeof pin === 'string' ? pin : null;
}

async function loadPeer(supabase: SupabaseClient, rideId: string): Promise<RidePeer | null> {
  const { data } = await supabase.rpc('ride_peer', { p_ride_id: rideId });
  if (!data || typeof data !== 'object') return null;
  const row = data as { id?: unknown; full_name?: unknown; phone?: unknown; preferred_language?: unknown };
  if (typeof row.id !== 'string') return null;
  return {
    id: row.id,
    full_name: typeof row.full_name === 'string' ? row.full_name : null,
    phone: typeof row.phone === 'string' ? row.phone : null,
    preferred_language: typeof row.preferred_language === 'string' ? row.preferred_language : null,
  };
}

export function createSupabaseRideService(): RideService {
  return {
    async create(actor, input) {
      if (!canInsertRide(actor, actor.id)) throw new RideError('forbidden', 'rider role required');
      const supabase = userClient(actor.token);
      const { data, error } = await supabase
        .from('rides')
        .insert({
          rider_id: actor.id,
          status: 'requested',
          vehicle_type: input.vehicle_type,
          pickup_lat: input.pickup_lat,
          pickup_lng: input.pickup_lng,
          pickup_label: input.pickup_label,
          dropoff_lat: input.dropoff_lat,
          dropoff_lng: input.dropoff_lng,
          dropoff_label: input.dropoff_label,
          route_distance_m: input.route_distance_m ?? null,
          route_duration_s: input.route_duration_s ?? null,
          route_polyline: input.route_polyline ?? null,
          fare_estimate: fareNull(input),
        })
        .select()
        .single();
      if (error || !data) throw new RideError('invalid', error?.message ?? 'create failed');
      return present(actor, asRide(data as Ride), null);
    },
    async get(actor, id) {
      const supabase = userClient(actor.token);
      const { data, error } = await supabase.from('rides').select('*').eq('id', id).maybeSingle();
      if (error) throw new RideError('invalid', error.message);
      if (!data) throw new RideError('not_found', 'ride not found');
      const ride = asRide(data as Ride);
      if (!canSelectRide(actor, ride)) throw new RideError('not_found', 'ride not found');
      const pin = await loadPin(supabase, id);
      const peer = await loadPeer(supabase, id);
      return present(actor, ride, pin, peer);
    },
    async list(actor, status) {
      const supabase = userClient(actor.token);
      let q = supabase.from('rides').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new RideError('invalid', error.message);
      const rows = (data ?? []) as Ride[];
      return rows.filter((r) => canSelectRide(actor, asRide(r))).map((r) => present(actor, asRide(r), null));
    },
    async listNearby(actor, lat, lng, radiusM = 5000) {
      requireDriverRole(actor);
      const supabase = userClient(actor.token);
      const { data, error } = await supabase.rpc('nearby_requested_rides', {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: clampNearbyRadiusM(radiusM),
      });
      if (error) throw new RideError('invalid', error.message);
      return (data ?? []) as NearbyRide[];
    },
    async accept(actor, id) {
      requireDriverRole(actor);
      const supabase = userClient(actor.token);
      const { data, error } = await supabase.rpc('accept_ride', { p_ride_id: id }).maybeSingle();
      if (error) throw new RideError('conflict', error.message);
      if (!data) throw new RideError('conflict', 'ride already taken');
      const ride = asRide(data as Ride);
      const peer = await loadPeer(supabase, id);
      return present(actor, ride, null, peer);
    },
    async decline(actor, id) {
      requireDriverRole(actor);
      void id;
      return { declined: true };
    },
    async arrive(actor, id) {
      requireDriverRole(actor);
      const supabase = userClient(actor.token);
      const { data, error } = await supabase
        .from('rides')
        .update({ status: 'arrived' })
        .eq('id', id)
        .eq('driver_id', actor.id)
        .eq('status', 'accepted')
        .select()
        .maybeSingle();
      if (error) throw new RideError('conflict', error.message);
      if (!data) throw new RideError('conflict', 'invalid_transition');
      const ride = asRide(data as Ride);
      return present(actor, ride, null, await loadPeer(supabase, id));
    },
    async start(actor, id, pin) {
      requireDriverRole(actor);
      const supabase = userClient(actor.token);
      const { data: current, error: loadErr } = await supabase
        .from('rides')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (loadErr || !current) throw new RideError('not_found', 'ride not found');
      const ride = asRide(current as Ride);
      if (!canTransition(ride.status, 'in_progress')) throw new RideError('conflict', 'invalid_transition');
      requireAssignedDriver(actor, ride);
      if (ride.pin_required) {
        const { data, error } = await supabase.rpc('verify_trip_pin', { p_ride_id: id, p_pin: pin ?? '' });
        if (error) throw new RideError('invalid', error.message);
        const result = data as { ok?: boolean; locked?: boolean; attempts_remaining?: number } | null;
        if (result?.locked) {
          throw new RideError('pin_locked', 'too many pin attempts', { attempts_remaining: 0 });
        }
        if (!result?.ok) {
          throw new RideError('invalid_pin', 'invalid pin', {
            attempts_remaining: result?.attempts_remaining,
          });
        }
      }
      const { data, error } = await supabase
        .from('rides')
        .update({ status: 'in_progress' })
        .eq('id', id)
        .eq('driver_id', actor.id)
        .in('status', ['accepted', 'arrived'])
        .select()
        .maybeSingle();
      if (error) throw new RideError('conflict', error.message);
      if (!data) throw new RideError('conflict', 'invalid_transition');
      const started = asRide(data as Ride);
      return present(actor, started, null, await loadPeer(supabase, id));
    },
    async cancel(actor, id) {
      const supabase = userClient(actor.token);
      const { data: current, error: loadErr } = await supabase
        .from('rides')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (loadErr || !current) throw new RideError('not_found', 'ride not found');
      const ride = asRide(current as Ride);
      const isRider = ride.rider_id === actor.id;
      const isDriver = ride.driver_id === actor.id;
      if (!isRider && !isDriver && actor.role !== 'admin') {
        throw new RideError('forbidden', 'cannot cancel');
      }
      if (!canTransition(ride.status, 'cancelled')) throw new RideError('conflict', 'invalid_transition');
      const { data, error } = await supabase
        .from('rides')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error || !data) throw new RideError('conflict', error?.message ?? 'cancel failed');
      const pin = await loadPin(supabase, id);
      const peer = await loadPeer(supabase, id);
      return present(actor, asRide(data as Ride), pin, peer);
    },
    async upsertLocation(actor, input) {
      if (!canWriteDriverLocation(actor, actor.id)) {
        throw new RideError('forbidden', 'driver role required');
      }
      const supabase = userClient(actor.token);
      const row = {
        driver_id: actor.id,
        lat: input.lat,
        lng: input.lng,
        heading: input.heading ?? null,
        is_online: input.is_online,
        vehicle_type: input.vehicle_type ?? null,
        updated_at: nowIso(),
      };
      const { data, error } = await supabase.from('driver_locations').upsert(row).select().single();
      if (error) throw new RideError('invalid', error.message);
      return data as typeof row;
    },
  };
}
