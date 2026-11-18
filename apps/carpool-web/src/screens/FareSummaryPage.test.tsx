import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import css from '../index.css?raw';
import { mockMatchMedia } from '../test/matchMedia';
import { FareSummaryPage } from './FareSummaryPage';

function renderFare(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trips/:id/fare" element={<FareSummaryPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('waiting-state badge', () => {
  it('shows รอยืนยัน on the fare page until confirmed', () => {
    mockMatchMedia(390);
    renderFare('/trips/demo-taxi-12km/fare');
    expect(screen.getByTestId('waiting-badge')).toHaveTextContent('รอยืนยัน');
    expect(screen.getByTestId('amount-A')).toHaveTextContent('28 ฿');
    expect(css).toMatch(/--tap:\s*44px/);
  });

  it('hides the badge when confirmed=1', () => {
    renderFare('/trips/demo-taxi-12km/fare?confirmed=1');
    expect(screen.queryByTestId('waiting-badge')).toBeNull();
  });

  it('hides the badge when the trip is not open', () => {
    renderFare('/trips/demo-history-mint/fare');
    expect(screen.queryByTestId('waiting-badge')).toBeNull();
  });
});
