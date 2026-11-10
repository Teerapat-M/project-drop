import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { MeResponse, Role } from '@drop/types';

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  decodeProtectedHeader: jest.fn(),
  createRemoteJWKSet: jest.fn(() => jest.fn()),
}));

import { createApp } from '../app';
import { PIN_MAX_ATTEMPTS } from './pin';
import { createMemoryRideService } from './service';

const SIAM = {
  pickup_lat: 13.7466,
  pickup_lng: 100.5347,
  pickup_label: 'Siam Paragon',
  dropoff_lat: 13.7998,
  dropoff_lng: 100.5503,
  dropoff_label: 'Chatuchak Weekend Market',
  vehicle_type: 'car' as const,
  route_distance_m: 9800,
  route_duration_s: 1440,
};

function appFor(opts: {
  tokens: Record<string, { userId: string; role: Role | null; trip_pin_enabled?: boolean }>;
  pinEnabled?: Record<string, boolean>;
}) {
  const profiles: Record<string, { role: Role | null; trip_pin_enabled: boolean }> = {};
  for (const t of Object.values(opts.tokens)) {
    profiles[t.userId] = { role: t.role, trip_pin_enabled: t.trip_pin_enabled === true };
  }
  const rides = createMemoryRideService({ profiles });
  const verify = async (token: string) => {
    const row = opts.tokens[token];
    if (!row) throw new Error('bad token');
    return { userId: row.userId, token, payload: { sub: row.userId } };
  };
  const loadMe = async (id: string): Promise<MeResponse> => {
    const p = profiles[id] ?? { role: null, trip_pin_enabled: false };
    return { id, role: p.role, trip_pin_enabled: p.trip_pin_enabled };
  };
  return { app: createApp({ verify, loadMe, rides }), rides };
}

