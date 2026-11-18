import {
  FALLBACK_ORIGIN,
  MIN_AUTOCOMPLETE_CHARS,
  type AutocompletePrediction,
  type LatLng,
  type MapInstance,
  type MapProvider,
  type MapRenderOptions,
  type MarkerInstance,
  type MarkerRenderOptions,
  type PickedPlace,
  type RouteResult,
} from './MapProvider';
import {
  ROUTES_FIELD_MASK,
  ROUTES_URL,
  buildComputeRoutesBody,
  kmFromMeters,
  secondsFromDuration,
} from './googleMapsApi';

type Listener = { remove: () => void };

type GMap = {
  setCenter: (c: LatLng) => void;
  setOptions?: (opts: Record<string, unknown>) => void;
  fitBounds?: (bounds: unknown) => void;
};

type GMarker = {
  setPosition: (c: LatLng) => void;
  setMap: (map: GMap | null) => void;
};

type GPolyline = {
  setPath: (path: LatLng[]) => void;
  setMap: (map: GMap | null) => void;
};

type GMaps = {
  importLibrary?: (name: string) => Promise<Record<string, unknown>>;
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Polyline: new (opts: Record<string, unknown>) => GPolyline;
  Geocoder: new () => {
    geocode: (
      req: Record<string, unknown>,
      cb?: (results: Array<{ formatted_address?: string }> | null, status: string) => void,
    ) => Promise<{ results: Array<{ formatted_address?: string }> }> | void;
  };
  event: {
    addListener: (inst: unknown, name: string, fn: (...args: never[]) => void) => Listener;
  };
  geometry?: {
    encoding?: { decodePath: (encoded: string) => LatLng[] };
  };
  places?: {
    AutocompleteSessionToken?: new () => unknown;
    AutocompleteSuggestion?: {
      fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{
        suggestions: Array<{
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            toPlace?: () => {
              fetchFields: (req: Record<string, unknown>) => Promise<void>;
              location?: { lat: () => number; lng: () => number } | LatLng;
              formattedAddress?: string;
            };
          };
        }>;
      }>;
    };
    Place?: new (opts: { id: string }) => {
      fetchFields: (req: Record<string, unknown>) => Promise<void>;
      location?: { lat: () => number; lng: () => number } | LatLng;
      formattedAddress?: string;
    };
    AutocompleteService?: new () => {
      getPlacePredictions: (
        req: Record<string, unknown>,
        cb: (
          preds: Array<{ place_id: string; description: string }> | null,
          status: string,
        ) => void,
      ) => void;
    };
    PlacesService?: new (el: HTMLElement) => {
      getDetails: (
        req: Record<string, unknown>,
        cb: (
          place: {
            geometry?: { location?: { lat: () => number; lng: () => number } };
            formatted_address?: string;
          } | null,
          status: string,
        ) => void,
      ) => void;
    };
    PlacesServiceStatus?: { OK: string };
  };
  DirectionsService?: new () => {
    route: (
      req: Record<string, unknown>,
      cb: (
        res: {
          routes?: Array<{
            overview_polyline?: string | { points?: string };
            legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }>;
          }>;
        } | null,
        status: string,
      ) => void,
    ) => void;
  };
  TravelMode?: { DRIVING: string };
  DirectionsStatus?: { OK: string };
  LatLngBounds?: new () => { extend: (c: LatLng) => void };
};

type GoogleWindow = Window & { google?: { maps?: GMaps }; __carpoolMapsReady?: () => void };

type NativeMap = MapInstance & { native: GMap };

let loadPromise: Promise<void> | null = null;

function gmaps(): GMaps {
  const maps = (window as GoogleWindow).google?.maps;
  if (!maps) throw new Error('Google Maps JS is not loaded');
  return maps;
}

function asLatLng(value: { lat: () => number; lng: () => number } | LatLng | undefined): LatLng {
  if (!value) return FALLBACK_ORIGIN;
  if (typeof (value as { lat: unknown }).lat === 'function') {
    const ll = value as { lat: () => number; lng: () => number };
    return { lat: ll.lat(), lng: ll.lng() };
  }
  return value as LatLng;
}

function clickCoord(event: { latLng?: { lat: () => number; lng: () => number } }): LatLng | null {
  return event.latLng ? asLatLng(event.latLng) : null;
}

export class GoogleMapProvider implements MapProvider {
  readonly available = true;
  private readonly tokens = new Map<string, unknown>();
  private placesHost: HTMLElement | null = null;

  constructor(private readonly apiKey: string) {}

