import type { SeatState, VehicleType } from '../types';
import { SEAT_LABELS } from '../lib/seats';
import { CarSeatMap } from './CarSeatMap';

type Props = {
  vehicle: VehicleType;
  seats: SeatState[];
  selected: string | null;
  onSelect: (position: SeatState['position']) => void;
  driverLabel?: string;
};

export function SeatPicker({ vehicle, seats, selected, onSelect, driverLabel }: Props) {
  return (
    <section data-testid="seat-picker" className="stack">
      <h2 style={{ margin: 0, fontSize: 16 }}>เลือกที่นั่ง (มองจากด้านบน คนขับอยู่ขวา)</h2>
      <CarSeatMap
        vehicle={vehicle}
        seats={seats}
        selected={selected}
        onSelect={onSelect}
        driverLabel={driverLabel}
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
