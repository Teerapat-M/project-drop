import { describe, expect, it } from '@jest/globals';
import { DEFAULT_MODE, parseMode, serializeMode, toggleMode } from './mode';

describe('mode-switch logic', () => {
  it('defaults unknown or empty values to rider', () => {
    expect(parseMode(null)).toBe('rider');
    expect(parseMode(undefined)).toBe(DEFAULT_MODE);
    expect(parseMode('')).toBe('rider');
    expect(parseMode('admin')).toBe('rider');
  });

  it('persists a round-trip through serialize/parse', () => {
    expect(parseMode(serializeMode('driver'))).toBe('driver');
    expect(parseMode(serializeMode('rider'))).toBe('rider');
  });

  it('toggles rider ↔ driver', () => {
    expect(toggleMode('rider')).toBe('driver');
    expect(toggleMode('driver')).toBe('rider');
    expect(toggleMode(toggleMode('rider'))).toBe('rider');
  });
});
