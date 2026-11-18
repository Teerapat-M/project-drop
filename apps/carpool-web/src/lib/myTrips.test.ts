import { describe, expect, it } from 'vitest';
import { isPastTrip, splitMyTrips } from './myTrips';

const now = Date.parse('2026-11-18T09:00:00+07:00');

describe('splitMyTrips', () => {
  it('sends completed and past departure to past, soonest upcoming first', () => {
    const later = { id: 'later', depart_at: '2026-12-10T08:00:00+07:00', status: 'open' as const };
    const soon = { id: 'soon', depart_at: '2026-12-01T08:00:00+07:00', status: 'open' as const };
    const recentPast = { id: 'recent', depart_at: '2026-11-10T08:00:00+07:00', status: 'open' as const };
    const olderPast = { id: 'older', depart_at: '2026-11-01T08:00:00+07:00', status: 'open' as const };
    const done = { id: 'done', depart_at: '2026-12-20T08:00:00+07:00', status: 'completed' as const };
    const { upcoming, past } = splitMyTrips([later, soon, recentPast, olderPast, done], now);
    expect(upcoming.map((t) => t.id)).toEqual(['soon', 'later']);
    expect(past.map((t) => t.id)).toEqual(['done', 'recent', 'older']);
    expect(isPastTrip(done, now)).toBe(true);
    expect(isPastTrip(soon, now)).toBe(false);
  });
});
