import { useEffect, useRef, useState } from 'react';
import { fetchRoute } from './fetchRoute';
import { FALLBACK_ORIGIN, type LatLng, type PickedPlace, type RouteResult } from './MapProvider';
import { MapView } from './MapView';
import { useMapProvider } from './MapsProvider';
import { ROUTE_DEBOUNCE_MS } from './routeCache';
import { orderedRoute, type NamedStop } from './routePoints';

type Props = {
  origin: PickedPlace | null;
  waypoints?: readonly (PickedPlace & { id: string })[];
  stops?: readonly (PickedPlace & { id: string })[];
  destination: PickedPlace | null;
  onKm?: (km: number) => void;
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

export function RouteMiniMap({ origin, waypoints = [], stops = [], destination, onKm }: Props) {
  const provider = useMapProvider();
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
          return;
        }
        setLabels(ordered.labels);
        setPoints(ordered.points);
        if (!provider.available) return;
        const result = await fetchRoute(provider, ordered.points);
        if (dead) return;
        setRoute(result);
        onKmRef.current?.(result.distanceKm);
      })();
    }, ROUTE_DEBOUNCE_MS);
    return () => {
      dead = true;
      window.clearTimeout(handle);
    };
  }, [originKey, destKey, waypointsKey, stopsKey, provider]);

  const chain = labels.length ? labels.join(' → ') : 'เลือกต้นทางและปลายทางเพื่อดูเส้นทาง';
  const showMap = provider.available && (points?.length ?? 0) >= 2;
  const km = route?.distanceKm;

  return (
    <div
      className={`card route-mini-map ${showMap ? '' : 'map-placeholder'}`}
      data-testid="route-mini-map"
    >
      {showMap && points ? (
        <MapView
          className="route-mini-map-canvas"
          center={points[0] ?? FALLBACK_ORIGIN}
          path={points}
          encodedPolyline={route?.encodedPolyline}
          interactive={false}
          markers={points.map((p, i) => ({
            id: `p${i}`,
            position: p,
            label: labels[i],
          }))}
        />
      ) : null}
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
    </div>
  );
}
