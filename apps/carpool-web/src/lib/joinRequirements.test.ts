import { describe, expect, it } from 'vitest';
import { JOIN_REQUIREMENTS, firstJoinBlocker, type JoinGateInput } from './joinRequirements';

const ready: JoinGateInput = {
  authenticated: true,
  tripOpen: true,
  seatSelected: true,
  destPinned: true,
  routeStatus: 'ready',
  trunkOk: true,
  riskAccepted: true,
};

describe('firstJoinBlocker', () => {
  it('is a single ordered list that drives the hint and disabled state', () => {
    expect(JOIN_REQUIREMENTS.map((r) => r.id)).toEqual([
      'auth',
      'closed',
      'seat',
      'pin',
      'route',
      'trunk',
      'risk',
    ]);
    expect(firstJoinBlocker(ready)).toBeNull();
  });

  it('returns the first unmet requirement in order', () => {
    expect(firstJoinBlocker({ ...ready, authenticated: false })?.hint).toBe('เข้าสู่ระบบก่อน');
    expect(firstJoinBlocker({ ...ready, authenticated: false, tripOpen: false })?.hint).toBe(
      'เข้าสู่ระบบก่อน',
    );
    expect(firstJoinBlocker({ ...ready, tripOpen: false })?.hint).toBe('ทริปนี้ปิดรับแล้ว');
    expect(firstJoinBlocker({ ...ready, seatSelected: false })?.hint).toBe('เลือกที่นั่งก่อน');
    expect(firstJoinBlocker({ ...ready, destPinned: false })?.hint).toBe('ปักหมุดปลายทางของคุณ');
    expect(firstJoinBlocker({ ...ready, routeStatus: 'pending' })?.hint).toBe('กำลังคำนวณเส้นทาง…');
    expect(firstJoinBlocker({ ...ready, routeStatus: 'fallback' })).toBeNull();
    expect(firstJoinBlocker({ ...ready, trunkOk: false })?.hint).toBe('สัมภาระเกินที่ว่างท้ายรถ');
    expect(firstJoinBlocker({ ...ready, riskAccepted: false })?.hint).toBe('ติ๊กยอมรับความเสี่ยงก่อน');
  });
});
