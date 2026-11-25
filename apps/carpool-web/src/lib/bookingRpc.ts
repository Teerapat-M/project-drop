import { capStoredLabel } from '@drop/carpool-core';

export type BookingDestArgs = {
  tripId: string;
  destLabel: string;
  destLat: number;
  destLng: number;
};

export function bookingDestRpcArgs(args: BookingDestArgs) {
  return {
    p_trip_id: args.tripId,
    p_dest_label: capStoredLabel(args.destLabel),
    p_dest_lat: args.destLat,
    p_dest_lng: args.destLng,
  };
}

export async function setBookingDest(
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  },
  args: BookingDestArgs,
) {
  return supabase.rpc('carpool_set_booking_dest', bookingDestRpcArgs(args));
}
