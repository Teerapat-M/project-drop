import { carPhotoSrc, VEHICLE_LABEL } from '../lib/carIcons';
import type { TripKind, VehicleType } from '../types';

type Props = {
  car_icon?: string | null;
  vehicle_type?: VehicleType | null;
  kind?: TripKind | null;
  alt?: string;
  className?: string;
};

export function CarPhoto({ car_icon, vehicle_type, kind, alt, className }: Props) {
  const src = carPhotoSrc({ car_icon, vehicle_type, kind });
  const label = alt ?? (vehicle_type ? VEHICLE_LABEL[vehicle_type] : 'รถ');
  return (
    <img
      src={src}
      alt={label}
      className={className ?? 'car-photo'}
      data-testid="car-photo"
      data-icon={car_icon ?? vehicle_type ?? 'sedan'}
      data-src={src}
    />
  );
}
