import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { mockMatchMedia } from '../test/matchMedia';
import { HistoryPage } from './HistoryPage';

describe('history list', () => {
  it('renders real demo trips with car photos and status at 390px', () => {
    mockMatchMedia(390);
    render(
      <AuthProvider>
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByText('ประวัติทริป')).toBeInTheDocument();
    expect(screen.getByTestId('history-demo-history-mint')).toHaveTextContent('เสร็จแล้ว');
    expect(screen.getByTestId('history-demo-history-sam')).toHaveTextContent('ยกเลิก');
    expect(
      screen.getByTestId('history-demo-history-mint').querySelector('[data-src="/assets/sedan_opt3.png"]'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('history-demo-history-sam').querySelector('[data-src="/assets/hatch_retro_3d.png"]'),
    ).toBeTruthy();
  });
});
