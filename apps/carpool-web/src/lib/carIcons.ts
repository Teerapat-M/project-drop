import type { TripKind, VehicleType } from '../types';

/** Driver-chosen icon → file in /public/assets. Defaults match the M-B* boards. */
export const CAR_ICON_SRC: Record<string, string> = {
  sedan: '/assets/sedan_opt3.png',
  sedan_opt3: '/assets/sedan_opt3.png',
  sedan_opt1: '/assets/sedan_opt1.png',
  sedan_opt2: '/assets/sedan_opt2.png',
  hatch: '/assets/hatch_retro_3d.png',
  hatch_retro: '/assets/hatch_retro_3d.png',
  hatch_yellow: '/assets/hatch_retro_yellow.png',
  hatch_cream: '/assets/hatch_retro_cream.png',
  pickup: '/assets/pickup_3d.png',
  pickup_white: '/assets/pickup_white.png',
  pickup_navy: '/assets/pickup_navy.png',
  taxi: '/assets/taxi_sedan.png',
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  sedan: 'เก๋ง 4 ประตู',
  hatch: 'รถ 5 ประตู',
  pickup: 'กระบะ',
};

export const ICON_CHOICES: Record<VehicleType, { id: string; label: string }[]> = {
  sedan: [
    { id: 'sedan', label: 'ฟ้าน้ำแข็ง' },
    { id: 'sedan_opt1', label: 'เงิน' },
    { id: 'sedan_opt2', label: 'เทาเข้ม' },
  ],
  hatch: [
    { id: 'hatch', label: 'มิ้นท์' },
    { id: 'hatch_yellow', label: 'เหลือง' },
    { id: 'hatch_cream', label: 'ครีม' },
  ],
  pickup: [
    { id: 'pickup', label: 'แดง' },
    { id: 'pickup_white', label: 'ขาว' },
    { id: 'pickup_navy', label: 'กรมท่า' },
  ],
};

export function carPhotoSrc(input: {
  car_icon?: string | null;
  vehicle_type?: VehicleType | null;
  kind?: TripKind | null;
}): string {
  if (input.kind === 'taxi' || input.car_icon === 'taxi') return CAR_ICON_SRC.taxi;
  const key = input.car_icon ?? '';
  if (key in CAR_ICON_SRC) return CAR_ICON_SRC[key];
  if (input.vehicle_type === 'hatch') return CAR_ICON_SRC.hatch;
  if (input.vehicle_type === 'pickup') return CAR_ICON_SRC.pickup;
  return CAR_ICON_SRC.sedan;
}
