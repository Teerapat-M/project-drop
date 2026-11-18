import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { Layout } from '../components/Layout';
import css from '../index.css?raw';
import { mockMatchMedia } from '../test/matchMedia';
import { BookedTripPage } from './BookedTripPage';
import { ManageTripPage } from './ManageTripPage';
import { MyTripsPage } from './MyTripsPage';

function renderMyTrips(path = '/my-trips') {
  mockMatchMedia(390);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<p data-testid="home">หน้าแรก</p>} />
            <Route path="/my-trips" element={<MyTripsPage />} />
            <Route path="/trips/new" element={<p data-testid="create-page">สร้างทริป</p>} />
            <Route path="/trips/:id/manage" element={<ManageTripPage />} />
            <Route path="/trips/:id/booked" element={<BookedTripPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('MyTripsPage', () => {
  it('shows ทริปของคุณ in the mobile nav and opens the page', () => {
    renderMyTrips('/');
    const nav = screen.getByTestId('bottom-nav');
    expect(nav).toHaveTextContent('ทริปของคุณ');
    expect(screen.getByTestId('nav-my-trips-mobile')).toHaveClass('tap-target');
    fireEvent.click(screen.getByTestId('nav-my-trips-mobile'));
    expect(screen.getByTestId('my-trips')).toBeInTheDocument();
    expect(css).toMatch(/--tap:\s*44px/);
  });

  it('renders created and booked badges, soonest upcoming first', () => {
    renderMyTrips('/my-trips');
    const cards = screen.getAllByTestId(/my-trip-/);
    expect(cards.map((el) => el.getAttribute('data-testid'))).toEqual([
      'my-trip-demo-mine-created',
      'my-trip-demo-mine-booked',
    ]);
    expect(screen.getByTestId('role-demo-mine-created')).toHaveTextContent('ฉันสร้าง');
    expect(screen.getByTestId('role-demo-mine-booked')).toHaveTextContent('ฉันจอง');
    expect(screen.getByTestId('my-trip-demo-mine-created')).toHaveTextContent('แท็กซี่');
    expect(screen.getByTestId('my-trip-demo-mine-booked')).toHaveTextContent('รถส่วนตัว');
  });

  it('splits past trips most recent first', () => {
    renderMyTrips('/my-trips?tab=past');
    const cards = screen.getAllByTestId(/my-trip-/);
    expect(cards.map((el) => el.getAttribute('data-testid'))).toEqual([
      'my-trip-demo-mine-past-created',
      'my-trip-demo-mine-past-booked',
    ]);
  });

  it('opens owner manage vs rider booked detail', () => {
    renderMyTrips('/my-trips');
    fireEvent.click(screen.getByTestId('my-trip-demo-mine-created'));
    expect(screen.getByTestId('manage-trip')).toBeInTheDocument();
    expect(screen.getByTestId('owner-badge')).toHaveTextContent('ทริปของคุณ');

    fireEvent.click(screen.getByTestId('nav-my-trips-mobile'));
    fireEvent.click(screen.getByTestId('my-trip-demo-mine-booked'));
    expect(screen.getByTestId('booked-trip')).toBeInTheDocument();
    expect(screen.getByTestId('role-badge')).toHaveTextContent('ฉันจอง');
    expect(screen.getByTestId('own-booking')).toHaveTextContent('ที่นั่งของคุณ');
  });

  it('shows an empty-state CTA to B20 create', () => {
    renderMyTrips('/my-trips?empty=1');
    expect(screen.getByTestId('my-trips-empty')).toHaveTextContent('ยังไม่มีทริปที่จะไป');
    fireEvent.click(screen.getByTestId('empty-create'));
    expect(screen.getByTestId('create-page')).toBeInTheDocument();
  });
});
