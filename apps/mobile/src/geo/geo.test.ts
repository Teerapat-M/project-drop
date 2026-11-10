import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { estimateFare } from '@drop/types';
import { debounce, GEOCODE_DEBOUNCE_MS, GEOCODE_MIN_LENGTH } from './debounce';
import { parseGeocodeResponse, geocodeSearchUrl, reverseGeocodeUrl } from './geocode';
import { haversineMeters, sortByDistance, formatDistanceM, formatDurationS } from './haversine';
import { parseOsrmRoute, osrmRouteUrl } from './osrm';

describe('estimateFare stub', () => {
  it('returns null', () => {
    expect(estimateFare(1000, 60, 'bike')).toBeNull();
  });
});

describe('debounce', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits at least 500ms and only fires the last call', () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    const d = debounce(fn, GEOCODE_DEBOUNCE_MS);
    d('a');
    d('ab');
    d('abc');
    jest.advanceTimersByTime(GEOCODE_DEBOUNCE_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('abc');
  });
});

describe('geocode parsing', () => {
  it('parses Photon features', () => {
    const hits = parseGeocodeResponse({
      features: [
        {
          geometry: { coordinates: [100.5347, 13.7466] },
          properties: { name: 'Siam Paragon', city: 'Bangkok', country: 'Thailand' },
        },
      ],
    });
    expect(hits).toEqual([
      {
        lat: 13.7466,
        lng: 100.5347,
        name: 'Siam Paragon',
        details: 'Bangkok, Thailand',
        label: 'Siam Paragon, Bangkok, Thailand',
      },
    ]);
  });

  it('parses Nominatim rows', () => {
    const hits = parseGeocodeResponse([
      { lat: '13.7998', lon: '100.5503', display_name: 'Chatuchak Weekend Market, Bangkok' },
    ]);
    expect(hits[0]?.lat).toBe(13.7998);
    expect(hits[0]?.lng).toBe(100.5503);
    expect(hits[0]?.name).toBe('Chatuchak Weekend Market');
  });

  it('builds Photon vs Nominatim URLs', () => {
    expect(geocodeSearchUrl('siam', 'https://photon.komoot.io/api')).toContain('q=siam');
    expect(geocodeSearchUrl('siam', 'https://nominatim.openstreetmap.org')).toContain('/search');
    expect(reverseGeocodeUrl(13.7, 100.5, 'https://photon.komoot.io/api')).toContain('/reverse');
  });

  it('enforces a minimum query length of 3', () => {
    expect(GEOCODE_MIN_LENGTH).toBeGreaterThanOrEqual(3);
  });
});

describe('haversine sort', () => {
  it('sorts nearest first', () => {
    const origin = { lat: 13.7466, lng: 100.5347 };
    const items = [
      { id: 'far', lat: 13.69, lng: 100.75 },
      { id: 'near', lat: 13.747, lng: 100.535 },
    ];
    const sorted = sortByDistance(origin, items, (x) => x);
    expect(sorted.map((x) => x.id)).toEqual(['near', 'far']);
    expect(haversineMeters(origin, origin)).toBe(0);
  });

  it('formats distance and duration', () => {
    expect(formatDistanceM(9800)).toBe('9.8 km');
    expect(formatDurationS(1440)).toBe('24 min');
  });
});

describe('osrm parsing', () => {
  it('reads distance, duration, and geojson coordinates', () => {
    const route = parseOsrmRoute({
      routes: [
        {
          distance: 9800,
          duration: 1440,
          geometry: { coordinates: [[100.53, 13.74], [100.55, 13.8]] },
        },
      ],
    });
    expect(route).toEqual({
      distanceM: 9800,
      durationS: 1440,
      coordinates: [
        [100.53, 13.74],
        [100.55, 13.8],
      ],
    });
  });

  it('builds the demo router URL', () => {
    expect(
      osrmRouteUrl({ lat: 13.74, lng: 100.53 }, { lat: 13.8, lng: 100.55 }, 'https://router.project-osrm.org'),
    ).toContain('/route/v1/driving/100.53,13.74;100.55,13.8');
  });
});
