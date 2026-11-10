import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { interpolatePose, lerp, lerpHeading, poseAt } from './interpolate';
import {
  ROUTE_REFRESH_MIN_INTERVAL_MS,
  ROUTE_REFRESH_MIN_MOVE_M,
  shouldRefreshRoute,
} from './routeRefresh';
import { cleanupChannels, createReconnect, nextBackoffMs, shouldReconnect } from './backoff';
import { applyFullscreen, showFullscreenPill, showSos } from './fullscreen';

describe('marker interpolation', () => {
  it('lerps lat/lng and shortest-path heading', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    const mid = interpolatePose(
      { lat: 13.74, lng: 100.53, heading: 350 },
      { lat: 13.76, lng: 100.55, heading: 10 },
      0.5,
    );
    expect(mid.lat).toBeCloseTo(13.75);
    expect(mid.lng).toBeCloseTo(100.54);
    expect(mid.heading).toBeCloseTo(0);
    expect(lerpHeading(10, 350, 0.5)).toBeCloseTo(0);
  });

  it('clamps t and reports done after duration', () => {
    const from = { lat: 0, lng: 0, heading: 0 };
    const to = { lat: 1, lng: 1, heading: 90 };
    expect(poseAt(from, to, 1000, 500, 1000).pose).toEqual(from);
    expect(poseAt(from, to, 1000, 500, 2000).done).toBe(true);
    expect(poseAt(from, to, 1000, 500, 1250).pose.lat).toBeCloseTo(0.5);
  });
});

describe('route refresh throttle', () => {
  const origin = { at: 1_000, lat: 13.7466, lng: 100.5347 };

  it('refreshes on the first fix, then waits ~15s and meaningful movement', () => {
    expect(shouldRefreshRoute(null, origin)).toBe(true);
    expect(
      shouldRefreshRoute(origin, { at: origin.at + ROUTE_REFRESH_MIN_INTERVAL_MS - 1, lat: 13.8, lng: 100.6 }),
    ).toBe(false);
    expect(
      shouldRefreshRoute(origin, {
        at: origin.at + ROUTE_REFRESH_MIN_INTERVAL_MS,
        lat: origin.lat,
        lng: origin.lng,
      }),
    ).toBe(false);
    expect(
      shouldRefreshRoute(origin, {
        at: origin.at + ROUTE_REFRESH_MIN_INTERVAL_MS,
        lat: origin.lat + 0.001,
        lng: origin.lng,
      }),
    ).toBe(true);
    expect(ROUTE_REFRESH_MIN_MOVE_M).toBeGreaterThanOrEqual(30);
  });
});

describe('reconnect backoff', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('doubles up to the cap and reconnects on error / net / foreground', () => {
    expect(nextBackoffMs(0)).toBe(1000);
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(10)).toBe(30_000);
    expect(shouldReconnect('CHANNEL_ERROR')).toBe(true);
    expect(shouldReconnect('SUBSCRIBED')).toBe(false);

    jest.useFakeTimers();
    const unsubs: string[] = [];
    let connects = 0;
    const ctl = createReconnect({
      connect: () => {
        connects += 1;
        const id = `c${connects}`;
        return { unsubscribe: () => unsubs.push(id) };
      },
    });
    ctl.start();
    expect(connects).toBe(1);
    ctl.handleStatus('CHANNEL_ERROR');
    expect(unsubs).toEqual(['c1']);
    jest.advanceTimersByTime(999);
    expect(connects).toBe(1);
    jest.advanceTimersByTime(1);
    expect(connects).toBe(2);

    ctl.handleNetInfo(false);
    expect(unsubs).toContain('c2');
    ctl.handleNetInfo(true);
    expect(connects).toBe(3);

    ctl.handleStatus('CLOSED');
    ctl.handleAppState('background');
    const before = connects;
    ctl.stop();
    ctl.handleAppState('active');
    expect(connects).toBe(before);
  });

  it('cleans up every channel handle', () => {
    const a = { unsubscribe: jest.fn() };
    const b = { remove: jest.fn() };
    cleanupChannels([a, b]);
    expect(a.unsubscribe).toHaveBeenCalled();
    expect(b.remove).toHaveBeenCalled();
  });
});

describe('fullscreen toggle', () => {
  it('enters from D02/D03/D04, exits on back, and never shows on D01', () => {
    expect(showFullscreenPill('home')).toBe(false);
    expect(showFullscreenPill('incoming')).toBe(true);
    expect(showFullscreenPill('pickup')).toBe(true);
    expect(showFullscreenPill('trip')).toBe(true);
    expect(showSos('trip')).toBe(true);
    expect(showSos('pickup')).toBe(false);
    expect(applyFullscreen(false, 'enter')).toBe(true);
    expect(applyFullscreen(true, 'back')).toBe(false);
    expect(applyFullscreen(true, 'exit')).toBe(false);
    expect(applyFullscreen(false, 'toggle')).toBe(true);
    expect(applyFullscreen(true, 'toggle')).toBe(false);
  });
});