describe('ride endpoints', () => {
  const tokens = {
    rider: { userId: 'rider-1', role: 'rider' as const, trip_pin_enabled: false },
    pinRider: { userId: 'rider-pin', role: 'rider' as const, trip_pin_enabled: true },
    d1: { userId: 'driver-1', role: 'driver' as const },
    d2: { userId: 'driver-2', role: 'driver' as const },
  };

  it('requires auth on ride routes', async () => {
    const { app } = appFor({ tokens });
    expect((await request(app).post('/rides').send(SIAM)).status).toBe(401);
    expect((await request(app).get('/rides/x')).status).toBe(401);
    expect((await request(app).get('/rides/nearby')).status).toBe(401);
    expect((await request(app).post('/rides/x/accept')).status).toBe(401);
  });

  it('lets a rider create a request with fare_estimate null', async () => {
    const { app } = appFor({ tokens });
    const res = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
    expect(res.status).toBe(201);
    expect(res.body.rider_id).toBe('rider-1');
    expect(res.body.status).toBe('requested');
    expect(res.body.fare_estimate).toBeNull();
    expect(res.body.vehicle_type).toBe('car');
    expect(res.body.trip_pin).toBeUndefined();
  });

  it('rejects create from a driver', async () => {
    const { app } = appFor({ tokens });
    const res = await request(app).post('/rides').set('Authorization', 'Bearer d1').send(SIAM);
    expect(res.status).toBe(403);
  });

  it('first accept wins; second gets 409', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
    const id = created.body.id as string;
    const a = await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
    const b = await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d2');
    expect(a.status).toBe(200);
    expect(a.body.status).toBe('accepted');
    expect(a.body.driver_id).toBe('driver-1');
    expect(a.body.trip_pin).toBeUndefined();
    expect(b.status).toBe(409);
  });

  it('hides the PIN from the driver and shows it to the rider after accept', async () => {
    const { app, rides } = appFor({ tokens });
    const created = await request(app)
      .post('/rides')
      .set('Authorization', 'Bearer pinRider')
      .send(SIAM);
    const id = created.body.id as string;
    const accepted = await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
    expect(accepted.body.pin_required).toBe(true);
    expect(accepted.body.trip_pin).toBeUndefined();
    const riderView = await request(app).get(`/rides/${id}`).set('Authorization', 'Bearer pinRider');
    expect(riderView.body.trip_pin).toMatch(/^\d{4}$/);
    const driverView = await request(app).get(`/rides/${id}`).set('Authorization', 'Bearer d1');
    expect(driverView.body.trip_pin).toBeUndefined();
    expect(rides.state.pins.get(id)?.pin).toBe(riderView.body.trip_pin);
  });

  it('starts without a PIN when trip_pin_enabled is false', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
    const id = created.body.id as string;
    await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
    const started = await request(app).post(`/rides/${id}/start`).set('Authorization', 'Bearer d1');
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');
  });

  it('requires the PIN when trip_pin_enabled is true', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app)
      .post('/rides')
      .set('Authorization', 'Bearer pinRider')
      .send(SIAM);
    const id = created.body.id as string;
    await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
    const noPin = await request(app).post(`/rides/${id}/start`).set('Authorization', 'Bearer d1');
    expect(noPin.status).toBe(403);
    expect(noPin.body.error).toBe('invalid_pin');
    const riderView = await request(app).get(`/rides/${id}`).set('Authorization', 'Bearer pinRider');
    const ok = await request(app)
      .post(`/rides/${id}/start`)
      .set('Authorization', 'Bearer d1')
      .send({ pin: riderView.body.trip_pin });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('in_progress');
  });

  it('rejects a wrong PIN and locks after the attempt limit', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app)
      .post('/rides')
      .set('Authorization', 'Bearer pinRider')
      .send(SIAM);
    const id = created.body.id as string;
    await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
    for (let i = 0; i < PIN_MAX_ATTEMPTS - 1; i++) {
      const wrong = await request(app)
        .post(`/rides/${id}/start`)
        .set('Authorization', 'Bearer d1')
        .send({ pin: '0000' });
      expect(wrong.status).toBe(403);
      expect(wrong.body.error).toBe('invalid_pin');
      expect(wrong.body.attempts_remaining).toBe(PIN_MAX_ATTEMPTS - 1 - i);
    }
    const locked = await request(app)
      .post(`/rides/${id}/start`)
      .set('Authorization', 'Bearer d1')
      .send({ pin: '0000' });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('pin_locked');
    const riderView = await request(app).get(`/rides/${id}`).set('Authorization', 'Bearer pinRider');
    const stillLocked = await request(app)
      .post(`/rides/${id}/start`)
      .set('Authorization', 'Bearer d1')
      .send({ pin: riderView.body.trip_pin });
    expect(stillLocked.status).toBe(429);
  });

  it('guards status transitions: cancel from requested, not from completed', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
    const id = created.body.id as string;
    const cancelled = await request(app).post(`/rides/${id}/cancel`).set('Authorization', 'Bearer rider');
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    const again = await request(app).post(`/rides/${id}/cancel`).set('Authorization', 'Bearer rider');
    expect(again.status).toBe(409);
    const start = await request(app).post(`/rides/${id}/start`).set('Authorization', 'Bearer d1');
    expect(start.status).toBe(409);
  });

  it('lets the rider cancel a requested ride and the assigned driver arrive', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
    const id = created.body.id as string;
    await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
    const arrived = await request(app).post(`/rides/${id}/arrive`).set('Authorization', 'Bearer d1');
    expect(arrived.status).toBe(200);
    expect(arrived.body.status).toBe('arrived');
  });

  it('rejects a rider self-accepting, setting driver_id, and calling start/verify', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
    const id = created.body.id as string;
    const selfAccept = await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer rider');
    expect(selfAccept.status).toBe(403);
    const listed = await request(app).get(`/rides/${id}`).set('Authorization', 'Bearer rider');
    expect(listed.body.status).toBe('requested');
    expect(listed.body.driver_id).toBeNull();
    const taken = await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
    expect(taken.status).toBe(200);
    expect(taken.body.driver_id).toBe('driver-1');
    const riderStart = await request(app).post(`/rides/${id}/start`).set('Authorization', 'Bearer rider');
    expect(riderStart.status).toBe(403);
    const riderArrive = await request(app).post(`/rides/${id}/arrive`).set('Authorization', 'Bearer rider');
    expect(riderArrive.status).toBe(403);
    const otherStart = await request(app).post(`/rides/${id}/start`).set('Authorization', 'Bearer d2');
    expect(otherStart.status).toBe(403);
  });

  it('does not list requested rides to drivers; nearby omits rider_id and dropoff', async () => {
    const { app } = appFor({ tokens });
    const created = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
    const id = created.body.id as string;
    const listed = await request(app).get('/rides?status=requested').set('Authorization', 'Bearer d1');
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([]);
    const nearby = await request(app)
      .get('/rides/nearby')
      .query({ lat: SIAM.pickup_lat, lng: SIAM.pickup_lng, radius_m: 5000 })
      .set('Authorization', 'Bearer d1');
    expect(nearby.status).toBe(200);
    expect(nearby.body).toHaveLength(1);
    expect(nearby.body[0].id).toBe(id);
    expect(nearby.body[0].rider_id).toBeUndefined();
    expect(nearby.body[0].dropoff_lat).toBeUndefined();
    expect(nearby.body[0].dropoff_label).toBeUndefined();
    expect(nearby.body[0].pickup_label).toBeUndefined();
    expect(nearby.body[0].pickup_lat).toBe(Math.round(SIAM.pickup_lat * 1000) / 1000);
    expect(nearby.body[0].vehicle_type).toBe('car');
    const riderNearby = await request(app)
      .get('/rides/nearby')
      .query({ lat: SIAM.pickup_lat, lng: SIAM.pickup_lng })
      .set('Authorization', 'Bearer rider');
    expect(riderNearby.status).toBe(403);
  });

  it('upserts driver location for the signed-in driver only', async () => {
    const { app } = appFor({ tokens });
    const ok = await request(app)
      .put('/driver-location')
      .set('Authorization', 'Bearer d1')
      .send({ lat: 13.74, lng: 100.53, is_online: true, vehicle_type: 'car' });
    expect(ok.status).toBe(200);
    expect(ok.body.driver_id).toBe('driver-1');
    expect(ok.body.is_online).toBe(true);
    const rider = await request(app)
      .put('/driver-location')
      .set('Authorization', 'Bearer rider')
      .send({ lat: 13.74, lng: 100.53, is_online: true });
    expect(rider.status).toBe(403);
  });
});
