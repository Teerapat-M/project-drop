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

export const SUPPORTED_LANGS = ['en', 'th', 'zh', 'ja'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** Ride statuses that still allow in-trip chat inserts. */
export const ACTIVE_CHAT_STATUSES: readonly RideStatus[] = [
  'accepted',
  'arrived',
  'in_progress',
];

export type Profile = {
  id: string;
  role: Role | null;
  full_name: string | null;
  phone: string | null;
  trip_pin_enabled: boolean;
  preferred_language: string | null;
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
export type RidePeer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  preferred_language: string | null;
};

export type RideResponse = Ride & {
  trip_pin?: string | null;
  peer?: RidePeer | null;
};

export type RideMessage = {
  id: string;
  ride_id: string;
  sender_id: string;
  original_text: string;
  translated_text: string | null;
  source_lang: string | null;
  target_lang: string | null;
  is_preset: boolean;
  preset_key: string | null;
  created_at: string;
};

export type SendMessageRequest = {
  text?: string;
  preset_key?: string;
};

export const CHAT_PRESET_KEYS = [
  'im_here',
  'on_my_way',
  'call_me',
  'ive_arrived',
  'traffic_5',
  'two_min',
  'cant_find_you',
] as const;
export type ChatPresetKey = (typeof CHAT_PRESET_KEYS)[number];

/** Static translations — never sent to a paid/quota provider. */
export const CHAT_PRESETS: Record<ChatPresetKey, Record<SupportedLang, string>> = {
  im_here: {
    en: "I'm here",
    th: 'ฉันอยู่ตรงนี้แล้ว',
    zh: '我到了',
    ja: '着きました',
  },
  on_my_way: {
    en: 'On my way',
    th: 'กำลังไปนะ',
    zh: '在路上',
    ja: '向かっています',
  },
  call_me: {
    en: 'Call me',
    th: 'โทรหาฉัน',
    zh: '打给我',
    ja: '電話してください',
  },
  ive_arrived: {
    en: "I've arrived",
    th: 'มาถึงแล้ว',
    zh: '我到了',
    ja: '到着しました',
  },
  traffic_5: {
    en: 'Traffic, 5 min',
    th: 'รถติด อีก 5 นาที',
    zh: '堵车，还有5分钟',
    ja: '渋滞です、あと5分',
  },
  two_min: {
    en: '2 min',
    th: 'อีก 2 นาที',
    zh: '2分钟',
    ja: 'あと2分',
  },
  cant_find_you: {
    en: "Can't find you",
    th: 'หาไม่เจอ',
    zh: '找不到你',
    ja: '見つかりません',
  },
};

export const RIDER_PRESET_KEYS: readonly ChatPresetKey[] = ['im_here', 'on_my_way', 'call_me'];
export const DRIVER_PRESET_KEYS: readonly ChatPresetKey[] = ['on_my_way', 'ive_arrived', 'traffic_5'];
export const DRIVER_LANDSCAPE_PRESET_KEYS: readonly ChatPresetKey[] = [
  'im_here',
  'two_min',
  'cant_find_you',
];

export function isChatPresetKey(value: unknown): value is ChatPresetKey {
  return typeof value === 'string' && (CHAT_PRESET_KEYS as readonly string[]).includes(value);
}

export function isActiveChatStatus(status: RideStatus): boolean {
  return (ACTIVE_CHAT_STATUSES as readonly string[]).includes(status);
}

export function normalizeLang(tag: string | null | undefined): SupportedLang {
  const base = (tag ?? 'en').trim().toLowerCase().split(/[-_]/)[0] ?? 'en';
  if (base === 'th' || base === 'zh' || base === 'ja' || base === 'en') return base;
  if (base === 'jp') return 'ja';
  if (base === 'cmn') return 'zh';
  return 'en';
}

export function detectLang(text: string): SupportedLang {
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(text)) return 'ja';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  return 'en';
}

export function presetText(key: ChatPresetKey, lang: SupportedLang): string {
  return CHAT_PRESETS[key][lang];
}

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

export function canSelectMessage(
  actor: { id: string; role: Role | null },
  ride: { rider_id: string; driver_id: string | null },
): boolean {
  if (actor.role === 'admin') return true;
  if (ride.rider_id === actor.id) return true;
  if (ride.driver_id === actor.id) return true;
  return false;
}

export function canInsertMessage(
  actor: { id: string; role: Role | null },
  ride: { rider_id: string; driver_id: string | null; status: RideStatus },
  senderId: string,
): boolean {
  if (senderId !== actor.id) return false;
  if (!isActiveChatStatus(ride.status)) return false;
  if (ride.rider_id === actor.id) return true;
  if (ride.driver_id === actor.id) return true;
  return false;
}

export { estimateFare } from './fare';
