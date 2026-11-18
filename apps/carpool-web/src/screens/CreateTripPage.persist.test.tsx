import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { MapsProvider } from '../maps/MapsProvider';
import { mockMatchMedia } from '../test/matchMedia';
import { createMockMapProvider } from '../test/mockMapProvider';
import { CreateTripPage } from './CreateTripPage';

const { tripsInsert, stopsInsert, rpcCalls } = vi.hoisted(() => ({
  tripsInsert: [] as unknown[],
  stopsInsert: [] as unknown[],
  rpcCalls: [] as { name: string; args: unknown }[],
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
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { error: null };
    },
  }),
}));

describe('CreateTripPage persist stops', () => {
  beforeEach(() => {
    tripsInsert.length = 0;
    stopsInsert.length = 0;
    rpcCalls.length = 0;
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
    expect(tripsInsert[0]).toEqual(
      expect.objectContaining({
        pickup_label: expect.any(String),
        dest_label: expect.any(String),
      }),
    );
    expect(tripsInsert[0] as Record<string, unknown>).not.toHaveProperty('origin_province_code');
    expect(tripsInsert[0] as Record<string, unknown>).not.toHaveProperty('dest_district_code');
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

  it('persists the fixed taxi trunk and the creator luggage only', async () => {
    mockMatchMedia(390);
    render(
      <AuthProvider>
        <MapsProvider provider={createMockMapProvider()}>
          <MemoryRouter initialEntries={['/trips/new?kind=taxi']}>
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
    fireEvent.change(screen.getByLabelText('สูง'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('กว้าง'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('ลึก'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'เปิดทริป' }));

    await waitFor(() => expect(tripsInsert.length).toBe(1));
    expect(tripsInsert[0]).toEqual(
      expect.objectContaining({
        kind: 'taxi',
        trunk_w_cm: 100,
        trunk_h_cm: 40,
        trunk_l_cm: 50,
        max_detour_km: 5,
      }),
    );
    await waitFor(() =>
      expect(rpcCalls.some((c) => c.name === 'carpool_claim_owner_seat')).toBe(true),
    );
    expect(rpcCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'carpool_claim_owner_seat',
          args: expect.objectContaining({
            p_trip_id: 'trip-1',
            p_luggage_h_cm: 50,
            p_luggage_w_cm: 40,
            p_luggage_d_cm: 25,
          }),
        }),
      ]),
    );
  });
});
