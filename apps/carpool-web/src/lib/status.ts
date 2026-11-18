import type { TripStatus } from '../types';

export const STATUS_LABEL: Record<TripStatus, string> = {
  open: 'เปิดรับ',
  full: 'เต็มแล้ว',
  in_progress: 'กำลังเดินทาง',
  completed: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};
