import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { SeatState } from '../types';
import { CarSeatMap } from './CarSeatMap';

const initial: SeatState[] = [
  { id: '1', position: 'front_passenger', is_open: true, is_booked: false },
  { id: '2', position: 'rear_left', is_open: true, is_booked: true, label: 'โก้' },
  { id: '3', position: 'rear_middle', is_open: true, is_booked: false },
  { id: '4', position: 'rear_right', is_open: true, is_booked: false },
];

function ToggleHarness() {
  const [seats, setSeats] = useState(initial);
  return (
    <CarSeatMap
      vehicle="sedan"
      seats={seats}
      onToggleOpen={(position, isOpen) => {
        setSeats((prev) => prev.map((s) => (s.position === position ? { ...s, is_open: isOpen } : s)));
      }}
    />
  );
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
    render(<CarSeatMap vehicle="sedan" seats={initial} />);
    expect(screen.getByTestId('seat-front_passenger')).toBeInTheDocument();
    expect(screen.getByTestId('seat-rear_left')).toBeInTheDocument();
    expect(screen.getByTestId('seat-rear_middle')).toBeInTheDocument();
    expect(screen.getByTestId('seat-rear_right')).toBeInTheDocument();
    expect(screen.getByTestId('seat-driver')).toHaveTextContent('ล็อก');
  });
});
