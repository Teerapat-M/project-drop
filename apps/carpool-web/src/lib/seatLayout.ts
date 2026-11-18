import type { CSSProperties } from 'react';
import type { SeatPosition, VehicleType } from '../types';
import raw from './seat-layout.json';

export type SeatBox = { x: number; y: number; w: number; h: number };
export type SeatCode = '1A' | '1B' | '2A' | '2C' | '2B';

export type VehicleSeatLayout = {
  image: string;
  boardSizePx: number[];
  createBoardSizePx: number[];
  seatRadiusPx?: number;
  trunkRadiusPx?: number;
  seats: Partial<Record<SeatCode, SeatBox>>;
  trunk: SeatBox;
};

const layouts = raw.vehicles as unknown as Record<VehicleType, VehicleSeatLayout>;

export const SEAT_CODE_TO_POSITION: Record<Exclude<SeatCode, '1B'>, SeatPosition> = {
  '1A': 'front_passenger',
  '2A': 'rear_left',
  '2C': 'rear_middle',
  '2B': 'rear_right',
};

export function vehicleSeatLayout(vehicle: VehicleType): VehicleSeatLayout {
  return layouts[vehicle];
}

export function carTopdownSrc(vehicle: VehicleType): string {
  return `/assets/${layouts[vehicle].image}`;
}

export function boxStyle(box: SeatBox): CSSProperties {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  };
}
