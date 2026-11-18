import { vi } from 'vitest';
import type {
  LatLng,
  MapInstance,
  MapProvider,
  MapRenderOptions,
  MarkerRenderOptions,
  PickedPlace,
} from '../maps/MapProvider';

export const MOCK_PLACE: PickedPlace = {
  lat: 18.796,
  lng: 98.993,
  address: 'ตลาดวโรรส เชียงใหม่',
};

export const MOCK_DEST: PickedPlace = {
  lat: 18.574,
  lng: 99.009,
  address: 'ลำพูน',
};

export function createMockMapProvider(): MapProvider & {
  load: ReturnType<typeof vi.fn>;
  autocomplete: ReturnType<typeof vi.fn>;
  placeDetails: ReturnType<typeof vi.fn>;
  reverseGeocode: ReturnType<typeof vi.fn>;
  route: ReturnType<typeof vi.fn>;
  newAutocompleteSession: ReturnType<typeof vi.fn>;
  endAutocompleteSession: ReturnType<typeof vi.fn>;
  lastFitBounds: LatLng[] | null;
} {
  const load = vi.fn(async () => undefined);
  const autocomplete = vi.fn(async (query: string) =>
    query.trim() ? [{ placeId: 'p1', description: MOCK_PLACE.address }] : [],
  );
  const placeDetails = vi.fn(async () => MOCK_PLACE);
  const reverseGeocode = vi.fn(async (coord: LatLng) => `ปักหมุด ${coord.lat.toFixed(3)},${coord.lng.toFixed(3)}`);
  const route = vi.fn(async (points: readonly LatLng[]) => ({
    distanceKm: points.length <= 2 ? 12 : 15,
    encodedPolyline: 'abc',
  }));
  let sessionN = 0;
  const newAutocompleteSession = vi.fn(() => `session-${(sessionN += 1)}`);
  const endAutocompleteSession = vi.fn();

  const lastFit: { current: LatLng[] | null } = { current: null };

  return {
    available: true,
    get lastFitBounds() {
      return lastFit.current;
    },
    load,
    autocomplete,
    placeDetails,
    reverseGeocode,
    route,
    newAutocompleteSession,
    endAutocompleteSession,
    renderMap(container: HTMLElement, options: MapRenderOptions): MapInstance {
      container.replaceChildren();
      const node = document.createElement('button');
      node.type = 'button';
      node.setAttribute('data-testid', 'mock-map');
      node.textContent = 'map';
      node.addEventListener('click', () => options.onClick?.({ lat: 18.801, lng: 98.99 }));
      container.append(node);
      return {
        setCenter: () => undefined,
        setPath: () => undefined,
        fitBounds: (points) => {
          lastFit.current = [...points];
        },
        destroy: () => container.replaceChildren(),
      };
    },
    renderMarker(_map: MapInstance, _options: MarkerRenderOptions) {
      return {
        setPosition: () => undefined,
        destroy: () => undefined,
      };
    },
  };
}
