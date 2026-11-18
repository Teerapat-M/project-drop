import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { MapsProvider } from '../maps/MapsProvider';
import { mockMatchMedia } from '../test/matchMedia';
import { createMockMapProvider } from '../test/mockMapProvider';
import { CreateTripPage } from './CreateTripPage';

const { tripsInsert, stopsInsert } = vi.hoisted(() => ({
  tripsInsert: [] as unknown[],
  stopsInsert: [] as unknown[],
}));

vi.mock('../supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'owner-1' } } }),
      getSession: () =>
        Promise.resolve({
          data: { session: { user: { id: 'owner-1' } } },
        }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: (table: string) => ({
      insert: (row: unknown) => {
        if (table === 'carpool_trips') tripsInsert.push(row);
        if (table === 'carpool_trip_stops') stopsInsert.push(row);
        const done = Promise.resolve({ data: null, error: null });
        return Object.assign(done, {
          select: () => ({
            single: async () => ({ data: { id: 'trip-1' }, error: null }),
          }),
        });
      },
    }),
    rpc: async () => ({ error: null }),
  }),
}));

describe('CreateTripPage persist stops', () => {
  beforeEach(() => {
    tripsInsert.length = 0;
    stopsInsert.length = 0;
  });

  it('saves จุดแวะ in ordered seq after origin → dest', async () => {
    mockMatchMedia(390);
    render(
      <AuthProvider>
        <MapsProvider provider={createMockMapProvider()}>
          <MemoryRouter initialEntries={['/trips/new']}>
            <Routes>
              <Route path="/trips/new" element={<CreateTripPage />} />
              <Route path="/trips/:id/fare" element={<p>fare</p>} />
            </Routes>
          </MemoryRouter>
        </MapsProvider>
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByTestId('place-origin'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    fireEvent.click(screen.getByTestId('place-dest'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    fireEvent.click(screen.getByTestId('add-stop'));
    fireEvent.click(screen.getByTestId('place-stop-0'));
    fireEvent.click(await screen.findByTestId('mock-map'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    fireEvent.click(screen.getByRole('button', { name: 'เปิดทริป' }));

    await waitFor(() => expect(tripsInsert.length).toBe(1));
    await waitFor(() => expect(stopsInsert.length).toBe(1));
    expect(stopsInsert[0]).toEqual([
      expect.objectContaining({
        trip_id: 'trip-1',
        seq: 1,
        lat: expect.any(Number),
        lng: expect.any(Number),
        address: expect.any(String),
      }),
    ]);
  });
});
