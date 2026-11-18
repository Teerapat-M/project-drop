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

  it('redirects the owner to the manage page', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({ data: { ...demoPreview('demo-taxi-12km'), is_mine: true } });
      }
      return Promise.resolve({ data: null, error: null });
    });
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/trips/demo-taxi-12km']}>
          <Routes>
            <Route path="/trips/:id" element={<JoinTripPage />} />
            <Route path="/trips/:id/manage" element={<p data-testid="manage-trip">จัดการทริป</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByTestId('manage-trip')).toBeInTheDocument();
    expect(screen.queryByTestId('join-submit')).toBeNull();
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
    fireEvent.change(detour, { target: { value: '-2' } });
    expect(detour).toHaveValue(9);
    fireEvent.change(detour, { target: { value: '' } });
    expect(detour).toHaveValue(0);
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

  it('subtracts booked luggage plus the joiner form, regardless of preview order', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    renderJoin('/trips/demo-taxi-12km');
    expect(await screen.findByTestId('trunk-label')).toHaveTextContent('ท้ายรถ 100×40×50 ซม. = 200 ล.');
    // booked 50 L + 24 L + joiner default 50 L = 124 L → 76 L left
    expect(screen.getByTestId('trunk-remain')).toHaveTextContent('เหลือ 76 ลิตร');
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'false');
    fireEvent.click(screen.getByTestId('seat-rear_middle'));
    fireEvent.click(screen.getByLabelText(/ร่วมทริปด้วยความเสี่ยง/));
    expect(screen.getByTestId('join-submit')).not.toBeDisabled();
  });

  it('keeps the same remaining space when preview luggage order is reversed', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    const preview = demoPreview('demo-taxi-12km')!;
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({
          data: { ...preview, luggage: [...(preview.luggage ?? [])].reverse() },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin('/trips/demo-taxi-12km');
    expect(await screen.findByTestId('trunk-remain')).toHaveTextContent('เหลือ 76 ลิตร');
  });

  it('turns red and disables join when luggage overflows the taxi trunk', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    renderJoin('/trips/demo-taxi-12km');
    await screen.findByTestId('trunk-remain');
    fireEvent.click(screen.getByTestId('seat-rear_middle'));
    fireEvent.click(screen.getByLabelText(/ร่วมทริปด้วยความเสี่ยง/));
    expect(screen.getByTestId('join-submit')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('สูง'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('กว้าง'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('ลึก'), { target: { value: '80' } });
    expect(screen.getByTestId('luggage-overflow')).toBeInTheDocument();
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'true');
    expect(screen.getByTestId('join-submit')).toBeDisabled();
  });

  it('uses the private-car driver-entered trunk on join', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({ data: demoPreview('demo-private-12km') });
      }
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin('/trips/demo-private-12km');
    expect(await screen.findByTestId('trunk-label')).toHaveTextContent('ท้ายรถ 100×50×50 ซม. = 250 ล.');
    // no booked luggage; joiner default 50 L → 200 L left
    expect(screen.getByTestId('trunk-remain')).toHaveTextContent('เหลือ 200 ลิตร');
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'false');
  });
});
