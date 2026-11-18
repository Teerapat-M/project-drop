import { describe, expect, it } from 'vitest';
import { thaiRpcError, withSeatOpen } from './seatRpc';
import type { SeatState } from '../types';

const seats: SeatState[] = [
  { id: '1', position: 'front_passenger', is_open: true, is_booked: false },
  { id: '2', position: 'rear_middle', is_open: true, is_booked: false },
];

describe('seatRpc', () => {
  it('maps seat-open RPC errors to Thai', () => {
    expect(thaiRpcError('cannot open/close a booked seat', 'ปิดที่นั่งไม่สำเร็จ')).toBe(
      'ไม่สามารถเปิด/ปิดที่นั่งที่ถูกจองแล้ว',
    );
    expect(thaiRpcError('only the trip owner', 'ปิดที่นั่งไม่สำเร็จ')).toBe('เฉพาะเจ้าของทริป');
    expect(thaiRpcError('not authenticated')).toBe('ต้องเข้าสู่ระบบ');
    expect(thaiRpcError('ที่นั่งนี้ปิดอยู่')).toBe('ที่นั่งนี้ปิดอยู่');
    expect(thaiRpcError('boom', 'ปิดที่นั่งไม่สำเร็จ')).toBe('ปิดที่นั่งไม่สำเร็จ');
  });

  it('withSeatOpen only flips the named seat', () => {
    const next = withSeatOpen(seats, 'rear_middle', false);
    expect(next.find((s) => s.position === 'rear_middle')?.is_open).toBe(false);
    expect(next.find((s) => s.position === 'front_passenger')?.is_open).toBe(true);
  });
});
