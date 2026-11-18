import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FallbackMapProvider } from './MapProvider';
import { MapsProvider } from './MapsProvider';
import { RouteMiniMap } from './RouteMiniMap';
import { resetRouteCache } from './routeCache';
import { createMockMapProvider, MOCK_DEST, MOCK_PLACE } from '../test/mockMapProvider';

describe('RouteMiniMap', () => {
  afterEach(() => {
    resetRouteCache();
    vi.useRealTimers();
  });

  it('does not load Maps JS until origin and destination exist', () => {
    const provider = createMockMapProvider();
    render(
      <MapsProvider provider={provider}>
        <RouteMiniMap origin={null} destination={null} />
      </MapsProvider>,
    );
    expect(provider.load).not.toHaveBeenCalled();
    expect(provider.route).not.toHaveBeenCalled();
    expect(screen.getByTestId('route-mini-map')).toHaveClass('map-placeholder');
  });

  it('debounces, caches, and reports km used by computeFare (12 km → 84 ฿)', async () => {
    const provider = createMockMapProvider();
    const onKm = vi.fn();
    render(
      <MapsProvider provider={provider}>
        <RouteMiniMap origin={MOCK_PLACE} destination={MOCK_DEST} onKm={onKm} />
      </MapsProvider>,
    );
    expect(provider.route).not.toHaveBeenCalled();
    await waitFor(() => expect(provider.route).toHaveBeenCalledTimes(1));
    expect(onKm).toHaveBeenCalledWith(12);
    expect(screen.getByTestId('route-mini-map-km')).toHaveTextContent('12 กม.');
    expect(screen.getByTestId('route-chain').textContent).toContain(MOCK_PLACE.address);
    expect(screen.getByTestId('route-chain').textContent).toContain(MOCK_DEST.address);
  });

  it('keeps saved waypoints in order on the main path', async () => {
    const provider = createMockMapProvider();
    render(
      <MapsProvider provider={provider}>
        <RouteMiniMap
          origin={MOCK_PLACE}
          waypoints={[{ ...MOCK_PLACE, id: 'w1', address: 'แวะ' }]}
          destination={MOCK_DEST}
        />
      </MapsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('route-chain').textContent).toContain('แวะ'));
    expect(screen.getByTestId('route-chain').textContent).toMatch(/แวะ.*ลำพูน/);
  });

  it('falls back to the placeholder map when no key is configured', () => {
    const provider = new FallbackMapProvider();
    const load = vi.spyOn(provider, 'load');
    render(
      <MapsProvider provider={provider}>
        <RouteMiniMap origin={MOCK_PLACE} destination={MOCK_DEST} />
      </MapsProvider>,
    );
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId('route-mini-map')).toHaveClass('map-placeholder');
    expect(screen.getByTestId('route-mini-map-km')).toHaveTextContent('ใส่ระยะทาง');
  });
});
