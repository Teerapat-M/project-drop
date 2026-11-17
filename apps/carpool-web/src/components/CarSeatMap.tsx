import type { SeatState, VehicleType } from '../types';
import { SEAT_LABELS, seatCode } from '../lib/seats';

type Props = {
  vehicle: VehicleType;
  seats: SeatState[];
  selected?: string | null;
  onSelect?: (position: SeatState['position']) => void;
  driverLabel?: string;
};

export function CarSeatMap({ vehicle, seats, selected, onSelect, driverLabel = 'คนขับ' }: Props) {
  const byPos = Object.fromEntries(seats.map((s) => [s.position, s]));
  const hasMiddle = vehicle === 'sedan';

  return (
    <div className="seat-map" data-testid="seat-map">
      <svg viewBox="0 0 220 420" role="img" aria-label="แผนที่นั่ง มองจากด้านบน คนขับอยู่ขวา">
        <rect x="30" y="8" width="160" height="404" rx="48" fill="#f6e27a" stroke="#222" />
        <rect x="48" y="28" width="124" height="70" rx="16" fill="#d9d9d9" opacity="0.85" />
        <rect x="48" y="250" width="124" height="50" rx="10" fill="#eee" opacity="0.7" />
        <circle cx="38" cy="90" r="14" fill="#333" />
        <circle cx="182" cy="90" r="14" fill="#333" />
        <circle cx="38" cy="310" r="14" fill="#333" />
        <circle cx="182" cy="310" r="14" fill="#333" />
        <circle cx="148" cy="118" r="10" fill="none" stroke="#222" strokeWidth="3" />
        {tile(byPos.front_passenger, 48, 108, selected, onSelect)}
        {driverTile(148, 108, driverLabel)}
        {tile(byPos.rear_left, 48, 188, selected, onSelect)}
        {hasMiddle
          ? tile(byPos.rear_middle, 98, 188, selected, onSelect, 44)
          : null}
        {tile(byPos.rear_right, hasMiddle ? 148 : 148, 188, selected, onSelect)}
        <text x="110" y="330" textAnchor="middle" fontSize="11" fill="#222">
          ท้ายรถ
        </text>
      </svg>
    </div>
  );
}

function driverTile(x: number, y: number, label: string) {
  return (
    <g>
      <rect x={x - 22} y={y} width="44" height="56" rx="8" fill="#e8e8e8" stroke="#222" />
      <text x={x} y={y + 16} textAnchor="middle" fontSize="9" fill="#222">
        1B ล็อก
      </text>
      <text x={x} y={y + 30} textAnchor="middle" fontSize="9" fill="#222">
        {label}
      </text>
    </g>
  );
}

function tile(
  seat: SeatState | undefined,
  x: number,
  y: number,
  selected: string | null | undefined,
  onSelect?: Props['onSelect'],
  w = 44,
) {
  if (!seat) return null;
  const isSelected = selected === seat.position;
  const closed = !seat.is_open;
  const booked = seat.is_booked;
  const fill = closed ? '#cfcfcf' : booked ? '#d0d0d0' : isSelected ? '#222' : '#fff';
  const color = isSelected ? '#fff' : '#222';
  const clickable = Boolean(onSelect) && seat.is_open && !seat.is_booked;
  return (
    <g
      data-testid={`seat-${seat.position}`}
      data-state={closed ? 'closed' : booked ? 'booked' : isSelected ? 'selected' : 'open'}
      style={{ cursor: clickable ? 'pointer' : 'default' }}
      onClick={() => {
        if (clickable) onSelect?.(seat.position);
      }}
    >
      <rect x={x - 22} y={y} width={w} height="56" rx="8" fill={fill} stroke="#222" />
      <text x={x - 22 + w / 2} y={y + 16} textAnchor="middle" fontSize="9" fill={color}>
        {seatCode(seat.position)}
      </text>
      <text x={x - 22 + w / 2} y={y + 30} textAnchor="middle" fontSize="8" fill={color}>
        {SEAT_LABELS[seat.position]}
      </text>
      <text x={x - 22 + w / 2} y={y + 44} textAnchor="middle" fontSize="8" fill={color}>
        {closed ? 'ปิด' : booked ? (seat.label ?? 'จองแล้ว') : isSelected ? 'เลือกแล้ว' : 'ว่าง'}
      </text>
    </g>
  );
}
