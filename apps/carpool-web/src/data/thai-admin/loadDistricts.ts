import { BANGKOK_PROVINCE_CODE } from '@drop/carpool-core';

export type ThaiDistrict = {
  code: string;
  nameTh: string;
  lat: number;
  lng: number;
};

const loaders = import.meta.glob<{ default: ThaiDistrict[] }>('./districts/*.json');

export function districtKindLabel(provinceCode: string | null | undefined): string {
  return provinceCode === BANGKOK_PROVINCE_CODE ? 'เขต' : 'อำเภอ';
}

export async function loadDistricts(provinceCode: string): Promise<ThaiDistrict[]> {
  const loader = loaders[`./districts/${provinceCode}.json`];
  if (!loader) return [];
  const mod = await loader();
  const rows = (mod as { default: ThaiDistrict[] }).default ?? [];
  return [...rows].sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
}
