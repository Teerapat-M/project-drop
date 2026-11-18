import { describe, expect, it } from 'vitest';
import { orderedRoute } from './routePoints';

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
});
