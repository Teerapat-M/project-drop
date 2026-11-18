import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { demoPreview } from '../fixtures';
import css from '../index.css?raw';
import { mockMatchMedia } from '../test/matchMedia';
import { MapsProvider } from '../maps/MapsProvider';
import { createMockMapProvider } from '../test/mockMapProvider';
import { JoinTripPage } from './JoinTripPage';

const { rpc, maybeSingle, removeChannel } = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe: () => 'SUBSCRIBED',
    }),
    removeChannel,
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: { user: { id: 'u1' } } },
        }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  }),
}));

function renderJoin(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trips/:id" element={<JoinTripPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('JoinTripPage', () => {
  beforeEach(() => {
    rpc.mockReset();
    maybeSingle.mockReset();
    removeChannel.mockReset();
    maybeSingle.mockResolvedValue({ data: { owner_id: 'u1' } });
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({ data: demoPreview('demo-taxi-12km') });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('ไม่มีสัมภาระ is a 44px label wrapping the checkbox', async () => {
    mockMatchMedia(390);
    renderJoin('/trips/demo-taxi-12km');
    const row = await screen.findByTestId('no-bags');
    expect(row.tagName).toBe('LABEL');
    expect(row).toHaveClass('tap-target');
    expect(row).toHaveClass('check-row');
    expect(row.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(row).toHaveTextContent('ไม่มีสัมภาระ');
    expect(css).toMatch(/--tap:\s*44px/);
    expect(css).toMatch(/\.check-row\s*\{[^}]*min-height:\s*var\(--tap\)/s);
    expect(css).toMatch(/\.check-row input\[type=['']checkbox['']\]\s*\{[^}]*min-height:\s*22px/s);
  });

  it('reverts the optimistic owner seat toggle when the RPC errors', async () => {
    let finishSeatRpc!: (value: { error: { message: string } }) => void;
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({ data: demoPreview('demo-taxi-12km') });
      }
      if (name === 'carpool_set_seat_open') {
        return new Promise((resolve) => {
          finishSeatRpc = resolve;
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderJoin('/trips/demo-taxi-12km?owner=1');
    const seat = await screen.findByTestId('seat-rear_middle');
    expect(seat).toHaveAttribute('data-state', 'open');

    fireEvent.click(seat);
    expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'closed');

    finishSeatRpc({ error: { message: 'cannot open/close a booked seat' } });
    await waitFor(() => {
      expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'open');
    });
    expect(screen.getByText('ไม่สามารถเปิด/ปิดที่นั่งที่ถูกจองแล้ว')).toBeInTheDocument();
  });

  it('auto-fills detour km from via-path minus route_km and does not overwrite a manual edit', async () => {
    mockMatchMedia(390);
    const provider = createMockMapProvider();
    render(
      <AuthProvider>
        <MapsProvider provider={provider}>
          <MemoryRouter initialEntries={['/trips/demo-taxi-12km']}>
            <Routes>
              <Route path="/trips/:id" element={<JoinTripPage />} />
            </Routes>
          </MemoryRouter>
        </MapsProvider>
      </AuthProvider>,
    );
    const detour = await screen.findByTestId('detour-km');
    await waitFor(() => expect(provider.route).toHaveBeenCalled());
    expect(detour).toHaveValue(0);

    fireEvent.click(screen.getByTestId('place-rider-stop'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    await waitFor(() => expect(detour).toHaveValue(3));
    expect(provider.route.mock.calls.some((c) => (c[0] as unknown[]).length > 2)).toBe(true);

    fireEvent.change(detour, { target: { value: '9' } });
    expect(detour).toHaveValue(9);
    const calls = provider.route.mock.calls.length;
    fireEvent.click(screen.getByTestId('place-rider-stop'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    await waitFor(() => expect(provider.route.mock.calls.length).toBeGreaterThanOrEqual(calls));
    expect(detour).toHaveValue(9);
  });

  it('opens a map picker for the rider stop at 390px', async () => {
    mockMatchMedia(390);
    const provider = createMockMapProvider();
    render(
      <AuthProvider>
        <MapsProvider provider={provider}>
          <MemoryRouter initialEntries={['/trips/demo-taxi-12km']}>
            <Routes>
              <Route path="/trips/:id" element={<JoinTripPage />} />
            </Routes>
          </MemoryRouter>
        </MapsProvider>
      </AuthProvider>,
    );
    const field = await screen.findByTestId('place-rider-stop');
    expect(field).toHaveClass('tap-target');
    fireEvent.click(field);
    expect(screen.getByTestId('place-picker')).toHaveAttribute('data-mode', 'fullscreen');
    expect(provider.load).toHaveBeenCalled();
  });
});
