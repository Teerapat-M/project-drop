export type TripKind = 'taxi' | 'private';
export type VehicleType = 'sedan' | 'hatch' | 'pickup';
export type TripStatus = 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
export type SeatPosition = 'front_passenger' | 'rear_left' | 'rear_middle' | 'rear_right';
export type AddressKind = 'home' | 'work' | 'custom';

export type SeatState = {
  id: string;
  position: SeatPosition;
  is_open: boolean;
  is_booked: boolean;
  label?: string;
};

export type TripCard = {
  id: string;
  kind: TripKind;
  vehicle_type: VehicleType;
  car_icon: string;
  route_km: number;
  depart_at: string;
  status: TripStatus;
  pickup_label: string;
  dest_label: string;
  pickup_lat: number;
  pickup_lng: number;
  dest_lat: number;
  dest_lng: number;
  trunk_w_cm: number;
  trunk_h_cm: number;
  trunk_l_cm: number;
  open_seats: number;
  bookable_seats: number;
  owner_display_name: string;
  owner_id?: string;
};

export type TripStop = {
  seq: number;
  address: string;
  lat: number;
  lng: number;
};

export type PreviewLuggage = {
  height_cm: number;
  width_cm: number;
  depth_cm: number;
};

export type TripPreview = Omit<TripCard, 'open_seats' | 'bookable_seats'> & {
  seats: SeatState[];
  stops?: TripStop[];
  /** Booked luggage, anonymized, volume-desc. No rider ids. */
  luggage?: PreviewLuggage[];
};

export type BookingRow = {
  id: string;
  trip_id: string;
  rider_id: string;
  seat_id: string;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  detour_km: number;
  luggage_h_cm: number | null;
  luggage_w_cm: number | null;
  luggage_d_cm: number | null;
};

export type ChatMessage = {
  id: string;
  trip_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  mine?: boolean;
};

export type SavedAddress = {
  id: string;
  owner_id?: string;
  kind: AddressKind;
  label: string;
  address_text: string;
  lat: number;
  lng: number;
};
