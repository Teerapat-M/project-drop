import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { mockMatchMedia } from '../test/matchMedia';
import { BookedTripPage } from './BookedTripPage';

describe('BookedTripPage', () => {
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
    expect(screen.getByText('แชท')).toBeInTheDocument();
    expect(screen.getByTestId('route-mini-map')).toBeInTheDocument();
    expect(screen.queryByTestId('join-submit')).toBeNull();
  });
});
