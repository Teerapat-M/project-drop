import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { demoPreview } from '../fixtures';
import css from '../index.css?raw';
import { mockMatchMedia } from '../test/matchMedia';
import { FallbackMapProvider } from '../maps/MapProvider';
import { MapsProvider } from '../maps/MapsProvider';
import { resetRouteCache } from '../maps/routeCache';
import { createMockMapProvider } from '../test/mockMapProvider';
import { JoinTripPage } from './JoinTripPage';

const { rpc, maybeSingle, removeChannel, getSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  removeChannel: vi.fn(),
  getSession: vi.fn(),
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
      getSession,
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

function pinDestText(address = 'ตลาดกลาง') {
  fireEvent.change(screen.getByTestId('place-rider-stop'), { target: { value: address } });
}

function pickSeatAndRisk() {
  fireEvent.click(screen.getByTestId('seat-rear_middle'));
  fireEvent.click(screen.getByLabelText(/ร่วมทริปด้วยความเสี่ยง/));
}

describe('JoinTripPage', () => {
  afterEach(() => {
    resetRouteCache();
    vi.useRealTimers();
  });

  beforeEach(() => {
    rpc.mockReset();
    maybeSingle.mockReset();
    removeChannel.mockReset();
    getSession.mockReset();
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    });
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
    fireEvent.change(detour, { target: { value: String(0.1 + 0.2) } });
    expect(detour).toHaveValue(0.3);
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
    pinDestText();
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
    pinDestText();
    fireEvent.click(screen.getByTestId('seat-rear_middle'));
    fireEvent.click(screen.getByLabelText(/ร่วมทริปด้วยความเสี่ยง/));
    expect(screen.getByTestId('join-submit')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('สูง'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('กว้าง'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('ลึก'), { target: { value: '80' } });
    expect(screen.getByTestId('luggage-overflow')).toBeInTheDocument();
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'true');
    expect(screen.getByTestId('join-submit')).toBeDisabled();
    expect(screen.getByTestId('join-hint')).toHaveTextContent('สัมภาระเกินที่ว่างท้ายรถ');
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

  it('shows the first unmet join hint in order and enables once all are met', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    renderJoin('/trips/demo-taxi-12km');
    await waitFor(() =>
      expect(screen.getByTestId('join-hint')).toHaveTextContent('เลือกที่นั่งก่อน'),
    );
    expect(screen.getByTestId('join-submit')).toBeDisabled();
    expect(screen.getByTestId('join-submit')).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('join-hint').id,
    );

    fireEvent.click(screen.getByTestId('seat-rear_middle'));
    expect(screen.getByTestId('join-hint')).toHaveTextContent('ปักหมุดปลายทางของคุณ');

    pinDestText();
    expect(screen.getByTestId('join-hint')).toHaveTextContent('ติ๊กยอมรับความเสี่ยงก่อน');

    fireEvent.click(screen.getByLabelText(/ร่วมทริปด้วยความเสี่ยง/));
    expect(screen.queryByTestId('join-hint')).toBeNull();
    expect(screen.getByTestId('join-submit')).not.toBeDisabled();
  });

  it('enables for a non-owner with seat, pin, and risk ticked (Bell)', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    renderJoin('/trips/demo-taxi-12km');
    await screen.findByTestId('join-submit');
    pinDestText();
    pickSeatAndRisk();
    expect(screen.getByTestId('join-submit')).not.toBeDisabled();
    expect(screen.queryByTestId('join-hint')).toBeNull();
  });

  it('falls back and enables when the route call fails or there is no Maps key', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    const provider = new FallbackMapProvider();
    const onRoute = vi.spyOn(provider, 'route');
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
    await screen.findByTestId('join-submit');
    pinDestText('เซ็นทรัลเฟสติวัล');
    pickSeatAndRisk();
    expect(screen.getByTestId('join-submit')).not.toBeDisabled();
    expect(onRoute).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('detour-fallback-note')).toBeInTheDocument());
  });

  it('shows กำลังคำนวณเส้นทาง while an off-trip route is pending', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    const provider = createMockMapProvider();
    provider.route.mockImplementation(() => new Promise(() => undefined));
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
    await screen.findByTestId('join-submit');
    fireEvent.click(screen.getByTestId('place-rider-stop'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    pickSeatAndRisk();
    expect(screen.getByTestId('join-hint')).toHaveTextContent('กำลังคำนวณเส้นทาง…');
    expect(screen.getByTestId('join-submit')).toBeDisabled();
  });

  it('shows เข้าสู่ระบบก่อน when there is no session', async () => {
    mockMatchMedia(390);
    getSession.mockResolvedValue({ data: { session: null } });
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    renderJoin('/trips/demo-taxi-12km');
    expect(await screen.findByTestId('join-hint')).toHaveTextContent('เข้าสู่ระบบก่อน');
    expect(screen.getByTestId('join-submit')).toBeDisabled();
  });

  it('falls back and enables when the Routes call rejects', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    const provider = createMockMapProvider();
    provider.route.mockRejectedValue(new Error('routes down'));
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
    await screen.findByTestId('join-submit');
    fireEvent.click(screen.getByTestId('place-rider-stop'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    pickSeatAndRisk();
    await waitFor(() => expect(screen.getByTestId('join-submit')).not.toBeDisabled());
    expect(screen.getByTestId('detour-fallback-note')).toBeInTheDocument();
  });

  it('fits the taxi owner route in the drop-off picker and warns above max detour', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
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
    await screen.findByTestId('join-submit');
    fireEvent.click(screen.getByTestId('place-rider-stop'));
    await waitFor(() => expect(screen.getByTestId('mock-map')).toBeInTheDocument());
    const fitted = provider.lastFitBounds;
    expect(fitted?.some((p) => p.lat === 13.75 && p.lng === 100.5)).toBe(true);
    expect(fitted?.some((p) => p.lat === 14.35 && p.lng === 100.57)).toBe(true);
    expect(fitted?.some((p) => Math.abs(p.lat - 18.788) < 0.05)).toBe(false);

    fireEvent.click(screen.getByTestId('mock-map'));
    expect(await screen.findByTestId('max-detour-warning')).toHaveTextContent('ออกนอกเส้นทาง');
    expect(screen.getByTestId('place-confirm')).toBeDisabled();
  });

  it('feeds the max-detour warning into the B21 join hint when via km exceeds the cap', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({
          data: { ...demoPreview('demo-taxi-12km'), max_detour_km: 1 },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
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
    await screen.findByTestId('join-submit');
    fireEvent.click(screen.getByTestId('place-rider-stop'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    pickSeatAndRisk();
    await waitFor(() => {
      expect(screen.getByTestId('join-hint')).toHaveTextContent('ออกนอกเส้นทาง');
    });
    expect(screen.getByTestId('join-hint')).toHaveTextContent('สูงสุด 1 กม.');
    expect(screen.getByTestId('join-submit')).toBeDisabled();
  });

  it('shows ทริปนี้ปิดรับแล้ว when the trip is not open', async () => {
    mockMatchMedia(390);
    maybeSingle.mockResolvedValue({ data: { owner_id: 'other' } });
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({ data: { ...demoPreview('demo-taxi-12km'), status: 'cancelled' } });
      }
      return Promise.resolve({ data: null, error: null });
    });
    renderJoin('/trips/demo-taxi-12km');
    expect(await screen.findByTestId('join-hint')).toHaveTextContent('ทริปนี้ปิดรับแล้ว');
    expect(screen.getByTestId('join-submit')).toBeDisabled();
  });
});

