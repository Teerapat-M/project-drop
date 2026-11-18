import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';
import layout from '../lib/seat-layout.json';
import type { SeatState, VehicleType } from '../types';
import { CarSeatMap } from './CarSeatMap';

const sedanSeats: SeatState[] = [
  { id: '1', position: 'front_passenger', is_open: true, is_booked: false },
  { id: '2', position: 'rear_left', is_open: true, is_booked: true, label: 'โก้' },
  { id: '3', position: 'rear_middle', is_open: true, is_booked: false },
  { id: '4', position: 'rear_right', is_open: true, is_booked: false },
];

const threeSeats: SeatState[] = [
  { id: '1', position: 'front_passenger', is_open: true, is_booked: false },
  { id: '2', position: 'rear_left', is_open: true, is_booked: false },
  { id: '3', position: 'rear_right', is_open: true, is_booked: false },
];

const trunk = { w: 100, h: 50, l: 50 };

function ToggleHarness() {
  const [seats, setSeats] = useState(sedanSeats);
  return (
    <CarSeatMap
      vehicle="sedan"
      seats={seats}
      trunk={trunk}
      onToggleOpen={(position, isOpen) => {
        setSeats((prev) => prev.map((s) => (s.position === position ? { ...s, is_open: isOpen } : s)));
      }}
    />
  );
}

function boxesOf(vehicle: VehicleType) {
  const seats = vehicle === 'sedan' ? sedanSeats : threeSeats;
  const { container, unmount } = render(<CarSeatMap vehicle={vehicle} seats={seats} trunk={trunk} />);
  const map = container.querySelector('[data-testid="seat-map"]');
  const slots = [...(map?.querySelectorAll('[data-box]') ?? [])].map((el) => ({
    id: el.getAttribute('data-testid'),
    box: el.getAttribute('data-box'),
  }));
  const img = map?.querySelector('[data-testid="seat-map-car"]')?.getAttribute('src') ?? null;
  unmount();
  return { img, slots };
}

function jsonBox(vehicle: VehicleType, code: string): string {
  const seats = layout.vehicles[vehicle].seats as Record<string, { x: number; y: number; w: number; h: number }>;
  const box = seats[code];
  return `${box.x} ${box.y} ${box.w} ${box.h}`;
}

describe('CarSeatMap owner toggle', () => {
  it('toggles an open unbooked seat closed and ignores booked seats', () => {
    render(<ToggleHarness />);
    expect(screen.getByTestId('seat-driver')).toHaveAttribute('data-state', 'locked');
    expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'open');
    fireEvent.click(screen.getByTestId('seat-rear_middle'));
    expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'closed');
    fireEvent.click(screen.getByTestId('seat-rear_middle'));
    expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'open');
    fireEvent.click(screen.getByTestId('seat-rear_left'));
    expect(screen.getByTestId('seat-rear_left')).toHaveAttribute('data-state', 'booked');
  });

  it('keeps the four passenger seats including rear-middle', () => {
    render(<CarSeatMap vehicle="sedan" seats={sedanSeats} trunk={trunk} />);
    expect(screen.getByTestId('seat-front_passenger')).toBeInTheDocument();
    expect(screen.getByTestId('seat-rear_left')).toBeInTheDocument();
    expect(screen.getByTestId('seat-rear_middle')).toBeInTheDocument();
    expect(screen.getByTestId('seat-rear_right')).toBeInTheDocument();
    expect(screen.getByTestId('driver-lock')).toBeInTheDocument();
    expect(screen.getByTestId('seat-driver')).toHaveAttribute('data-state', 'locked');
  });
});

