import { describe, expect, it } from 'vitest';
import { carPhotoSrc } from './carIcons';

describe('carPhotoSrc', () => {
  it('maps sedan to ice-blue sedan_opt3, hatch to mint Good Cat, pickup to red pickup_3d', () => {
    expect(carPhotoSrc({ vehicle_type: 'sedan', car_icon: 'sedan' })).toBe('/assets/sedan_opt3.png');
    expect(carPhotoSrc({ vehicle_type: 'hatch', car_icon: 'hatch' })).toBe('/assets/hatch_retro_3d.png');
    expect(carPhotoSrc({ vehicle_type: 'pickup', car_icon: 'pickup' })).toBe('/assets/pickup_3d.png');
    expect(carPhotoSrc({ kind: 'taxi' })).toBe('/assets/taxi_sedan.png');
  });
});
