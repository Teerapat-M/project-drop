import { driverTheme, riderTheme, type Theme } from '@drop/tokens';
import type { AppMode } from './mode';

export function themeFor(
  mode: AppMode,
  scheme: 'light' | 'dark' | null | undefined,
): Theme {
  if (mode === 'driver') return driverTheme;
  return riderTheme(scheme === 'dark' ? 'dark' : 'light');
}
