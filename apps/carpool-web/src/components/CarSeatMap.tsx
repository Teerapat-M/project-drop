import type { CSSProperties } from 'react';
import { layoutTrunk, type LuggagePiece } from '@drop/carpool-core';
import { liters } from '../lib/format';
import {
  boxStyle,
  carTopdownSrc,
  SEAT_CODE_TO_POSITION,
  vehicleSeatLayout,
  type SeatBox,
  type SeatCode,
} from '../lib/seatLayout';
import { SEAT_LABELS, seatCode } from '../lib/seats';
import type { SeatPosition, SeatState, VehicleType } from '../types';

export type TrunkDims = { w: number; h: number; l: number };

type Props = {
  vehicle: VehicleType;
  seats: SeatState[];
  selected?: string | null;
  onSelect?: (position: SeatState['position']) => void;
  onToggleOpen?: (position: SeatState['position'], isOpen: boolean) => void;
  driverLabel?: string;
  ownPosition?: SeatPosition | null;
  trunk?: TrunkDims;
  luggage?: LuggagePiece[];
};

export function CarSeatMap({
  vehicle,
  seats,
  selected,
  onSelect,
  onToggleOpen,
  driverLabel = 'คนขับ',
  ownPosition,
  trunk,
  luggage = [],
}: Props) {
  const spec = vehicleSeatLayout(vehicle);
  const [boardW, boardH] = spec.boardSizePx;
  const byPos = Object.fromEntries(seats.map((s) => [s.position, s]));

  return (
    <div
      className={`seat-map seat-map-${vehicle}`}
      data-testid="seat-map"
      data-vehicle={vehicle}
      style={{ '--car-ar': `${boardW} / ${boardH}` } as CSSProperties}
    >
      <img className="seat-map-car" src={carTopdownSrc(vehicle)} alt="" data-testid="seat-map-car" />
      {(Object.entries(spec.seats) as [SeatCode, SeatBox][]).map(([code, box]) => {
        if (code === '1B') {
          return <DriverSeat key={code} box={box} label={driverLabel} />;
        }
        const position = SEAT_CODE_TO_POSITION[code];
        const seat = byPos[position];
        if (!seat) return null;
        return (
          <PassengerSeat
            key={code}
            code={code}
            box={box}
            seat={seat}
            selected={selected}
            ownPosition={ownPosition}
            onSelect={onSelect}
            onToggleOpen={onToggleOpen}
          />
        );
      })}
      {trunk ? <TrunkOverlay spec={spec} trunk={trunk} luggage={luggage} /> : null}
    </div>
  );
}

function DriverSeat({ box, label }: { box: SeatBox; label: string }) {
  return (
    <div className="seat-slot" data-testid="seat-slot-1B" data-box={boxKey(box)} style={boxStyle(box)}>
      <button
        type="button"
        className="seat-hit tap-target"
        data-testid="seat-driver"
        data-state="locked"
        disabled
        aria-label={`ที่นั่งคนขับ ล็อกไว้ · ${label}`}
      >
        <span className="seat-face" data-state="locked">
          <LockIcon />
          <span className="seat-copy">
            <span className="seat-code">1B</span>
            <span className="seat-caption">คนขับ</span>
          </span>
        </span>
      </button>
    </div>
  );
}

function PassengerSeat({
  code,
  box,
  seat,
  selected,
  ownPosition,
  onSelect,
  onToggleOpen,
}: {
  code: SeatCode;
  box: SeatBox;
  seat: SeatState;
  selected?: string | null;
  ownPosition?: SeatPosition | null;
  onSelect?: Props['onSelect'];
  onToggleOpen?: Props['onToggleOpen'];
}) {
  const isSelected = selected === seat.position;
  const closed = !seat.is_open;
  const booked = seat.is_booked;
  const mine = ownPosition === seat.position;
  const state = closed ? 'closed' : booked ? 'booked' : isSelected || mine ? 'selected' : 'open';
  const clickable = onToggleOpen ? !booked : Boolean(onSelect) && seat.is_open && !seat.is_booked;
  const caption = closed
    ? 'ปิด'
    : booked
      ? (seat.label ?? 'จองแล้ว')
      : isSelected
        ? 'เลือกแล้ว'
        : 'ว่าง';

  return (
    <div
      className="seat-slot"
      data-testid={`seat-slot-${code}`}
      data-box={boxKey(box)}
      style={boxStyle(box)}
    >
      <button
        type="button"
        className={`seat-hit tap-target${mine ? ' seat-own' : ''}`}
        data-testid={`seat-${seat.position}`}
        data-state={state}
        aria-pressed={isSelected}
        aria-label={`${code} ${SEAT_LABELS[seat.position]} ${caption}`}
        disabled={!clickable}
        onClick={() => {
          if (onToggleOpen) {
            if (!booked) onToggleOpen(seat.position, !seat.is_open);
            return;
          }
          if (seat.is_open && !seat.is_booked) onSelect?.(seat.position);
        }}
      >
        <span className="seat-face" data-state={state}>
          <span className="seat-copy">
            <span className="seat-code">{seatCode(seat.position)}</span>
            <span className="seat-caption">{caption}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

function TrunkOverlay({
  spec,
  trunk,
  luggage,
}: {
  spec: ReturnType<typeof vehicleSeatLayout>;
  trunk: TrunkDims;
  luggage: LuggagePiece[];
}) {
  const [boardW, boardH] = spec.boardSizePx;
  const frameW = spec.trunk.w * boardW;
  const frameH = spec.trunk.h * boardH;
  const layout = layoutTrunk({
    widthCm: trunk.w,
    heightCm: trunk.h,
    lengthCm: trunk.l,
    frameWidth: frameW,
    frameHeight: frameH,
    luggage,
  });
  const capL = liters(trunk.w, trunk.h, trunk.l);
  const remainL = Math.max(0, (layout.capacityVol - layout.usedVol) / 1000);
  const fillPct = layout.rect.height > 0 ? (layout.fillHeight / layout.rect.height) * 100 : 0;

  return (
    <div className="trunk-slot" data-testid="trunk-slot" style={boxStyle(spec.trunk)}>
      <p className="trunk-label" data-testid="trunk-label">
        ท้ายรถ {trunk.w}×{trunk.h}×{trunk.l} ซม. = {capL.toFixed(0)} ล.
      </p>
      <div className="trunk-frame">
        <div
          className="trunk-rect"
          data-testid="trunk-rect"
          style={{
            left: `${(layout.rect.x / frameW) * 100}%`,
            top: `${(layout.rect.y / frameH) * 100}%`,
            width: `${(layout.rect.width / frameW) * 100}%`,
            height: `${(layout.rect.height / frameH) * 100}%`,
            borderRadius: `${layout.cornerRadius}px`,
          }}
        >
          <div
            className={`trunk-fill${layout.overflow ? ' is-overflow' : ''}`}
            data-testid="trunk-fill"
            data-overflow={layout.overflow ? 'true' : 'false'}
            style={{ height: `${Math.min(100, fillPct)}%` }}
          />
          <span className="trunk-remain" data-testid="trunk-remain">
            เหลือ {remainL.toFixed(0)} ลิตร
          </span>
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="seat-lock" data-testid="driver-lock" viewBox="0 0 16 16" aria-hidden>
      <rect x="3" y="7" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5.2a3 3 0 0 1 6 0V7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function boxKey(box: SeatBox): string {
  return `${box.x} ${box.y} ${box.w} ${box.h}`;
}
