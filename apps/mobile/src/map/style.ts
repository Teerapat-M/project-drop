export const DEFAULT_MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const DEFAULT_MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
export const MAP_ATTRIBUTION = '© OpenStreetMap contributors · OpenFreeMap';

export function mapStyleUrl(mode: 'light' | 'dark'): string {
  const pinned = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
  if (pinned) return pinned;
  return mode === 'dark' ? DEFAULT_MAP_STYLE_DARK : DEFAULT_MAP_STYLE_LIGHT;
}

export const BANGKOK_CENTER = { lat: 13.7466, lng: 100.5347 };
