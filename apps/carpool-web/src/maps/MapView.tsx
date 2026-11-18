import { useEffect, useRef } from 'react';
import type { LatLng, MapInstance, MarkerInstance } from './MapProvider';
import { useMapProvider } from './MapsProvider';

type MarkerSpec = {
  id: string;
  position: LatLng;
  draggable?: boolean;
  label?: string;
  kind?: 'route' | 'dropoff';
  onDragEnd?: (coord: LatLng) => void;
};

function fitPoints(
  path: readonly LatLng[] | undefined,
  markers: readonly MarkerSpec[],
): LatLng[] {
  const extra = markers.filter((m) => m.kind === 'dropoff').map((m) => m.position);
  return [...(path ?? []), ...extra];
}

type Props = {
  center: LatLng;
  path?: readonly LatLng[];
  encodedPolyline?: string;
  markers?: readonly MarkerSpec[];
  interactive?: boolean;
  fitToPath?: boolean;
  onClick?: (coord: LatLng) => void;
  className?: string;
};

export function MapView({
  center,
  path,
  encodedPolyline,
  markers = [],
  interactive = true,
  fitToPath = false,
  onClick,
  className,
}: Props) {
  const provider = useMapProvider();
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<Map<string, MarkerInstance>>(new Map());
  const clickRef = useRef(onClick);
  const centerRef = useRef(center);
  const pathRef = useRef(path);
  const polyRef = useRef(encodedPolyline);
  const markersRef = useRef(markers);
  const interactiveRef = useRef(interactive);
  clickRef.current = onClick;
  centerRef.current = center;
  pathRef.current = path;
  polyRef.current = encodedPolyline;
  markersRef.current = markers;
  interactiveRef.current = interactive;

  const syncMarkers = (map: MapInstance) => {
    const live = new Set(markersRef.current.map((m) => m.id));
    markerRef.current.forEach((inst, id) => {
      if (!live.has(id)) {
        inst.destroy();
        markerRef.current.delete(id);
      }
    });
    for (const spec of markersRef.current) {
      const existing = markerRef.current.get(spec.id);
      if (existing) {
        existing.setPosition(spec.position);
      } else {
        markerRef.current.set(
          spec.id,
          provider.renderMarker(map, {
            position: spec.position,
            draggable: spec.draggable,
            label: spec.label,
            kind: spec.kind,
            onDragEnd: spec.onDragEnd,
          }),
        );
      }
    }
  };

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !provider.available) return;
    let dead = false;
    void provider.load().then(() => {
      if (dead || !hostRef.current) return;
      const map = provider.renderMap(hostRef.current, {
        center: centerRef.current,
        path: pathRef.current,
        encodedPolyline: polyRef.current,
        interactive: interactiveRef.current,
        onClick: (coord) => clickRef.current?.(coord),
      });
      mapRef.current = map;
      const initialPath = pathRef.current;
      const fitPts = fitPoints(initialPath, markersRef.current);
      if (fitToPath && fitPts.length >= 2) {
        map.fitBounds(fitPts);
      }
      syncMarkers(map);
    });
    return () => {
      dead = true;
      markerRef.current.forEach((m) => m.destroy());
      markerRef.current.clear();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [provider]);

  useEffect(() => {
    const fitPts = fitPoints(path, markers);
    if (fitToPath && fitPts.length >= 2) return;
    mapRef.current?.setCenter(center);
  }, [center, fitToPath, path, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setPath(path ?? [], encodedPolyline);
    const fitPts = fitPoints(path, markers);
    if (fitToPath && fitPts.length >= 2) map.fitBounds(fitPts);
  }, [path, encodedPolyline, fitToPath, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) syncMarkers(map);
  }, [markers, provider]);

  return <div ref={hostRef} className={className} data-testid="map-view" />;
}
