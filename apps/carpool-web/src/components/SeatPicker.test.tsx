import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { SeatState } from '../types';
import { SeatPicker } from './SeatPicker';

const seats: SeatState[] = [
  { id: '1', position: 'front_passenger', is_open: true, is_booked: false },
  { id: '2', position: 'rear_left', is_open: true, is_booked: true, label: 'โก้' },
  { id: '3', position: 'rear_middle', is_open: false, is_booked: false },
  { id: '4', position: 'rear_right', is_open: true, is_booked: false },
];

function Harness() {
  const [selected, setSelected] = useState<string | null>('front_passenger');
  return (
    <SeatPicker
      vehicle="sedan"
      seats={seats}
      selected={selected}
      onSelect={(p) => setSelected(p)}
    />
  );
}

describe('SeatPicker', () => {
  it('shows open, selected, booked, and closed states', () => {
    render(<Harness />);
    expect(screen.getByTestId('seat-front_passenger')).toHaveAttribute('data-state', 'selected');
    expect(screen.getByTestId('seat-rear_left')).toHaveAttribute('data-state', 'booked');
    expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByTestId('seat-rear_right')).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('legend-rear_left')).toHaveTextContent('จองแล้ว');
    expect(screen.getByTestId('legend-rear_middle')).toHaveTextContent('ปิด');
  });

  it('selects an open seat and ignores booked/closed', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('seat-rear_right'));
    expect(screen.getByTestId('seat-rear_right')).toHaveAttribute('data-state', 'selected');
    fireEvent.click(screen.getByTestId('seat-rear_left'));
    expect(screen.getByTestId('seat-rear_left')).toHaveAttribute('data-state', 'booked');
    expect(screen.getByTestId('seat-rear_right')).toHaveAttribute('data-state', 'selected');
  });
});
