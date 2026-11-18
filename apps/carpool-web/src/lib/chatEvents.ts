export const CHAT_BIND = 'carpool-bind-chat';
export const CHAT_OPEN = 'carpool-open-chat';

let boundTripId: string | null = null;

export function getBoundChat(): string | null {
  return boundTripId;
}

export function bindChat(tripId: string): void {
  boundTripId = tripId;
  window.dispatchEvent(new CustomEvent(CHAT_BIND, { detail: { tripId } }));
}

export function openChat(tripId?: string): void {
  if (tripId) boundTripId = tripId;
  window.dispatchEvent(new CustomEvent(CHAT_OPEN, { detail: { tripId: tripId ?? boundTripId } }));
}

export function unbindChat(): void {
  boundTripId = null;
}
