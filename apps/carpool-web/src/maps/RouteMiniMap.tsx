import { useEffect, useId, useRef, useState } from 'react';
import { useIsDesktop } from '../lib/media';
import { fetchRoute } from './fetchRoute';
import { FALLBACK_ORIGIN, type LatLng, type PickedPlace, type RouteResult } from './MapProvider';
import { MapView } from './MapView';
import { useMapProvider } from './MapsProvider';
import { ROUTE_DEBOUNCE_MS } from './routeCache';
import { orderedRoute, type NamedStop } from './routePoints';

export type RouteKmMeta = { fallback?: boolean };

type Props = {
  origin: PickedPlace | null;
  waypoints?: readonly (PickedPlace & { id: string })[];
  stops?: readonly (PickedPlace & { id: string })[];
  destination: PickedPlace | null;
  onKm?: (km: number, meta?: RouteKmMeta) => void;
};

function namedFrom(places: readonly (PickedPlace & { id: string })[]): NamedStop[] {
  return places
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s, i) => ({
      id: s.id,
      coord: { lat: s.lat, lng: s.lng },
      label: s.address || `จุดแวะ ${i + 1}`,
    }));
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )];
}

export function RouteMiniMap({ origin, waypoints = [], stops = [], destination, onKm }: Props) {
  const provider = useMapProvider();
  const desktop = useIsDesktop();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [points, setPoints] = useState<LatLng[] | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const onKmRef = useRef(onKm);
  onKmRef.current = onKm;
  const originKey = origin ? `${origin.lat},${origin.lng},${origin.address}` : '';
  const destKey = destination ? `${destination.lat},${destination.lng},${destination.address}` : '';
  const waypointsKey = waypoints.map((s) => `${s.id}:${s.lat},${s.lng},${s.address}`).join('|');
  const stopsKey = stops.map((s) => `${s.id}:${s.lat},${s.lng},${s.address}`).join('|');

  useEffect(() => {
    let dead = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        const ordered = await orderedRoute({
          origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
          originLabel: origin?.address || 'ต้นทาง',
          waypoints: namedFrom(waypoints),
          stops: namedFrom(stops),
          destination: destination ? { lat: destination.lat, lng: destination.lng } : null,
          destinationLabel: destination?.address || 'ปลายทาง',
        });
        if (dead) return;
        if (!ordered) {
          setPoints(null);
          setRoute(null);
          setLabels([]);
          onKmRef.current?.(0, { fallback: true });
          return;
        }
        setLabels(ordered.labels);
        setPoints(ordered.points);
        if (!provider.available) {
          setRoute({ distanceKm: 0 });
          onKmRef.current?.(0, { fallback: true });
          return;
        }
        try {
          const result = await fetchRoute(provider, ordered.points);
          if (dead) return;
          setRoute(result);
          onKmRef.current?.(result.distanceKm);
        } catch {
          if (dead) return;
          setRoute({ distanceKm: 0 });
          onKmRef.current?.(0, { fallback: true });
        }
      })();
    }, ROUTE_DEBOUNCE_MS);
    return () => {
      dead = true;
      window.clearTimeout(handle);
    };
  }, [originKey, destKey, waypointsKey, stopsKey, provider]);

  useEffect(() => {
    if (!expanded) return;
    const dialog = dialogRef.current;
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const nodes = dialog ? focusables(dialog) : [];
    nodes[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setExpanded(false);
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const list = focusables(dialog);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
  }, [expanded]);

  const chain = labels.length ? labels.join(' → ') : 'เลือกต้นทางและปลายทางเพื่อดูเส้นทาง';
  const showMap = provider.available && (points?.length ?? 0) >= 2;
  const km = route?.distanceKm;
  const markers =
    points?.map((p, i) => ({
      id: `p${i}`,
      position: p,
      label: labels[i],
    })) ?? [];

  const mapBlock = (className: string, interactive: boolean) =>
    showMap && points ? (
      <MapView
        className={className}
        center={points[0] ?? FALLBACK_ORIGIN}
        path={points}
        encodedPolyline={route?.encodedPolyline}
        interactive={interactive}
        fitToPath={interactive}
        markers={markers}
      />
    ) : null;

  const mode = desktop ? 'modal' : 'fullscreen';
  const dialog = expanded ? (
    <div
      className={desktop ? 'place-picker-backdrop' : undefined}
      data-testid="route-map-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setExpanded(false);
      }}
    >
      <div
        ref={dialogRef}
        className="place-picker route-map-dialog"
        data-testid="route-map-dialog"
        data-mode={mode}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="place-picker-head">
          <button
            type="button"
            className="nav-link tap-target"
            data-testid="route-map-close"
            aria-label="ปิด"
            onClick={() => setExpanded(false)}
          >
            ✕
          </button>
          <h2 id={titleId} className="place-picker-title">
            เส้นทาง
          </h2>
          <span className="page-head-spacer" />
        </header>
        {mapBlock('place-picker-map route-map-dialog-canvas', true)}
        <p className="order-chain" data-testid="route-dialog-chain">
          {chain}
        </p>
        {km != null && km > 0 ? (
          <p className="muted" style={{ padding: '0 12px 12px' }}>
            {km} กม.
          </p>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`card route-mini-map ${showMap ? '' : 'map-placeholder'}`}
      data-testid="route-mini-map"
    >
      {mapBlock('route-mini-map-canvas', false)}
      <p className="order-chain" data-testid="route-chain">
        {chain}
      </p>
      {km != null && km > 0 ? (
        <p className="muted" data-testid="route-mini-map-km">
          {km} กม.
        </p>
      ) : (
        <p className="muted" data-testid="route-mini-map-km">
          {provider.available ? 'รอเส้นทาง' : 'แผนที่เส้นทาง (ใส่ระยะทางด้านล่าง)'}
        </p>
      )}
      {showMap ? (
        <button
          type="button"
          className="chip tap-target"
          data-testid="route-map-expand"
          onClick={() => setExpanded(true)}
        >
          ขยายแผนที่
        </button>
      ) : null}
      {dialog}
    </div>
  );
}
