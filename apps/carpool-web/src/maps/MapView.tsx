import { useEffect, useRef } from 'react';
import type { LatLng, MapInstance, MarkerInstance } from './MapProvider';
import { useMapProvider } from './MapsProvider';

type MarkerSpec = {
  id: string;
  position: LatLng;
  draggable?: boolean;
  label?: string;
  onDragEnd?: (coord: LatLng) => void;
};

type Props = {
  center: LatLng;
  path?: readonly LatLng[];
  encodedPolyline?: string;
  markers?: readonly MarkerSpec[];
  interactive?: boolean;
  onClick?: (coord: LatLng) => void;
  className?: string;
};

export function MapView({
  center,
  path,
  encodedPolyline,
  markers = [],
  interactive = true,
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
    mapRef.current?.setCenter(center);
  }, [center]);

  useEffect(() => {
    mapRef.current?.setPath(path ?? [], encodedPolyline);
  }, [path, encodedPolyline]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) syncMarkers(map);
  }, [markers, provider]);

  return <div ref={hostRef} className={className} data-testid="map-view" />;
}
