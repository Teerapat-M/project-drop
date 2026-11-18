import type { LuggagePiece } from '@drop/carpool-core';
import type { SeatPosition, SeatState, VehicleType } from '../types';
import { SEAT_LABELS } from '../lib/seats';
import { CarSeatMap, type TrunkDims } from './CarSeatMap';

type Props = {
  vehicle: VehicleType;
  seats: SeatState[];
  selected: string | null;
  onSelect: (position: SeatState['position']) => void;
  onToggleOpen?: (position: SeatState['position'], isOpen: boolean) => void;
  driverLabel?: string;
  ownPosition?: SeatPosition | null;
  trunk?: TrunkDims;
  luggage?: LuggagePiece[];
};

export function SeatPicker({
  vehicle,
  seats,
  selected,
  onSelect,
  onToggleOpen,
  driverLabel,
  ownPosition,
  trunk,
  luggage,
}: Props) {
  return (
    <section data-testid="seat-picker" className="stack">
      <h2 style={{ margin: 0, fontSize: 16 }}>เลือกที่นั่ง (มองจากด้านบน คนขับอยู่ขวา)</h2>
      <CarSeatMap
        vehicle={vehicle}
        seats={seats}
        selected={selected}
        onSelect={onSelect}
        onToggleOpen={onToggleOpen}
        driverLabel={driverLabel}
        ownPosition={ownPosition}
        trunk={trunk}
        luggage={luggage}
      />
      <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
        {seats.map((s) => (
          <li key={s.position} data-testid={`legend-${s.position}`}>
            {SEAT_LABELS[s.position]} —{' '}
            {!s.is_open ? 'ปิด' : s.is_booked ? 'จองแล้ว' : selected === s.position ? 'เลือกแล้ว' : 'ว่าง'}
          </li>
        ))}
      </ul>
    </section>
  );
}