  async load(): Promise<void> {
    if ((window as GoogleWindow).google?.maps?.Map) return;
    if (loadPromise) return loadPromise;
    loadPromise = new Promise<void>((resolve, reject) => {
      const w = window as GoogleWindow;
      const script = document.createElement('script');
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.apiKey)}` +
        `&v=weekly&language=th&region=TH&libraries=places,geometry&loading=async` +
        `&callback=__carpoolMapsReady`;
      script.async = true;
      w.__carpoolMapsReady = () => {
        delete w.__carpoolMapsReady;
        resolve();
      };
      script.onerror = () => {
        loadPromise = null;
        reject(new Error('โหลด Google Maps ไม่สำเร็จ'));
      };
      document.head.append(script);
    });
    return loadPromise;
  }

  newAutocompleteSession(): string {
    const id = crypto.randomUUID();
    this.tokens.set(id, null);
    return id;
  }

  endAutocompleteSession(sessionToken: string): void {
    this.tokens.delete(sessionToken);
  }

  private sessionToken(id: string): unknown {
    const maps = gmaps();
    const Token = maps.places?.AutocompleteSessionToken;
    let token = this.tokens.get(id);
    if (token === null || token === undefined) {
      token = Token ? new Token() : id;
      this.tokens.set(id, token);
    }
    return token;
  }

  async autocomplete(
    query: string,
    sessionToken: string,
    bias?: LatLng,
  ): Promise<AutocompletePrediction[]> {
    const q = query.trim();
    if (q.length < MIN_AUTOCOMPLETE_CHARS) return [];
    await this.load();
    const maps = gmaps();
    const Suggestion = maps.places?.AutocompleteSuggestion;
    const circleBias = bias
      ? {
          circle: {
            center: { latitude: bias.lat, longitude: bias.lng },
            radius: 50_000,
          },
        }
      : undefined;
    if (Suggestion?.fetchAutocompleteSuggestions) {
      const { suggestions } = await Suggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: this.sessionToken(sessionToken),
        language: 'th',
        region: 'TH',
        includedRegionCodes: ['TH'],
        ...(circleBias ? { locationBias: circleBias } : {}),
      });
      return suggestions
        .map((s) => ({
          placeId: s.placePrediction?.placeId ?? '',
          description: s.placePrediction?.text?.text ?? '',
        }))
        .filter((s) => s.placeId);
    }
    const Service = maps.places?.AutocompleteService;
    if (!Service) return [];
    const service = new Service();
    return new Promise((resolve) => {
      service.getPlacePredictions(
        {
          input: q,
          sessionToken: this.sessionToken(sessionToken),
          language: 'th',
          componentRestrictions: { country: 'th' },
          ...(bias ? { location: bias, radius: 50_000 } : {}),
        },
        (preds, status) => {
          if (status !== (maps.places?.PlacesServiceStatus?.OK ?? 'OK') || !preds) {
            resolve([]);
            return;
          }
          resolve(preds.map((p) => ({ placeId: p.place_id, description: p.description })));
        },
      );
    });
  }

  async placeDetails(placeId: string, sessionToken: string): Promise<PickedPlace> {
    await this.load();
    const maps = gmaps();
    const Place = maps.places?.Place;
    if (Place) {
      const place = new Place({ id: placeId });
      await place.fetchFields({
        fields: ['location', 'formattedAddress'],
        sessionToken: this.sessionToken(sessionToken),
      });
      this.tokens.delete(sessionToken);
      const loc = asLatLng(place.location);
      return { lat: loc.lat, lng: loc.lng, address: place.formattedAddress ?? '' };
    }
    const Service = maps.places?.PlacesService;
    if (!Service) return { ...FALLBACK_ORIGIN, address: '' };
    const host = this.placesHost ?? document.createElement('div');
    this.placesHost = host;
    const service = new Service(host);
    return new Promise((resolve) => {
      service.getDetails(
        {
          placeId,
          fields: ['geometry', 'formatted_address'],
          sessionToken: this.sessionToken(sessionToken),
        },
        (place, status) => {
          this.tokens.delete(sessionToken);
          if (status !== (maps.places?.PlacesServiceStatus?.OK ?? 'OK') || !place?.geometry?.location) {
            resolve({ ...FALLBACK_ORIGIN, address: '' });
            return;
          }
          const loc = asLatLng(place.geometry.location);
          resolve({ lat: loc.lat, lng: loc.lng, address: place.formatted_address ?? '' });
        },
      );
    });
  }

  async reverseGeocode(coord: LatLng): Promise<string> {
    await this.load();
    const maps = gmaps();
    const geocoder = new maps.Geocoder();
    const req = { location: coord, language: 'th', region: 'TH' };
    const result = geocoder.geocode(req);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      const { results } = await (result as Promise<{ results: Array<{ formatted_address?: string }> }>);
      return results[0]?.formatted_address ?? '';
    }
    return new Promise((resolve) => {
      geocoder.geocode(req, (results, status) => {
        if (status !== 'OK' || !results?.[0]) {
          resolve('');
          return;
        }
        resolve(results[0].formatted_address ?? '');
      });
    });
  }

  async route(points: readonly LatLng[]): Promise<RouteResult> {
    const body = buildComputeRoutesBody(points);
    try {
      const res = await fetch(ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': ROUTES_FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          routes?: Array<{
            distanceMeters?: number;
            duration?: string;
            polyline?: { encodedPolyline?: string };
          }>;
        };
        const route = json.routes?.[0];
        if (route) {
          return {
            distanceKm: kmFromMeters(route.distanceMeters),
            durationSeconds: secondsFromDuration(route.duration),
            encodedPolyline: route.polyline?.encodedPolyline,
          };
        }
      }
    } catch {
      // CORS / network — fall through to DirectionsService
    }
    return this.directionsFallback(points);
  }

  private async directionsFallback(points: readonly LatLng[]): Promise<RouteResult> {
    await this.load();
    const maps = gmaps();
    const Service = maps.DirectionsService;
    if (!Service || points.length < 2) return { distanceKm: 0 };
    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1).map((p) => ({ location: p, stopover: true }));
    return new Promise((resolve) => {
      new Service().route(
        {
          origin,
          destination,
          waypoints,
          travelMode: maps.TravelMode?.DRIVING ?? 'DRIVING',
          language: 'th',
          region: 'TH',
        },
        (res, status) => {
          if (status !== (maps.DirectionsStatus?.OK ?? 'OK') || !res?.routes?.[0]) {
            resolve({ distanceKm: 0 });
            return;
          }
          const r = res.routes[0];
          const meters = (r.legs ?? []).reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
          const seconds = (r.legs ?? []).reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
          const poly = r.overview_polyline;
          const encoded = typeof poly === 'string' ? poly : poly?.points;
          resolve({
            distanceKm: kmFromMeters(meters),
            durationSeconds: seconds || undefined,
            encodedPolyline: encoded,
          });
        },
      );
    });
  }

  renderMap(container: HTMLElement, options: MapRenderOptions): MapInstance {
    const maps = gmaps();
    const listeners: Listener[] = [];
    const map = new maps.Map(container, {
      center: options.center,
      zoom: options.zoom ?? 14,
      disableDefaultUI: true,
      zoomControl: options.interactive !== false,
      gestureHandling: options.interactive === false ? 'none' : 'greedy',
      clickableIcons: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    let line: GPolyline | null = null;
    const setPath = (points: readonly LatLng[], encodedPolyline?: string) => {
      const decoded =
        encodedPolyline && maps.geometry?.encoding?.decodePath
          ? maps.geometry.encoding.decodePath(encodedPolyline)
          : [...points];
      if (!line) {
        line = new maps.Polyline({
          map,
          path: decoded,
          strokeColor: '#141414',
          strokeWeight: 4,
        });
      } else {
        line.setPath(decoded);
      }
    };
    if (options.path?.length) setPath(options.path, options.encodedPolyline);
    if (options.onClick) {
      listeners.push(
        maps.event.addListener(map, 'click', ((event: { latLng?: { lat: () => number; lng: () => number } }) => {
          const coord = clickCoord(event);
          if (coord) options.onClick?.(coord);
        }) as (...args: never[]) => void),
      );
    }
    const inst: NativeMap = {
      native: map,
      setCenter: (coord) => map.setCenter(coord),
      setPath,
      fitBounds: (points) => {
        const Bounds = maps.LatLngBounds;
        if (!Bounds || points.length < 2 || !map.fitBounds) return;
        const bounds = new Bounds();
        for (const p of points) bounds.extend(p);
        map.fitBounds(bounds);
      },
      destroy: () => {
        listeners.forEach((l) => l.remove());
        line?.setMap(null);
        container.replaceChildren();
      },
    };
    return inst;
  }

  renderMarker(map: MapInstance, options: MarkerRenderOptions): MarkerInstance {
    const maps = gmaps();
    const native = (map as NativeMap).native;
    const marker = new maps.Marker({
      map: native,
      position: options.position,
      draggable: options.draggable === true,
      title: options.label,
    });
    let drag: Listener | null = null;
    if (options.onDragEnd) {
      drag = maps.event.addListener(marker, 'dragend', (() => {
        const pos = (marker as GMarker & { getPosition?: () => { lat: () => number; lng: () => number } }).getPosition?.();
        if (pos) options.onDragEnd?.(asLatLng(pos));
      }) as (...args: never[]) => void);
    }
    return {
      setPosition: (coord) => marker.setPosition(coord),
      destroy: () => {
        drag?.remove();
        marker.setMap(null);
      },
    };
  }
}

export function resetGoogleMapsLoader(): void {
  loadPromise = null;
}
