import { GoogleMapProvider } from './GoogleMapProvider';
import {
  FallbackMapProvider,
  getGoogleMapsApiKey,
  isMapsConfigured,
  type MapProvider,
} from './MapProvider';

let singleton: MapProvider | null = null;

export function createMapProvider(): MapProvider {
  if (singleton) return singleton;
  singleton = isMapsConfigured()
    ? new GoogleMapProvider(getGoogleMapsApiKey())
    : new FallbackMapProvider();
  return singleton;
}

export function resetMapProviderSingleton(): void {
  singleton = null;
}
