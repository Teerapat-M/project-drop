import { RATE_THB_PER_KM } from '@drop/carpool-core';

export function thb(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
}

export function estimateShare(routeKm: number, nPeople: number): number {
  if (nPeople <= 0) return 0;
  return Math.round(((routeKm * RATE_THB_PER_KM) / nPeople) * 100) / 100;
}

export function liters(w: number, h: number, l: number): number {
  return (w * h * l) / 1000;
}

export function formatDepart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
