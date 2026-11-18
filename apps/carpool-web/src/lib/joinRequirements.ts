export type JoinRouteStatus = 'idle' | 'pending' | 'ready' | 'fallback';

export type JoinGateInput = {
  authenticated: boolean;
  tripOpen: boolean;
  seatSelected: boolean;
  destPinned: boolean;
  routeStatus: JoinRouteStatus;
  trunkOk: boolean;
  riskAccepted: boolean;
};

export const JOIN_REQUIREMENTS = [
  { id: 'auth', hint: 'เข้าสู่ระบบก่อน' },
  { id: 'closed', hint: 'ทริปนี้ปิดรับแล้ว' },
  { id: 'seat', hint: 'เลือกที่นั่งก่อน' },
  { id: 'pin', hint: 'ปักหมุดปลายทางของคุณ' },
  { id: 'route', hint: 'กำลังคำนวณเส้นทาง…' },
  { id: 'trunk', hint: 'สัมภาระเกินที่ว่างท้ายรถ' },
  { id: 'risk', hint: 'ติ๊กยอมรับความเสี่ยงก่อน' },
] as const;

export type JoinRequirementId = (typeof JOIN_REQUIREMENTS)[number]['id'];

function met(id: JoinRequirementId, input: JoinGateInput): boolean {
  switch (id) {
    case 'auth':
      return input.authenticated;
    case 'closed':
      return input.tripOpen;
    case 'seat':
      return input.seatSelected;
    case 'pin':
      return input.destPinned;
    case 'route':
      return input.routeStatus !== 'pending';
    case 'trunk':
      return input.trunkOk;
    case 'risk':
      return input.riskAccepted;
  }
}

/** First unmet join requirement, or null when the button may enable. */
export function firstJoinBlocker(input: JoinGateInput): (typeof JOIN_REQUIREMENTS)[number] | null {
  return JOIN_REQUIREMENTS.find((row) => !met(row.id, input)) ?? null;
}
