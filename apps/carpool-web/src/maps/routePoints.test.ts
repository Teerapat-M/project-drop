import { describe, expect, it } from 'vitest';
import { detourFromViaKm, orderedRoute, waypointsFromOrdered } from './routePoints';

describe('orderedRoute', () => {
  it('keeps destination last and orders stops by shortest drop-off', async () => {
    const origin = { lat: 0, lng: 0 };
    const near = { lat: 0, lng: 0.01 };
    const far = { lat: 0, lng: 0.05 };
    const dest = { lat: 0, lng: 0.1 };
    const result = await orderedRoute({
      origin,
      originLabel: 'รับ',
      stops: [
        { id: 'far', coord: far, label: 'ไกล' },
        { id: 'near', coord: near, label: 'ใกล้' },
      ],
      destination: dest,
      destinationLabel: 'ปลายทาง',
    });
    expect(result?.labels).toEqual(['รับ', 'ใกล้', 'ไกล', 'ปลายทาง']);
    expect(result?.points[0]).toEqual(origin);
    expect(result?.points.at(-1)).toEqual(dest);
  });

  it('keeps saved waypoints in seq and persists them between origin and dest', async () => {
    const origin = { lat: 0, lng: 0 };
    const way = { lat: 0, lng: 0.02 };
    const extra = { lat: 0, lng: 0.04 };
    const dest = { lat: 0, lng: 0.1 };
    const result = await orderedRoute({
      origin,
      originLabel: 'รับ',
      waypoints: [{ id: 'w1', coord: way, label: 'แวะ' }],
      stops: [{ id: 'you', coord: extra, label: 'ลงคุณ' }],
      destination: dest,
      destinationLabel: 'ปลายทาง',
    });
    expect(result?.labels).toEqual(['รับ', 'แวะ', 'ลงคุณ', 'ปลายทาง']);
    expect(waypointsFromOrdered(result!)).toEqual([
      { seq: 1, lat: way.lat, lng: way.lng, address: 'แวะ' },
      { seq: 2, lat: extra.lat, lng: extra.lng, address: 'ลงคุณ' },
    ]);
  });

  it('detourFromViaKm is max(0, via − main) for computeFare detourKm', () => {
    expect(detourFromViaKm(15, 12)).toBe(3);
    expect(detourFromViaKm(10, 12)).toBe(0);
    expect(detourFromViaKm(Number.NaN, 12)).toBe(0);
  });
});
