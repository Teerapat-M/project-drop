import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { MapsProvider } from '../maps/MapsProvider';
import { resetRouteCache } from '../maps/routeCache';
import { mockMatchMedia } from '../test/matchMedia';
import { createMockMapProvider } from '../test/mockMapProvider';
import { BookedTripPage } from './BookedTripPage';

describe('BookedTripPage', () => {
  afterEach(() => {
    resetRouteCache();
  });

  it('is a read-only rider view with seat, share, map and chat', () => {
    mockMatchMedia(390);
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/trips/demo-mine-booked/booked']}>
          <Routes>
            <Route path="/trips/:id/booked" element={<BookedTripPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByTestId('booked-trip')).toBeInTheDocument();
    expect(screen.getByTestId('role-badge')).toHaveTextContent('ฉันจอง');
    expect(screen.getByTestId('own-booking')).toHaveTextContent('ที่นั่งของคุณ');
    expect(screen.getByRole('button', { name: 'แชทกับเพื่อนร่วมทาง' })).toBeInTheDocument();
    expect(screen.getByTestId('route-mini-map')).toBeInTheDocument();
    expect(screen.queryByTestId('join-submit')).toBeNull();
    expect(screen.getByTestId('own-dropoff')).toHaveTextContent('จุดลงของคุณ · ตลาดวโรรส');
    expect(screen.getByTestId('pickup-approx')).toHaveTextContent('จุดขึ้นโดยประมาณ');
    expect(screen.getByTestId('own-detour')).toHaveTextContent('ออกนอกเส้นทาง 1.2 กม.');
    expect(screen.getByTestId('own-booking')).toHaveTextContent('สัมภาระของคุณ ไม่มีข้อมูล');
  });

  it('draws the rider drop-off pin on the mini map and modal without an extra Routes call', async () => {
    mockMatchMedia(390);
    const provider = createMockMapProvider();
    render(
      <AuthProvider>
        <MapsProvider provider={provider}>
          <MemoryRouter initialEntries={['/trips/demo-mine-booked/booked']}>
            <Routes>
              <Route path="/trips/:id/booked" element={<BookedTripPage />} />
            </Routes>
          </MemoryRouter>
        </MapsProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(provider.route).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(provider.lastMarkers.some((m) => m.kind === 'dropoff' && m.label === 'จุดลงของคุณ')).toBe(
        true,
      ),
    );
    expect(provider.lastFitBounds?.some((p) => p.lat === 18.796 && p.lng === 98.993)).toBe(true);
    fireEvent.click(screen.getByTestId('route-map-expand'));
    expect(screen.getByTestId('route-map-dialog')).toBeInTheDocument();
    expect(provider.route).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(provider.lastMarkers.filter((m) => m.kind === 'dropoff').length).toBeGreaterThanOrEqual(2),
    );
  });
});
