import { TAXI_TRUNK_PRESET } from '@drop/carpool-core';
import type { ChatMessage, SavedAddress, SeatState, TripCard, TripPreview } from './types';

const TAXI_ID = 'demo-taxi-12km';
const PRIVATE_ID = 'demo-private-12km';

export const DEMO_TRIPS: TripCard[] = [
  {
    id: 'demo-mint',
    kind: 'private',
    vehicle_type: 'sedan',
    car_icon: 'sedan',
    route_km: 32,
    depart_at: '2026-11-12T09:30:00+07:00',
    status: 'open',
    pickup_label: 'เชียงใหม่',
    dest_label: 'ลำพูน',
    pickup_lat: 18.788,
    pickup_lng: 98.985,
    dest_lat: 18.574,
    dest_lng: 99.009,
    trunk_w_cm: 100,
    trunk_h_cm: 50,
    trunk_l_cm: 50,
    open_seats: 2,
    bookable_seats: 4,
    owner_display_name: 'น้องมิ้นท์',
  },
  {
    id: 'demo-sam',
    kind: 'private',
    vehicle_type: 'hatch',
    car_icon: 'hatch',
    route_km: 150,
    depart_at: '2026-11-13T06:00:00+07:00',
    status: 'open',
    pickup_label: 'กรุงเทพฯ',
    dest_label: 'พัทยา',
    pickup_lat: 13.747,
    pickup_lng: 100.535,
    dest_lat: 12.933,
    dest_lng: 100.883,
    trunk_w_cm: 100,
    trunk_h_cm: 70,
    trunk_l_cm: 40,
    open_seats: 2,
    bookable_seats: 3,
    owner_display_name: 'ลุงแซม',
  },
  {
    id: 'demo-daeng',
    kind: 'private',
    vehicle_type: 'pickup',
    car_icon: 'pickup',
    route_km: 120,
    depart_at: '2026-11-14T09:00:00+07:00',
    status: 'open',
    pickup_label: 'ขอนแก่น',
    dest_label: 'อุดรธานี',
    pickup_lat: 16.432,
    pickup_lng: 102.836,
    dest_lat: 17.415,
    dest_lng: 102.787,
    trunk_w_cm: 140,
    trunk_h_cm: 40,
    trunk_l_cm: 150,
    open_seats: 1,
    bookable_seats: 3,
    owner_display_name: 'ป้าแดง',
  },
  {
    id: 'demo-arm',
    kind: 'private',
    vehicle_type: 'sedan',
    car_icon: 'sedan',
    route_km: 250,
    depart_at: '2026-11-15T07:30:00+07:00',
    status: 'full',
    pickup_label: 'กรุงเทพฯ',
    dest_label: 'นครราชสีมา',
    pickup_lat: 13.747,
    pickup_lng: 100.535,
    dest_lat: 14.97,
    dest_lng: 102.1,
    trunk_w_cm: 100,
    trunk_h_cm: 50,
    trunk_l_cm: 50,
    open_seats: 0,
    bookable_seats: 4,
    owner_display_name: 'บอสอาร์ม',
  },
  {
    id: TAXI_ID,
    kind: 'taxi',
    vehicle_type: 'sedan',
    car_icon: 'taxi',
    route_km: 12,
    depart_at: '2026-11-12T16:30:00+07:00',
    status: 'open',
    pickup_label: 'กรุงเทพฯ',
    dest_label: 'อยุธยา',
    pickup_lat: 13.75,
    pickup_lng: 100.5,
    dest_lat: 14.35,
    dest_lng: 100.57,
    trunk_w_cm: TAXI_TRUNK_PRESET.widthCm,
    trunk_h_cm: TAXI_TRUNK_PRESET.heightCm,
    trunk_l_cm: TAXI_TRUNK_PRESET.lengthCm,
    open_seats: 2,
    bookable_seats: 3,
    owner_display_name: 'โก้',
  },
  {
    id: PRIVATE_ID,
    kind: 'private',
    vehicle_type: 'sedan',
    car_icon: 'sedan',
    route_km: 12,
    depart_at: '2026-11-12T16:30:00+07:00',
    status: 'open',
    pickup_label: 'เชียงใหม่',
    dest_label: 'ลำพูน',
    pickup_lat: 18.788,
    pickup_lng: 98.985,
    dest_lat: 18.574,
    dest_lng: 99.009,
    trunk_w_cm: 100,
    trunk_h_cm: 50,
    trunk_l_cm: 50,
    open_seats: 3,
    bookable_seats: 4,
    owner_display_name: 'คุณเอ',
  },
];

