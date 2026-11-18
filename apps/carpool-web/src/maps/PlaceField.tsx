import { useState } from 'react';
import type { PickedPlace } from './MapProvider';
import { useMapProvider } from './MapsProvider';
import { PlacePicker } from './PlacePicker';

type Props = {
  label: string;
  value: PickedPlace | null;
  fallback?: PickedPlace;
  onChange: (place: PickedPlace) => void;
  testId: string;
  onRemove?: () => void;
};

export function PlaceField({ label, value, fallback, onChange, testId, onRemove }: Props) {
  const provider = useMapProvider();
  const [open, setOpen] = useState(false);

  if (!provider.available) {
    const text = value?.address ?? fallback?.address ?? '';
    return (
      <label className="field">
        {label}
        <span className="place-field-row">
          <input
            data-testid={testId}
            value={text}
            onChange={(e) =>
              onChange({
                lat: value?.lat ?? fallback?.lat ?? 0,
                lng: value?.lng ?? fallback?.lng ?? 0,
                address: e.target.value,
              })
            }
          />
          {onRemove ? (
            <button type="button" className="chip tap-target" data-testid={`${testId}-remove`} onClick={onRemove}>
              ลบ
            </button>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <>
      <div className="field">
        {label}
        <div className="place-field-row">
          <button
            type="button"
            className="place-field-btn tap-target"
            data-testid={testId}
            onClick={() => setOpen(true)}
          >
            {value?.address || 'เลือกตำแหน่ง'}
          </button>
          {onRemove ? (
            <button type="button" className="chip tap-target" data-testid={`${testId}-remove`} onClick={onRemove}>
              ลบ
            </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <PlacePicker
          title={label}
          initial={value}
          onClose={() => setOpen(false)}
          onPick={(place) => {
            onChange(place);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
