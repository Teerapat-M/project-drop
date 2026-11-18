import { useEffect, useRef, useState } from 'react';
import { maxDetourExceeded, maxDetourWarning } from '@drop/carpool-core';
import { useIsDesktop } from '../lib/media';
import { defaultMapCenter } from './defaultCenter';
import {
  MIN_AUTOCOMPLETE_CHARS,
  type AutocompletePrediction,
  type LatLng,
  type PickedPlace,
} from './MapProvider';
import { MapView } from './MapView';
import { useMapProvider } from './MapsProvider';

export type RouteOverlay = {
  points: readonly LatLng[];
  polyline?: string;
  labels?: string[];
};

type Props = {
  title: string;
  initial: PickedPlace | null;
  bias?: LatLng;
  centroid?: LatLng | null;
  routeOverlay?: RouteOverlay;
  maxDetourKm?: number | null;
  detourForPin?: (pin: LatLng) => number;
  onPick: (place: PickedPlace) => void;
  onClose: () => void;
};

export function PlacePicker({
  title,
  initial,
  bias,
  centroid,
  routeOverlay,
  maxDetourKm,
  detourForPin,
  onPick,
  onClose,
}: Props) {
  const provider = useMapProvider();
  const desktop = useIsDesktop();
  const routePoints = routeOverlay?.points ?? [];
  const mapCenter = defaultMapCenter({ routePoints });
  const [query, setQuery] = useState(initial?.address ?? '');
  const [hits, setHits] = useState<AutocompletePrediction[]>([]);
  const [pin, setPin] = useState<LatLng>(initial ?? mapCenter);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef(provider.newAutocompleteSession());
  const pickedPredictionRef = useRef(false);
  const fitRoute = routePoints.length >= 2;

  useEffect(() => {
    void provider.load();
  }, [provider]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_AUTOCOMPLETE_CHARS) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void provider.autocomplete(q, tokenRef.current, bias ?? centroid ?? undefined).then(setHits);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [provider, query, bias, centroid]);

  const applyCoord = async (coord: LatLng) => {
    pickedPredictionRef.current = false;
    setPin(coord);
    setBusy(true);
    try {
      const label = await provider.reverseGeocode(coord);
      setAddress(label || `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`);
    } finally {
      setBusy(false);
    }
  };

  const pickPrediction = async (hit: AutocompletePrediction) => {
    setBusy(true);
    try {
      const place = await provider.placeDetails(hit.placeId, tokenRef.current);
      tokenRef.current = provider.newAutocompleteSession();
      pickedPredictionRef.current = true;
      setPin(place);
      setAddress(place.address);
      setQuery(place.address);
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  const detourKm = detourForPin ? detourForPin(pin) : 0;
  const overMax = maxDetourKm != null && maxDetourExceeded(detourKm, maxDetourKm);
  const warning = overMax && maxDetourKm != null ? maxDetourWarning(detourKm, maxDetourKm) : null;

  const confirm = () => {
    if (overMax) return;
    if (!pickedPredictionRef.current) {
      provider.endAutocompleteSession(tokenRef.current);
      tokenRef.current = provider.newAutocompleteSession();
    }
    onPick({
      lat: pin.lat,
      lng: pin.lng,
      address: address || query || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`,
    });
  };

  const routeMarkers =
    routePoints.map((p, i) => ({
      id: `route-${i}`,
      position: p,
      label: routeOverlay?.labels?.[i] || String(i + 1),
    })) ?? [];

  const markers = [
    ...routeMarkers,
    {
      id: 'pin',
      position: pin,
      draggable: true,
      label: 'จุดลงของคุณ',
      onDragEnd: (coord: LatLng) => void applyCoord(coord),
    },
  ];

  const mode = desktop ? 'modal' : 'fullscreen';
  const body = (
    <div className="place-picker" data-testid="place-picker" data-mode={mode} role="dialog" aria-label={title}>
      <header className="place-picker-head">
        <button type="button" className="nav-link tap-target" onClick={onClose} aria-label="ปิด">
          ←
        </button>
        <h2 className="place-picker-title">{title}</h2>
        <span className="page-head-spacer" />
      </header>
      <label className="field place-picker-search">
        ค้นหา
        <input
          data-testid="place-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ชื่อสถานที่ หรือที่อยู่"
        />
      </label>
      {hits.length ? (
        <ul className="place-suggestions" data-testid="place-suggestions">
          {hits.map((hit) => (
            <li key={hit.placeId}>
              <button
                type="button"
                className="place-suggestion tap-target"
                onClick={() => void pickPrediction(hit)}
              >
                {hit.description}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <MapView
        className="place-picker-map"
        center={mapCenter}
        path={fitRoute ? routePoints : undefined}
        encodedPolyline={routeOverlay?.polyline}
        interactive
        fitToPath={fitRoute}
        markers={markers}
        onClick={(coord) => void applyCoord(coord)}
      />
      <p className="muted place-picker-address" data-testid="place-address">
        {busy ? 'กำลังหาที่อยู่…' : address || 'แตะแผนที่หรือลากหมุด'}
      </p>
      {warning ? (
        <p className="join-hint" data-testid="max-detour-warning" role="alert">
          {warning}
        </p>
      ) : null}
      <div className="sticky-bar place-picker-bar">
        <button
          type="button"
          className="btn tap-target"
          data-testid="place-confirm"
          disabled={overMax}
          onClick={confirm}
        >
          ใช้ตำแหน่งนี้
        </button>
      </div>
    </div>
  );

  if (desktop) {
    return (
      <div className="place-picker-backdrop" data-testid="place-picker-backdrop">
        {body}
      </div>
    );
  }
  return body;
}
