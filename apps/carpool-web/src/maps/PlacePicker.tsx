import { useEffect, useRef, useState } from 'react';
import { useIsDesktop } from '../lib/media';
import {
  FALLBACK_ORIGIN,
  MIN_AUTOCOMPLETE_CHARS,
  type AutocompletePrediction,
  type LatLng,
  type PickedPlace,
} from './MapProvider';
import { MapView } from './MapView';
import { useMapProvider } from './MapsProvider';

type Props = {
  title: string;
  initial: PickedPlace | null;
  onPick: (place: PickedPlace) => void;
  onClose: () => void;
};

export function PlacePicker({ title, initial, onPick, onClose }: Props) {
  const provider = useMapProvider();
  const desktop = useIsDesktop();
  const [query, setQuery] = useState(initial?.address ?? '');
  const [hits, setHits] = useState<AutocompletePrediction[]>([]);
  const [pin, setPin] = useState<LatLng>(initial ?? FALLBACK_ORIGIN);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef(provider.newAutocompleteSession());
  const pickedPredictionRef = useRef(false);

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
      void provider.autocomplete(q, tokenRef.current).then(setHits);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [provider, query]);

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

  const confirm = () => {
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
        center={pin}
        interactive
        markers={[
          {
            id: 'pin',
            position: pin,
            draggable: true,
            onDragEnd: (coord) => void applyCoord(coord),
          },
        ]}
        onClick={(coord) => void applyCoord(coord)}
      />
      <p className="muted place-picker-address" data-testid="place-address">
        {busy ? 'กำลังหาที่อยู่…' : address || 'แตะแผนที่หรือลากหมุด'}
      </p>
      <div className="sticky-bar place-picker-bar">
        <button type="button" className="btn tap-target" data-testid="place-confirm" onClick={confirm}>
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
