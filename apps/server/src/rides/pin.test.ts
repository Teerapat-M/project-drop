import { describe, expect, it } from '@jest/globals';
import { estimateFare } from '@drop/types';
import { generateTripPin, pinsMatch } from './pin';
import { canTransition } from './transitions';

describe('estimateFare stub', () => {
  it('returns null for any inputs (TODO fare-formula)', () => {
    expect(estimateFare(9800, 1440, 'car')).toBeNull();
    expect(estimateFare(0, 0, 'bike')).toBeNull();
  });
});

describe('trip PIN', () => {
  it('generates a 4-digit PIN', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateTripPin()).toMatch(/^\d{4}$/);
    }
  });

  it('compares PINs without throwing on length mismatch', () => {
    expect(pinsMatch('4821', '4821')).toBe(true);
    expect(pinsMatch('4821', '0000')).toBe(false);
    expect(pinsMatch('4821', '482')).toBe(false);
  });
});

describe('status transitions', () => {
  it('allows the documented path and rejects skips', () => {
    expect(canTransition('requested', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'in_progress')).toBe(true);
    expect(canTransition('requested', 'in_progress')).toBe(false);
    expect(canTransition('completed', 'cancelled')).toBe(false);
  });
});