describe('CarSeatMap Penpot layout', () => {
  it('snapshots seat boxes and car image per vehicle', () => {
    expect({
      sedan: boxesOf('sedan'),
      hatch: boxesOf('hatch'),
      pickup: boxesOf('pickup'),
    }).toMatchSnapshot();
  });

  it('places seats from JSON fractions and uses the matching car image', () => {
    render(<CarSeatMap vehicle="sedan" seats={sedanSeats} trunk={trunk} />);
    expect(screen.getByTestId('seat-map-car')).toHaveAttribute('src', '/assets/sedan.png');
    expect(screen.getByTestId('seat-slot-1A')).toHaveAttribute('data-box', jsonBox('sedan', '1A'));
    expect(screen.getByTestId('seat-slot-1B')).toHaveAttribute('data-box', jsonBox('sedan', '1B'));
    expect(screen.getByTestId('seat-slot-2A')).toHaveAttribute('data-box', jsonBox('sedan', '2A'));
    expect(screen.getByTestId('seat-slot-2C')).toHaveAttribute('data-box', jsonBox('sedan', '2C'));
    expect(screen.getByTestId('seat-slot-2B')).toHaveAttribute('data-box', jsonBox('sedan', '2B'));
  });

  it('omits 2C on hatch and pickup and picks the matching PNG', () => {
    const { unmount } = render(<CarSeatMap vehicle="hatch" seats={threeSeats} trunk={trunk} />);
    expect(screen.getByTestId('seat-map-car')).toHaveAttribute('src', '/assets/hatch.png');
    expect(screen.queryByTestId('seat-slot-2C')).toBeNull();
    expect(screen.getByTestId('seat-slot-2A')).toHaveAttribute('data-box', jsonBox('hatch', '2A'));
    expect(screen.getByTestId('seat-slot-2B')).toHaveAttribute('data-box', jsonBox('hatch', '2B'));
    unmount();
    render(<CarSeatMap vehicle="pickup" seats={threeSeats} trunk={trunk} />);
    expect(screen.getByTestId('seat-map-car')).toHaveAttribute('src', '/assets/pickup.png');
    expect(screen.queryByTestId('seat-rear_middle')).toBeNull();
  });

  it('clamps seat copy to two lines and keeps a 44px hit target', () => {
    render(
      <CarSeatMap
        vehicle="sedan"
        seats={sedanSeats}
        trunk={trunk}
        driverLabel="คนขับแท็กซี่ น้องมิ้นท์ชื่อยาวมาก"
      />,
    );
    const copy = screen.getByTestId('seat-driver').querySelector('.seat-copy');
    expect(copy).not.toBeNull();
    expect(copy).toHaveTextContent('1B');
    expect(copy).toHaveTextContent('คนขับ');
    expect(css).toMatch(/-webkit-line-clamp:\s*2/);
    expect(css).toMatch(/\.seat-hit\s*\{[^}]*min-height:\s*var\(--tap\)/s);
    expect(css).toMatch(/\.seat-hit\s*\{[^}]*min-width:\s*var\(--tap\)/s);
    expect(screen.getByTestId('seat-driver')).toHaveClass('tap-target');
    expect(screen.getByTestId('seat-front_passenger')).toHaveClass('tap-target');
  });

  it('fills the trunk from the bottom by used volume and turns red on overflow', () => {
    const empty = render(
      <CarSeatMap vehicle="sedan" seats={sedanSeats} trunk={trunk} luggage={[]} />,
    );
    expect(screen.getByTestId('trunk-label')).toHaveTextContent('ท้ายรถ 100×50×50 ซม. = 250 ล.');
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'false');
    expect(screen.getByTestId('trunk-fill').getAttribute('style')).toMatch(/height:\s*0%/);
    expect(screen.getByTestId('trunk-remain')).toHaveTextContent('เหลือ 250 ลิตร');
    empty.unmount();

    const partial = render(
      <CarSeatMap
        vehicle="sedan"
        seats={sedanSeats}
        trunk={trunk}
        luggage={[{ riderId: 'you', heightCm: 50, widthCm: 40, depthCm: 25 }]}
      />,
    );
    const used = 50 * 40 * 25;
    const cap = 100 * 50 * 50;
    const fillPct = (used / cap) * 100;
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'false');
    expect(screen.getByTestId('trunk-fill').getAttribute('style')).toContain(`height: ${fillPct}%`);
    partial.unmount();

    render(
      <CarSeatMap
        vehicle="sedan"
        seats={sedanSeats}
        trunk={trunk}
        luggage={[{ riderId: 'you', heightCm: 80, widthCm: 60, depthCm: 55 }]}
      />,
    );
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'true');
    expect(screen.getByTestId('trunk-fill')).toHaveClass('is-overflow');
    expect(screen.getByTestId('trunk-fill').getAttribute('style')).toMatch(/height:\s*100%/);
  });
});
