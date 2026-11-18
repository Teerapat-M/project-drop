import type { SeatPosition, SeatState } from '../types';

export function withSeatOpen(
  seats: SeatState[],
  position: SeatPosition,
  isOpen: boolean,
): SeatState[] {
  return seats.map((s) => (s.position === position ? { ...s, is_open: isOpen } : s));
}

export function thaiRpcError(message: string, fallback = 'ดำเนินการไม่สำเร็จ'): string {
  if (/[ก-๙]/.test(message)) return message;
  if (message.includes('cannot open/close a booked seat')) return 'ไม่สามารถเปิด/ปิดที่นั่งที่ถูกจองแล้ว';
  if (message.includes('only the trip owner')) return 'เฉพาะเจ้าของทริป';
  if (message.includes('not authenticated')) return 'ต้องเข้าสู่ระบบ';
  if (message.includes('seat not found')) return 'ไม่พบที่นั่ง';
  if (message.includes('trip not found')) return 'ไม่พบทริป';
  return fallback;
}
