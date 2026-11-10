import { timingSafeEqual, randomInt } from 'node:crypto';

export const PIN_MAX_ATTEMPTS = 5;

export function generateTripPin(): string {
  return randomInt(0, 10000).toString().padStart(4, '0');
}

export function pinsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
