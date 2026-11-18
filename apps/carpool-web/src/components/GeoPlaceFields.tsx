import { useEffect, useMemo, useState } from 'react';
import { provinceByCode, THAI_PROVINCES, type ThaiProvince } from '@drop/carpool-core';
import { districtKindLabel, loadDistricts, type ThaiDistrict } from '../data/thai-admin/loadDistricts';
import { keepPinIfInRange } from '../lib/geoPlace';
import type { LatLng, PickedPlace } from '../maps/MapProvider';
import { PlaceField } from '../maps/PlaceField';

export type GeoPlaceValue = {
  provinceCode: string;
  districtCode: string;
  place: PickedPlace | null;
};

type Props = {
  placeLabel: string;
  value: GeoPlaceValue;
  onChange: (next: GeoPlaceValue) => void;
  testIdPrefix: string;
  requireDistrict?: boolean;
  allowEmptyProvince?: boolean;
  placePlaceholder?: string;
  placeFallback?: PickedPlace;
};

export function GeoPlaceFields({
  placeLabel,
  value,
  onChange,
  testIdPrefix,
  requireDistrict = false,
  allowEmptyProvince = true,
  placePlaceholder,
  placeFallback,
}: Props) {
  const [districts, setDistricts] = useState<ThaiDistrict[]>([]);
  const province = provinceByCode(value.provinceCode);
  const district = districts.find((d) => d.code === value.districtCode);
  const bias: LatLng | undefined = district ?? province;
  const districtLabel = districtKindLabel(value.provinceCode);

  useEffect(() => {
    let dead = false;
    if (!value.provinceCode) {
      setDistricts([]);
      return;
    }
    void loadDistricts(value.provinceCode).then((rows) => {
      if (!dead) setDistricts(rows);
    });
    return () => {
      dead = true;
    };
  }, [value.provinceCode]);

  const provinceOptions = useMemo(() => THAI_PROVINCES, []);

  const setProvince = (code: string) => {
    const next: ThaiProvince | undefined = provinceByCode(code);
    onChange({
      provinceCode: code,
      districtCode: '',
      place: keepPinIfInRange(value.place, next),
    });
  };

  const setDistrict = (code: string) => {
    const next = districts.find((d) => d.code === code);
    onChange({
      ...value,
      districtCode: code,
      place: keepPinIfInRange(value.place, next ?? province),
    });
  };

  return (
    <div className="stack geo-place-fields" data-testid={`${testIdPrefix}-geo`}>
      <label className="field">
        จังหวัด
        <select
          className="tap-target"
          data-testid={`${testIdPrefix}-province`}
          value={value.provinceCode}
          required={!allowEmptyProvince}
          onChange={(e) => setProvince(e.target.value)}
        >
          <option value="">{allowEmptyProvince ? 'เลือกจังหวัด' : 'เลือกจังหวัด'}</option>
          {provinceOptions.map((p) => (
            <option key={p.code} value={p.code}>
              {p.nameTh}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {districtLabel}
        <select
          className="tap-target"
          data-testid={`${testIdPrefix}-district`}
          value={value.districtCode}
          disabled={!value.provinceCode}
          required={requireDistrict}
          onChange={(e) => setDistrict(e.target.value)}
        >
          <option value="">{value.provinceCode ? `เลือก${districtLabel}` : `เลือกจังหวัดก่อน`}</option>
          {districts.map((d) => (
            <option key={d.code} value={d.code}>
              {d.nameTh}
            </option>
          ))}
        </select>
      </label>
      <PlaceField
        label={placeLabel}
        testId={`place-${testIdPrefix}`}
        value={value.place}
        fallback={placeFallback}
        placeholder={placePlaceholder}
        bias={bias}
        onChange={(place) => onChange({ ...value, place })}
      />
    </div>
  );
}
