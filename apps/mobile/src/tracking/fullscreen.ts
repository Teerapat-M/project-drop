export type DriverStep = 'home' | 'incoming' | 'pickup' | 'arrived' | 'pin' | 'confirm' | 'trip';

export type FullscreenAction = 'enter' | 'exit' | 'toggle' | 'back';

/** D02 incoming, D03 pickup (and arrived), D04 trip. Never D01 home. */
export function showFullscreenPill(step: DriverStep): boolean {
  return step === 'incoming' || step === 'pickup' || step === 'arrived' || step === 'trip';
}

export function applyFullscreen(fs: boolean, action: FullscreenAction): boolean {
  if (action === 'enter') return true;
  if (action === 'exit' || action === 'back') return false;
  return !fs;
}

export function showSos(step: DriverStep): boolean {
  return step === 'trip';
}
