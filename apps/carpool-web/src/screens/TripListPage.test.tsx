import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { mockMatchMedia } from '../test/matchMedia';
import { TripListPage } from './TripListPage';

function renderList(path = '/') {
  mockMatchMedia(390);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <TripListPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('trip cards at 390px', () => {
  it('shows vehicle photos matching sedan / hatch / pickup', () => {
    renderList('/');
    const mint = screen.getByTestId('trip-demo-mint');
    const sam = screen.getByTestId('trip-demo-sam');
    const daeng = screen.getByTestId('trip-demo-daeng');
    expect(mint.querySelector('[data-src="/assets/sedan_opt3.png"]')).toBeTruthy();
    expect(sam.querySelector('[data-src="/assets/hatch_retro_3d.png"]')).toBeTruthy();
    expect(daeng.querySelector('[data-src="/assets/pickup_3d.png"]')).toBeTruthy();
  });

  it('shows ทริปของคุณ and จัดการทริป on the owner card', () => {
    renderList('/');
    const mine = screen.getByTestId('trip-demo-mint');
    expect(mine).toHaveTextContent('ทริปของคุณ');
    expect(screen.getByTestId('manage-demo-mint')).toHaveTextContent('จัดการทริป');
    expect(screen.getByTestId('manage-demo-mint')).toHaveAttribute('href', '/trips/demo-mint/manage');
  });

  it('shows the taxi badge and taxi sedan on the taxi tab', () => {
    renderList('/?kind=taxi');
    expect(screen.getByTestId('taxi-badge')).toHaveTextContent('แท็กซี่');
    const taxi = screen.getByTestId('trip-demo-taxi-12km');
    expect(taxi.querySelector('[data-src="/assets/taxi_sedan.png"]')).toBeTruthy();
  });

  it('shows the taxi max-detour cap on list cards', () => {
    renderList('/?kind=taxi');
    const taxi = screen.getByTestId('trip-demo-taxi-12km');
    expect(taxi).toHaveTextContent('ออกนอกเส้นทางได้สูงสุด 5 กม.');
    expect(screen.getByTestId('max-detour-cap')).toHaveTextContent('ออกนอกเส้นทางได้สูงสุด 5 กม.');
  });

  it('hides the max-detour cap on private cards', () => {
    renderList('/');
    expect(screen.queryByTestId('max-detour-cap')).toBeNull();
    expect(screen.getByTestId('trip-demo-mint')).not.toHaveTextContent('ออกนอกเส้นทางได้สูงสุด');
  });
});
