import { describe, expect, it } from 'vitest';
import { parseDetourKm } from './detourInput';

describe('parseDetourKm', () => {
  it('maps empty to 0 and keeps a finite non-negative number', () => {
    expect(parseDetourKm('', 3)).toBe(0);
    expect(parseDetourKm('   ', 3)).toBe(0);
    expect(parseDetourKm('0', 3)).toBe(0);
    expect(parseDetourKm('9', 3)).toBe(9);
    expect(parseDetourKm('1.5', 3)).toBe(1.5);
    expect(parseDetourKm(String(0.1 + 0.2), 3)).toBe(0.3);
    expect(parseDetourKm('0.1000000000000001', 3)).toBe(0.1);
  });

  it('keeps the last valid value for NaN or negative input', () => {
    expect(parseDetourKm('abc', 3)).toBe(3);
    expect(parseDetourKm('-1', 3)).toBe(3);
    expect(parseDetourKm('-0.2', 7)).toBe(7);
  });
});
