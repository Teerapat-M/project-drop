import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { MapsProvider } from '../maps/MapsProvider';
import { mockMatchMedia } from '../test/matchMedia';
import { createMockMapProvider } from '../test/mockMapProvider';
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

  it('searches by optional map points and radius, with no province/district filters', () => {
    renderList('/');
    expect(screen.queryByTestId('search-origin-province')).toBeNull();
    expect(screen.queryByTestId('search-origin-district')).toBeNull();
    expect(screen.queryByTestId('search-dest-province')).toBeNull();
    expect(screen.getByTestId('place-search-pickup')).toBeInTheDocument();
    expect(screen.getByTestId('place-search-dest')).toBeInTheDocument();
    const radius = screen.getByTestId('search-radius') as HTMLInputElement;
    expect(radius).toHaveAttribute('min', '1');
    expect(radius).toHaveAttribute('max', '30');
    expect(radius).toHaveValue('5');
    expect(radius).toHaveClass('tap-target');
    expect(screen.getByTestId('search-radius-label')).toHaveTextContent('5 กม.');
  });

  it('shows pickup and dest distances on cards after a nearby search', async () => {
    mockMatchMedia(390);
    const provider = createMockMapProvider();
    render(
      <AuthProvider>
        <MapsProvider provider={provider}>
          <MemoryRouter initialEntries={['/']}>
            <TripListPage />
          </MemoryRouter>
        </MapsProvider>
      </AuthProvider>,
    );
    fireEvent.click(screen.getByTestId('place-search-pickup'));
    fireEvent.click(await screen.findByTestId('mock-map'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    fireEvent.click(screen.getByTestId('place-search-dest'));
    fireEvent.click(await screen.findByTestId('mock-map'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }));
    const mint = screen.getByTestId('trip-demo-mint');
    expect(mint.querySelector('[data-testid="search-distance"]')).toHaveTextContent('จุดขึ้นห่างเส้นทาง');
    expect(mint.querySelector('[data-testid="search-distance"]')).toHaveTextContent('จุดลงห่าง');
    expect(screen.queryByTestId('trip-demo-sam')).toBeNull();
  });
});
