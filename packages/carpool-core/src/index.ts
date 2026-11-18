export {
  RATE_THB_PER_KM,
  FareError,
  computeFare,
  splitSatang,
  type VehicleKind,
  type SeatRole,
  type SeatInput,
  type FareBreakdown,
  type PersonFare,
  type ComputeFareInput,
  type FareResult,
} from './fare';

export {
  MAX_DROPOFF_RIDERS,
  EARTH_RADIUS_M,
  DropoffOrderError,
  haversineMeters,
  orderDropoffs,
  type GeoPoint,
  type RiderDestination,
  type DistanceFn,
  type DropoffOrderInput,
  type DropoffOrderResult,
} from './dropoffOrder';

export {
  MIN_SHORT_SIDE_FRAME_RATIO,
  CORNER_RADIUS_RATIO,
  TAXI_TRUNK_PRESET,
  TrunkError,
  scaledTrunkSize,
  luggageUsedVol,
  remainingTrunkSpace,
  layoutTrunk,
  type LuggagePiece,
  type TrunkDims,
  type RemainingTrunkSpace,
  type TrunkInput,
  type TrunkRect,
  type TrunkLayout,
} from './trunk';

export { BANGKOK_CENTER } from './geo';

export {
  MAX_DETOUR_KM_MIN,
  MAX_DETOUR_KM_DEFAULT,
  MAX_DETOUR_KM_MAX,
  roundKm,
  formatKm,
  clampMaxDetourKm,
  parseMaxDetourKm,
  detourFloorKm,
  maxDetourExceeded,
  maxDetourWarning,
} from './detour';

export {
  SEARCH_RADIUS_KM_MIN,
  SEARCH_RADIUS_KM_DEFAULT,
  SEARCH_RADIUS_KM_MAX,
  clampSearchRadiusKm,
  nearestRouteVertex,
  matchSearchRoute,
  type NearestVertex,
  type SearchMatch,
} from './search';
