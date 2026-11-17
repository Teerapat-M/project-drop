import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeFare } from '@drop/carpool-core';
import { FARE_PRIVATE_SEATS, FARE_TAXI_SEATS } from '../fixtures';
import { FareSummary } from './FareSummary';

const labels = { A: 'เอ', B: 'บี', C: 'ซี', driver: 'ส่วนของคนขับ' };

describe('FareSummary', () => {
  it('renders taxi 28 / 49 / 28', () => {
    const result = computeFare({
      vehicle: 'taxi',
      mainRouteKm: 12,
      seats: FARE_TAXI_SEATS,
    });
    render(<FareSummary result={result} labels={labels} kind="taxi" />);
    expect(screen.getByTestId('amount-A')).toHaveTextContent('28 ฿');
    expect(screen.getByTestId('amount-B')).toHaveTextContent('49 ฿');
    expect(screen.getByTestId('amount-C')).toHaveTextContent('28 ฿');
    expect(screen.getByTestId('detour-B')).toHaveTextContent('21');
    expect(screen.getByText(/รวม 105 ฿/)).toBeInTheDocument();
  });

  it('renders private 21 / 42 / 21 / 21 with cost-sharing label', () => {
    const result = computeFare({
      vehicle: 'private_car',
      mainRouteKm: 12,
      seats: FARE_PRIVATE_SEATS,
    });
    render(<FareSummary result={result} labels={labels} kind="private" />);
    expect(screen.getByTestId('cost-sharing-label')).toHaveTextContent('หารค่าใช้จ่าย ไม่ใช่ค่าจ้าง');
    expect(screen.getByTestId('amount-A')).toHaveTextContent('21 ฿');
    expect(screen.getByTestId('amount-B')).toHaveTextContent('42 ฿');
    expect(screen.getByTestId('amount-C')).toHaveTextContent('21 ฿');
    expect(screen.getByTestId('amount-driver')).toHaveTextContent('21 ฿');
    expect(screen.getByText('ส่วนของคนขับ')).toBeInTheDocument();
  });
});
