import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import css from '../index.css?raw';
import { previewMainFare } from '../lib/estimateFare';
import { FallbackMapProvider } from '../maps/MapProvider';
import { MapsProvider } from '../maps/MapsProvider';
import { ROUTE_DEBOUNCE_MS, resetRouteCache } from '../maps/routeCache';
import { mockMatchMedia } from '../test/matchMedia';
import { createMockMapProvider, MOCK_PLACE } from '../test/mockMapProvider';
import { CreateTripPage } from './CreateTripPage';

function renderCreate(ui?: { provider?: ReturnType<typeof createMockMapProvider> | FallbackMapProvider; path?: string }) {
  const provider = ui?.provider ?? createMockMapProvider();
  render(
    <AuthProvider>
      <MapsProvider provider={provider}>
        <MemoryRouter initialEntries={[ui?.path ?? '/trips/new']}>
          <Routes>
            <Route path="/trips/new" element={<CreateTripPage />} />
          </Routes>
        </MemoryRouter>
      </MapsProvider>
    </AuthProvider>,
  );
  return provider;
}

describe('CreateTripPage maps', () => {
  afterEach(() => {
    resetRouteCache();
    vi.useRealTimers();
  });

  it('does not lazy-load Maps until a picker opens', () => {
    mockMatchMedia(390);
    const provider = renderCreate();
    expect(provider.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('place-origin'));
    expect(provider.load).toHaveBeenCalled();
  });

  it('feeds mini-map km into computeFare (12 km → 84 ฿) and ignores luggage', async () => {
    mockMatchMedia(390);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const provider = createMockMapProvider();
    renderCreate({ provider });
    fireEvent.click(screen.getByTestId('place-origin'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    fireEvent.click(screen.getByTestId('place-dest'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    await act(async () => {
      vi.advanceTimersByTime(ROUTE_DEBOUNCE_MS);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(provider.route).toHaveBeenCalled();
    expect(screen.getByTestId('fare-preview')).toHaveTextContent('84');
    expect(previewMainFare(12, 'private').mainFareThb).toBe(84);
    const before = screen.getByTestId('fare-preview').textContent;
    fireEvent.change(screen.getByLabelText('กว้าง (ซม.)'), { target: { value: '999' } });
    expect(screen.getByTestId('fare-preview').textContent).toBe(before);
  });

  it('uses text inputs + placeholder map + manual km when the key is missing', () => {
    mockMatchMedia(390);
    renderCreate({ provider: new FallbackMapProvider() });
    expect(screen.getByTestId('place-origin').tagName).toBe('INPUT');
    expect(screen.getByTestId('place-dest').tagName).toBe('INPUT');
    expect(screen.getByTestId('route-mini-map')).toHaveClass('map-placeholder');
    fireEvent.change(screen.getByLabelText('ระยะทางโดยประมาณ (กม.)'), { target: { value: '10' } });
    expect(screen.getByTestId('fare-preview')).toHaveTextContent('70');
  });

  it('keeps 44px taps and the 390px stacked mini-map layout, including taxi create', () => {
    mockMatchMedia(390);
    renderCreate({ path: '/trips/new?kind=taxi' });
    expect(screen.getByTestId('place-origin')).toHaveClass('tap-target');
    expect(screen.getByTestId('add-stop')).toHaveClass('tap-target');
    expect(screen.getByTestId('route-mini-map')).toBeInTheDocument();
    expect(css).toMatch(/--tap:\s*44px/);
    expect(css).toMatch(/\.place-field-btn\s*\{[^}]*min-height:\s*var\(--tap\)/s);
    expect(css).toMatch(/\.create-map,\s*\.join-map\s*\{[^}]*order:\s*-1/s);
    expect(css).toMatch(/@media \(min-width: 768px\)/);
  });

  it('hides trunk capacity on taxi create and only takes the creator luggage', () => {
    mockMatchMedia(390);
    renderCreate({ path: '/trips/new?kind=taxi' });
    expect(screen.queryByTestId('trunk-capacity')).toBeNull();
    expect(screen.queryByLabelText('กว้าง (ซม.)')).toBeNull();
    expect(screen.queryByLabelText('สูง (ซม.)')).toBeNull();
    expect(screen.queryByLabelText('ยาว (ซม.)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'ท้ายเล็ก' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ท้ายกลาง' })).toBeNull();
    expect(screen.getByTestId('creator-luggage')).toBeInTheDocument();
    expect(screen.getByTestId('no-bags')).toHaveTextContent('ไม่มีสัมภาระ');
    expect(screen.getByLabelText('สูง')).toBeInTheDocument();
    expect(screen.getByLabelText('กว้าง')).toBeInTheDocument();
    expect(screen.getByLabelText('ลึก')).toBeInTheDocument();
    expect(screen.getByTestId('trunk-label')).toHaveTextContent('ท้ายรถ 100×40×50 ซม. = 200 ล.');
    expect(screen.getByTestId('create-submit')).not.toBeDisabled();
  });

  it('disables taxi create when creator luggage overflows the fixed trunk', () => {
    mockMatchMedia(390);
    renderCreate({ path: '/trips/new?kind=taxi' });
    fireEvent.change(screen.getByLabelText('สูง'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('กว้าง'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('ลึก'), { target: { value: '80' } });
    expect(screen.getByTestId('luggage-overflow')).toBeInTheDocument();
    expect(screen.getByTestId('create-submit')).toBeDisabled();
    expect(screen.getByTestId('trunk-fill')).toHaveAttribute('data-overflow', 'true');
  });

  it('keeps private-car trunk capacity inputs', () => {
    mockMatchMedia(390);
    renderCreate();
    expect(screen.getByTestId('trunk-capacity')).toBeInTheDocument();
    expect(screen.getByLabelText('กว้าง (ซม.)')).toHaveValue(100);
    expect(screen.getByLabelText('สูง (ซม.)')).toHaveValue(50);
    expect(screen.getByLabelText('ยาว (ซม.)')).toHaveValue(50);
    expect(screen.queryByTestId('creator-luggage')).toBeNull();
    fireEvent.change(screen.getByLabelText('กว้าง (ซม.)'), { target: { value: '140' } });
    expect(screen.getByLabelText('กว้าง (ซม.)')).toHaveValue(140);
  });

  it('writes the picked address, not the demo Chiang Mai label', async () => {
    mockMatchMedia(1024);
    const provider = renderCreate();
    fireEvent.click(screen.getByTestId('place-origin'));
    fireEvent.change(screen.getByTestId('place-search'), { target: { value: 'วโรรส' } });
    await waitFor(() => screen.getByText(MOCK_PLACE.address));
    fireEvent.click(screen.getByText(MOCK_PLACE.address));
    await waitFor(() => expect(provider.placeDetails).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('place-confirm'));
    expect(screen.getByTestId('place-origin')).toHaveTextContent(MOCK_PLACE.address);
    expect(screen.getByTestId('place-origin').textContent).not.toBe('เชียงใหม่');
  });
});
