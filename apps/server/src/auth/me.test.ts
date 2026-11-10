import { describe, expect, it } from '@jest/globals';
import { toMeResponse } from './me';

describe('toMeResponse', () => {
  it('maps role and trip_pin_enabled', () => {
    expect(toMeResponse('u1', { role: 'rider', trip_pin_enabled: true })).toEqual({
      id: 'u1',
      role: 'rider',
      trip_pin_enabled: true,
    });
  });

  it('defaults missing profile and flag to null / false', () => {
    expect(toMeResponse('u1', null)).toEqual({
      id: 'u1',
      role: null,
      trip_pin_enabled: false,
    });
    expect(toMeResponse('u1', { role: 'driver' })).toEqual({
      id: 'u1',
      role: 'driver',
      trip_pin_enabled: false,
    });
  });
});
