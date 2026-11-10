import type { RideStatus } from '@drop/types';

const ALLOWED: Record<RideStatus, readonly RideStatus[]> = {
  requested: ['accepted', 'cancelled'],
  accepted: ['arrived', 'in_progress', 'cancelled'],
  arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return ALLOWED[from].includes(to);
}
