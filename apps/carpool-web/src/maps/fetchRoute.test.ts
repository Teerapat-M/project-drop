import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockMapProvider } from '../test/mockMapProvider';
import { fetchRoute, ROUTE_TIMEOUT_MS } from './fetchRoute';
import { resetRouteCache } from './routeCache';

describe('fetchRoute timeout', () => {
  afterEach(() => {
    resetRouteCache();
    vi.useRealTimers();
  });

  it('rejects when the provider never returns', async () => {
    vi.useFakeTimers();
    const provider = createMockMapProvider();
    provider.route.mockImplementation(() => new Promise(() => undefined));
    const pending = fetchRoute(provider, [
      { lat: 13.75, lng: 100.5 },
      { lat: 14.35, lng: 100.57 },
    ]);
    const expectReject = expect(pending).rejects.toThrow('route-timeout');
    await vi.advanceTimersByTimeAsync(ROUTE_TIMEOUT_MS);
    await expectReject;
  });
});
