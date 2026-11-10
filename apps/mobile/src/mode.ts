export type AppMode = 'rider' | 'driver';

export const MODE_STORAGE_KEY = 'drop.appMode';
export const DEFAULT_MODE: AppMode = 'rider';

export function isAppMode(value: unknown): value is AppMode {
  return value === 'rider' || value === 'driver';
}

export function parseMode(value: string | null | undefined): AppMode {
  return isAppMode(value) ? value : DEFAULT_MODE;
}

export function serializeMode(mode: AppMode): string {
  return mode;
}

export function toggleMode(mode: AppMode): AppMode {
  return mode === 'rider' ? 'driver' : 'rider';
}
