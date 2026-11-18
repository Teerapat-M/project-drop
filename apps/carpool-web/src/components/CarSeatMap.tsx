import type { SeatPosition, SeatState, VehicleType } from '../types';
import { SEAT_LABELS, seatCode } from '../lib/seats';

type Props = {
  vehicle: VehicleType;
  seats: SeatState[];
  selected?: string | null;
  onSelect?: (position: SeatState['position']) => void;
  onToggleOpen?: (position: SeatState['position'], isOpen: boolean) => void;
  driverLabel?: string;
  ownPosition?: SeatPosition | null;
};

export function CarSeatMap({
  vehicle,
  seats,
  selected,
  onSelect,
  onToggleOpen,
  driverLabel = 'คนขับ',
  ownPosition,
}: Props) {
  const byPos = Object.fromEntries(seats.map((s) => [s.position, s]));
  const hasMiddle = vehicle === 'sedan';

  return (
    <div className={`seat-map seat-map-${vehicle}`} data-testid="seat-map">
      <svg viewBox="0 0 220 420" aria-hidden className="seat-map-body">
        <defs>
          <linearGradient id="carBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3d24a" />
            <stop offset="1" stopColor="#e2b52a" />
          </linearGradient>
          <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c8d6e0" />
            <stop offset="1" stopColor="#9aafbd" />
          </linearGradient>
        </defs>
        <rect x="28" y="10" width="164" height="400" rx="52" fill="url(#carBody)" stroke="#222" strokeWidth="2" />
        <rect x="46" y="28" width="128" height="72" rx="18" fill="url(#glass)" opacity="0.95" />
        <rect x="40" y="108" width="140" height="148" rx="10" fill="#f7f1d4" />
        <rect x="48" y="268" width="124" height="92" rx="12" fill="#d8d8d8" />
        <rect x="58" y="278" width="104" height="72" rx="8" fill="#cfcfcf" />
        <ellipse cx="36" cy="92" rx="10" ry="22" fill="#2a2a2a" />
        <ellipse cx="184" cy="92" rx="10" ry="22" fill="#2a2a2a" />
        <ellipse cx="36" cy="300" rx="10" ry="22" fill="#2a2a2a" />
        <ellipse cx="184" cy="300" rx="10" ry="22" fill="#2a2a2a" />
        <circle cx="148" cy="126" r="11" fill="none" stroke="#222" strokeWidth="3" />
        <text x="110" y="328" textAnchor="middle" fontSize="11" fill="#222">
          ท้ายรถ
        </text>
      </svg>
      <div className={`seat-layer ${hasMiddle ? 'has-middle' : 'no-middle'}`}>
        {tile(byPos.front_passenger, selected, onSelect, onToggleOpen, ownPosition)}
        <div className="seat-btn seat-driver" data-testid="seat-driver" data-state="locked">
          <span>1B</span>
          <span>ล็อกไว้</span>
          <span>{driverLabel}</span>
        </div>
        {tile(byPos.rear_left, selected, onSelect, onToggleOpen, ownPosition)}
        {hasMiddle ? tile(byPos.rear_middle, selected, onSelect, onToggleOpen, ownPosition) : null}
        {tile(byPos.rear_right, selected, onSelect, onToggleOpen, ownPosition)}
      </div>
    </div>
  );
}

function tile(
  seat: SeatState | undefined,
  selected: string | null | undefined,
  onSelect: Props['onSelect'],
  onToggleOpen: Props['onToggleOpen'],
  ownPosition: SeatPosition | null | undefined,
) {
  if (!seat) return null;
  const isSelected = selected === seat.position;
  const closed = !seat.is_open;
  const booked = seat.is_booked;
  const mine = ownPosition === seat.position;
  const state = closed ? 'closed' : booked ? 'booked' : isSelected ? 'selected' : 'open';
  const clickable = onToggleOpen
    ? !booked
    : Boolean(onSelect) && seat.is_open && !seat.is_booked;
  return (
    <button
      type="button"
      className={`seat-btn tap-target${mine ? ' seat-own' : ''}`}
      data-testid={`seat-${seat.position}`}
      data-state={state}
      aria-pressed={isSelected}
      disabled={!clickable}
      onClick={() => {
        if (onToggleOpen) {
          if (!booked) onToggleOpen(seat.position, !seat.is_open);
          return;
        }
        if (seat.is_open && !seat.is_booked) onSelect?.(seat.position);
      }}
    >
      <span>{seatCode(seat.position)}</span>
      <span>{SEAT_LABELS[seat.position]}</span>
      <span>
        {closed ? 'ปิด' : booked ? (seat.label ?? 'จองแล้ว') : isSelected ? 'เลือกแล้ว' : mine ? 'ของคุณ' : 'ว่าง'}
      </span>
    </button>
  );
}
