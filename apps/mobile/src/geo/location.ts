import * as Location from 'expo-location';

export type UserFix = { lat: number; lng: number; heading: number | null };

export async function requestAndGetLocation(): Promise<UserFix | { denied: true }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { denied: true };
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    heading: pos.coords.heading ?? null,
  };
}

export function watchLocation(
  onFix: (fix: UserFix) => void,
): Promise<Location.LocationSubscription> {
  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 15 },
    (pos) => {
      onFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading ?? null,
      });
    },
  );
}
