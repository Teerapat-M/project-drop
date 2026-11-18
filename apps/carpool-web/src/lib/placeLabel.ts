import { provinceByCode } from '@drop/carpool-core';

export function formatEndpoint(
  label: string,
  provinceCode?: string | null,
  districtName?: string | null,
): string {
  const province = provinceByCode(provinceCode)?.nameTh;
  const extra = [districtName, province].filter((part): part is string => {
    if (!part) return false;
    return !label.includes(part);
  });
  if (!extra.length) return label;
  return `${label} · ${extra.join(' · ')}`;
}

export function formatRouteLine(
  pickup: string,
  dest: string,
  opts?: {
    originProvince?: string | null;
    destProvince?: string | null;
    originDistrict?: string | null;
    destDistrict?: string | null;
  },
): string {
  return `${formatEndpoint(pickup, opts?.originProvince, opts?.originDistrict)} → ${formatEndpoint(
    dest,
    opts?.destProvince,
    opts?.destDistrict,
  )}`;
}
