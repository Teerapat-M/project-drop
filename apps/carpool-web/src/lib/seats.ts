import type { SeatPosition, VehicleType } from '../types';

export const SEAT_LABELS: Record<SeatPosition, string> = {
  front_passenger: 'ข้างคนขับ',
  rear_left: 'หลังซ้าย',
  rear_middle: 'หลังกลาง',
  rear_right: 'หลังขวา',
};

export function positionsFor(vehicle: VehicleType): SeatPosition[] {
  if (vehicle === 'sedan') {
    return ['front_passenger', 'rear_left', 'rear_middle', 'rear_right'];
  }
  return ['front_passenger', 'rear_left', 'rear_right'];
}

export function seatCode(position: SeatPosition): string {
  switch (position) {
    case 'front_passenger':
      return '1A';
    case 'rear_left':
      return '2A';
    case 'rear_middle':
      return '2C';
    case 'rear_right':
      return '2B';
  }
}
