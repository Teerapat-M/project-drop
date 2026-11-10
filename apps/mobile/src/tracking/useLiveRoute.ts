import { useEffect, useRef, useState } from 'react';
import { fetchRoute, type RoutePreview } from '../geo/osrm';
import { shouldRefreshRoute, type RouteFix } from './routeRefresh';

export function useLiveRoute(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number } | null,
): RoutePreview | null {
  const [route, setRoute] = useState<RoutePreview | null>(null);
  const fromRef = useRef(from);
  const toRef = useRef(to);
  const lastRef = useRef<RouteFix | null>(null);
  const destKey = to ? `${to.lat},${to.lng}` : '';

  useEffect(() => {
    fromRef.current = from;
    toRef.current = to;
  });

  useEffect(() => {
    lastRef.current = null;
    if (!destKey) return;
    let cancelled = false;
    const tick = () => {
      const origin = fromRef.current;
      const dest = toRef.current;
      if (!origin || !dest || cancelled) return;
      const next = { at: Date.now(), lat: origin.lat, lng: origin.lng };
      if (!shouldRefreshRoute(lastRef.current, next)) return;
      lastRef.current = next;
      void fetchRoute(origin, dest).then((r) => {
        if (!cancelled && r) setRoute(r);
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [destKey]);

  return destKey ? route : null;
}
