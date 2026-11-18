export type JoinRouteStatus = 'idle' | 'pending' | 'ready' | 'fallback';

export type JoinGateInput = {
  authenticated: boolean;
  tripOpen: boolean;
  seatSelected: boolean;
  destPinned: boolean;
  routeStatus: JoinRouteStatus;
  maxDetourOk: boolean;
  maxDetourHint?: string;
  trunkOk: boolean;
  riskAccepted: boolean;
};

export const JOIN_REQUIREMENTS = [
  { id: 'auth', hint: 'เข้าสู่ระบบก่อน' },
  { id: 'closed', hint: 'ทริปนี้ปิดรับแล้ว' },
  { id: 'seat', hint: 'เลือกที่นั่งก่อน' },
  { id: 'pin', hint: 'ปักหมุดปลายทางของคุณ' },
  { id: 'route', hint: 'กำลังคำนวณเส้นทาง…' },
  { id: 'max_detour', hint: 'จุดลงนี้ออกนอกเส้นทางเกินที่กำหนด' },
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
    case 'max_detour':
      return input.maxDetourOk;
    case 'trunk':
      return input.trunkOk;
    case 'risk':
      return input.riskAccepted;
  }
}

/** First unmet join requirement, or null when the button may enable. */
export function firstJoinBlocker(
  input: JoinGateInput,
): { id: JoinRequirementId; hint: string } | null {
  const row = JOIN_REQUIREMENTS.find((r) => !met(r.id, input));
  if (!row) return null;
  if (row.id === 'max_detour' && input.maxDetourHint) {
    return { id: row.id, hint: input.maxDetourHint };
  }
  return { id: row.id, hint: row.hint };
}