export const DEMO_HISTORY: TripCard[] = [
  {
    id: 'demo-history-mint',
    kind: 'private',
    vehicle_type: 'sedan',
    car_icon: 'sedan',
    route_km: 32,
    depart_at: '2026-11-11T16:30:00+07:00',
    status: 'completed',
    pickup_label: 'เชียงใหม่',
    dest_label: 'ลำพูน',
    pickup_lat: 18.788,
    pickup_lng: 98.985,
    dest_lat: 18.574,
    dest_lng: 99.009,
    trunk_w_cm: 100,
    trunk_h_cm: 50,
    trunk_l_cm: 50,
    open_seats: 0,
    bookable_seats: 4,
    owner_display_name: 'น้องมิ้นท์',
  },
  {
    id: 'demo-history-sam',
    kind: 'private',
    vehicle_type: 'hatch',
    car_icon: 'hatch',
    route_km: 150,
    depart_at: '2026-11-08T06:00:00+07:00',
    status: 'cancelled',
    pickup_label: 'กรุงเทพฯ',
    dest_label: 'พัทยา',
    pickup_lat: 13.747,
    pickup_lng: 100.535,
    dest_lat: 12.933,
    dest_lng: 100.883,
    trunk_w_cm: 100,
    trunk_h_cm: 70,
    trunk_l_cm: 40,
    open_seats: 0,
    bookable_seats: 3,
    owner_display_name: 'ลุงแซม',
  },
];

function sedanSeats(card: TripCard): SeatState[] {
  return [
    {
      id: 's-fp',
      position: 'front_passenger',
      is_open: true,
      is_booked: card.id === 'demo-arm' || card.status === 'completed',
      label: card.id === 'demo-arm' ? 'บี' : card.kind === 'taxi' ? 'โก้' : undefined,
    },
    {
      id: 's-rl',
      position: 'rear_left',
      is_open: true,
      is_booked: card.open_seats < card.bookable_seats || card.status === 'completed',
      label: card.kind === 'taxi' ? 'โก้' : 'โก้',
    },
    {
      id: 's-rm',
      position: 'rear_middle',
      is_open: true,
      is_booked: card.status === 'full' || card.status === 'completed',
    },
    {
      id: 's-rr',
      position: 'rear_right',
      is_open: true,
      is_booked: card.status === 'full' || card.status === 'completed',
      label: card.status === 'full' || card.status === 'completed' ? 'คุณอ้อย' : undefined,
    },
  ];
}

function threeSeats(card: TripCard): SeatState[] {
  return [
    { id: 's-fp', position: 'front_passenger', is_open: true, is_booked: card.status === 'completed' },
    {
      id: 's-rl',
      position: 'rear_left',
      is_open: true,
      is_booked: true,
      label: 'น้องบิ๋ว',
    },
    {
      id: 's-rr',
      position: 'rear_right',
      is_open: true,
      is_booked: card.open_seats === 0 || card.status === 'cancelled' || card.status === 'completed',
    },
  ];
}

export function demoPreview(id: string): TripPreview | null {
  const card = DEMO_TRIPS.find((t) => t.id === id) ?? DEMO_HISTORY.find((t) => t.id === id);
  if (!card) return null;
  const seats = card.vehicle_type === 'sedan' ? sedanSeats(card) : threeSeats(card);
  // Booked bags only, volume-desc — not owner-first. Creator is not index 0.
  const luggage =
    card.kind === 'taxi'
      ? [
          { height_cm: 50, width_cm: 40, depth_cm: 25 },
          { height_cm: 40, width_cm: 30, depth_cm: 20 },
        ]
      : [];
  return { ...card, seats, stops: [], luggage };
}

export const FARE_TAXI_SEATS = [
  { id: 'A', open: true, booked: true, role: 'passenger' as const },
  { id: 'B', open: true, booked: true, role: 'passenger' as const, detourKm: 1.5 },
  { id: 'C', open: true, booked: true, role: 'passenger' as const },
];

export const FARE_PRIVATE_SEATS = [
  ...FARE_TAXI_SEATS,
  { id: 'driver', open: true, booked: true, role: 'owner_driver' as const },
];

export const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    trip_id: 'demo-mint',
    sender_id: 'you',
    sender_name: 'คุณ',
    body: 'สวัสดีครับ สนใจทริปเชียงใหม่–ลำพูนวันนี้',
    created_at: '2026-11-12T16:02:00+07:00',
    mine: true,
  },
  {
    id: 'm2',
    trip_id: 'demo-mint',
    sender_id: 'mint',
    sender_name: 'น้องมิ้นท์',
    body: 'สวัสดีค่ะ ยังว่าง 2 ที่ค่ะ',
    created_at: '2026-11-12T16:03:00+07:00',
  },
  {
    id: 'm3',
    trip_id: 'demo-mint',
    sender_id: 'you',
    sender_name: 'คุณ',
    body: 'รับที่เซ็นทรัลเฟสติวัลได้ไหมครับ',
    created_at: '2026-11-12T16:04:00+07:00',
    mine: true,
  },
];

export function demoMessagesFor(tripId: string): ChatMessage[] {
  const named = DEMO_MESSAGES.filter((m) => m.trip_id === tripId);
  if (named.length) return named;
  return DEMO_MESSAGES.map((m) => ({ ...m, trip_id: tripId }));
}

export const DEMO_ADDRESSES: SavedAddress[] = [
  {
    id: 'addr-home',
    kind: 'home',
    label: 'บ้าน',
    address_text: 'เชียงใหม่ · ใกล้เซ็นทรัลเฟสติวัล เลขที่ 123',
    lat: 18.788,
    lng: 98.985,
  },
  {
    id: 'addr-work',
    kind: 'work',
    label: 'ที่ทำงาน',
    address_text: 'ตลาดลำพูน · ไม่ใช้ตำแหน่งปัจจุบันของเครื่อง',
    lat: 18.574,
    lng: 99.009,
  },
];
