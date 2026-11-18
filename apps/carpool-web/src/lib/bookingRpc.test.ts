import { describe, expect, it, vi } from 'vitest';
import { bookingDestRpcArgs, setBookingDest } from './bookingRpc';

describe('bookingRpc', () => {
  it('calls carpool_set_booking_dest, never a table UPDATE', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { dest_label: 'คลองเตย' }, error: null });
    await setBookingDest({ rpc }, {
      tripId: 't1',
      destLabel: 'คลองเตย',
      destLat: 13.72,
      destLng: 100.57,
    });
    expect(rpc).toHaveBeenCalledWith(
      'carpool_set_booking_dest',
      bookingDestRpcArgs({
        tripId: 't1',
        destLabel: 'คลองเตย',
        destLat: 13.72,
        destLng: 100.57,
      }),
    );
    expect(rpc.mock.calls[0][0]).not.toMatch(/update/i);
  });
});
