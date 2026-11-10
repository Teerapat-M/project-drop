export type RideErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'invalid_pin'
  | 'pin_locked'
  | 'pin_required';

export class RideError extends Error {
  constructor(
    public readonly code: RideErrorCode,
    message: string,
    public readonly extras: { attempts_remaining?: number } = {},
  ) {
    super(message);
    this.name = 'RideError';
  }
}

export function httpStatusFor(code: RideErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'invalid_pin':
    case 'pin_required':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
    case 'invalid':
      return 400;
    case 'pin_locked':
      return 429;
  }
}
