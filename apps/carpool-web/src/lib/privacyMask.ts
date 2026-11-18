import {
  coarseAddress,
  offsetPoint,
  shouldRevealPickup,
  stableOffset,
  type GeoPoint,
} from '@drop/carpool-core';

export type MaskableTrip = {
  id: string;
  status: string;
  depart_at: string;
  pickup_label: string;
  dest_label: string;
  pickup_lat: number;
  pickup_lng: number;
  dest_lat: number;
  dest_lng: number;
  is_mine?: boolean;
  hide_dest?: boolean;
  pickup_approx?: boolean;
};

export function maskTripForViewer<T extends MaskableTrip>(
  trip: T,
  viewer: { isOwner: boolean; isBookedRider: boolean; now?: Date },
): T {
  if (viewer.isOwner || trip.is_mine) {
    return { ...trip, pickup_approx: false, hide_dest: trip.hide_dest ?? false };
  }
  const reveal = shouldRevealPickup({
    isOwner: false,
    isBookedRider: viewer.isBookedRider,
    status: trip.status,
    departAt: trip.depart_at,
    now: viewer.now,
  });
  const pickSeed = stableOffset(trip.id);
  const destSeed = stableOffset(`${trip.id}:dest`);
  const truePickup: GeoPoint = { lat: trip.pickup_lat, lng: trip.pickup_lng };
  const trueDest: GeoPoint = { lat: trip.dest_lat, lng: trip.dest_lng };
  const pickup = reveal ? truePickup : offsetPoint(truePickup, pickSeed.bearingRad, pickSeed.km);
  const hideDest = trip.hide_dest === true;
  const dest = hideDest ? offsetPoint(trueDest, destSeed.bearingRad, destSeed.km) : trueDest;
  return {
    ...trip,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dest_lat: dest.lat,
    dest_lng: dest.lng,
    pickup_label: reveal ? trip.pickup_label : coarseAddress(trip.pickup_label),
    dest_label: hideDest ? coarseAddress(trip.dest_label) : trip.dest_label,
    hide_dest: hideDest,
    pickup_approx: !reveal,
  };
}
