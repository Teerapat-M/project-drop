/** Map backend for carpool-web. UI talks only to this interface (OSM later). */

export type LatLng = { lat: number; lng: number };

export type PickedPlace = {
  lat: number;
  lng: number;
  address: string;
};

export type AutocompletePrediction = {
  placeId: string;
  description: string;
};

export type RouteResult = {
  distanceKm: number;
  durationSeconds?: number;
  encodedPolyline?: string;
};

export type MapInstance = {
  setCenter: (coord: LatLng) => void;
  setPath: (points: readonly LatLng[], encodedPolyline?: string) => void;
  destroy: () => void;
};

export type MarkerInstance = {
  setPosition: (coord: LatLng) => void;
  destroy: () => void;
};

export type MapRenderOptions = {
  center: LatLng;
  zoom?: number;
  path?: readonly LatLng[];
  encodedPolyline?: string;
  interactive?: boolean;
  onClick?: (coord: LatLng) => void;
};

export type MarkerRenderOptions = {
  position: LatLng;
  draggable?: boolean;
  label?: string;
  onDragEnd?: (coord: LatLng) => void;
};

/** Places Autocomplete (New) bills a session; skip until 3 trimmed chars. */
export const MIN_AUTOCOMPLETE_CHARS = 3;

export interface MapProvider {
  readonly available: boolean;
  load: () => Promise<void>;
  newAutocompleteSession: () => string;
  endAutocompleteSession: (sessionToken: string) => void;
  autocomplete: (query: string, sessionToken: string) => Promise<AutocompletePrediction[]>;
  placeDetails: (placeId: string, sessionToken: string) => Promise<PickedPlace>;
  reverseGeocode: (coord: LatLng) => Promise<string>;
  route: (points: readonly LatLng[]) => Promise<RouteResult>;
  renderMap: (container: HTMLElement, options: MapRenderOptions) => MapInstance;
  renderMarker: (map: MapInstance, options: MarkerRenderOptions) => MarkerInstance;
}

/** Camera default / no-key persist fallback. Submit uses picked values when present. */
export const FALLBACK_ORIGIN: PickedPlace = {
  lat: 18.788,
  lng: 98.985,
  address: 'เชียงใหม่',
};

export const FALLBACK_DEST: PickedPlace = {
  lat: 18.574,
  lng: 99.009,
  address: 'ลำพูน',
};

const PLACEHOLDER_KEY = 'your-google-maps-api-key';

export function getGoogleMapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
}

export function isMapsConfigured(): boolean {
  const key = getGoogleMapsApiKey().trim();
  return key.length > 0 && key !== PLACEHOLDER_KEY;
}

export class FallbackMapProvider implements MapProvider {
  readonly available = false;

  async load(): Promise<void> {
    return;
  }

  newAutocompleteSession(): string {
    return 'fallback';
  }

  endAutocompleteSession(_sessionToken: string): void {
    return;
  }

  async autocomplete(_query: string, _sessionToken: string): Promise<AutocompletePrediction[]> {
    return [];
  }

  async placeDetails(_placeId: string, _sessionToken: string): Promise<PickedPlace> {
    return { ...FALLBACK_ORIGIN, address: '' };
  }

  async reverseGeocode(_coord: LatLng): Promise<string> {
    return '';
  }

  async route(_points: readonly LatLng[]): Promise<RouteResult> {
    return { distanceKm: 0 };
  }

  renderMap(container: HTMLElement, _options: MapRenderOptions): MapInstance {
    container.replaceChildren();
    const note = document.createElement('div');
    note.className = 'map-placeholder';
    note.textContent = 'แผนที่ (ยังไม่มีคีย์)';
    container.append(note);
    return {
      setCenter: () => undefined,
      setPath: () => undefined,
      destroy: () => {
        container.replaceChildren();
      },
    };
  }

  renderMarker(_map: MapInstance, _options: MarkerRenderOptions): MarkerInstance {
    return {
      setPosition: () => undefined,
      destroy: () => undefined,
    };
  }
}
