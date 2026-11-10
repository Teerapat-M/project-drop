import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { MeResponse, Role } from '@drop/types';
import { CHAT_PRESETS } from '@drop/types';

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  decodeProtectedHeader: jest.fn(),
  createRemoteJWKSet: jest.fn(() => jest.fn()),
}));

import { createApp } from '../app';
import { createMemoryChatService } from './service';
import { createTranslator } from './translate';
import { createTokenBucket } from './rateLimit';
import { createMemoryRideService } from '../rides/service';

const SIAM = {
  pickup_lat: 13.7466,
  pickup_lng: 100.5347,
  pickup_label: 'Siam Paragon',
  dropoff_lat: 13.7998,
  dropoff_lng: 100.5503,
  dropoff_label: 'Chatuchak Weekend Market',
  vehicle_type: 'car' as const,
};

function harness(opts?: { provider?: (text: string) => Promise<{ text: string } | { error: 'quota' | 'timeout' | 'provider' }> }) {
  const profiles = {
    'rider-1': { role: 'rider' as const, trip_pin_enabled: false, full_name: 'Ploy S.', preferred_language: 'en' },
    'driver-1': { role: 'driver' as const, trip_pin_enabled: false, full_name: 'Somchai K.', preferred_language: 'th' },
    'driver-2': { role: 'driver' as const, trip_pin_enabled: false, preferred_language: 'en' },
    'rider-2': { role: 'rider' as const, trip_pin_enabled: false, preferred_language: 'en' },
    'admin-1': { role: 'admin' as const, trip_pin_enabled: false, preferred_language: 'en' },
  };
  const rides = createMemoryRideService({ profiles });
  const translate = createTranslator({
    bucket: createTokenBucket({ capacity: 50, refillPerMs: 1 }),
    provider: {
      name: 'fake',
      translate: async ({ text }) => {
        if (opts?.provider) return opts.provider(text);
        return { text: `TH:${text}` };
      },
    },
  });
  const chat = createMemoryChatService(
    {
      get: (actor, id) => rides.get(actor, id),
      peer: async (actor, ride) => (await rides.get(actor, ride.id)).peer ?? null,
    },
    translate,
  );
  const tokens: Record<string, { userId: string; role: Role | null }> = {
    rider: { userId: 'rider-1', role: 'rider' },
    rider2: { userId: 'rider-2', role: 'rider' },
    d1: { userId: 'driver-1', role: 'driver' },
    d2: { userId: 'driver-2', role: 'driver' },
    admin: { userId: 'admin-1', role: 'admin' },
  };
  const verify = async (token: string) => {
    const row = tokens[token];
    if (!row) throw new Error('bad token');
    return { userId: row.userId, token, payload: { sub: row.userId } };
  };
  const loadMe = async (id: string): Promise<MeResponse> => {
    const p = profiles[id as keyof typeof profiles];
    return { id, role: p?.role ?? null, trip_pin_enabled: false };
  };
  return { app: createApp({ verify, loadMe, rides, chat }), rides };
}

async function acceptedRide(app: ReturnType<typeof harness>['app']): Promise<string> {
  const created = await request(app).post('/rides').set('Authorization', 'Bearer rider').send(SIAM);
  const id = created.body.id as string;
  await request(app).post(`/rides/${id}/accept`).set('Authorization', 'Bearer d1');
  return id;
}

describe('POST /rides/:id/messages auth + participants', () => {
  it('requires a bearer token', async () => {
    const { app } = harness();
    expect((await request(app).post('/rides/x/messages').send({ text: 'hi' })).status).toBe(401);
    expect((await request(app).get('/rides/x/messages')).status).toBe(401);
  });

  it('lets the rider and assigned driver send and read', async () => {
    const { app } = harness();
    const id = await acceptedRide(app);
    const fromRider = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer rider')
      .send({ text: 'Hi', source_lang: 'en' });
    expect(fromRider.status).toBe(201);
    expect(fromRider.body.sender_id).toBe('rider-1');
    expect(fromRider.body.original_text).toBe('Hi');
    expect(fromRider.body.translated_text).toBe('TH:Hi');
    const fromDriver = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer d1')
      .send({ text: 'OK', source_lang: 'th' });
    expect(fromDriver.status).toBe(201);
    expect(fromDriver.body.sender_id).toBe('driver-1');
    const listed = await request(app).get(`/rides/${id}/messages`).set('Authorization', 'Bearer rider');
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(2);
  });

  it('blocks a non-participant driver and rider from read and insert', async () => {
    const { app } = harness();
    const id = await acceptedRide(app);
    const asD2 = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer d2')
      .send({ text: 'hi' });
    const asR2 = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer rider2')
      .send({ text: 'hi' });
    expect([403, 404]).toContain(asD2.status);
    expect([403, 404]).toContain(asR2.status);
    expect((await request(app).get(`/rides/${id}/messages`).set('Authorization', 'Bearer d2')).status).toBe(
      404,
    );
    expect(
      (await request(app).get(`/rides/${id}/messages`).set('Authorization', 'Bearer rider2')).status,
    ).toBe(404);
  });

  it('lets admin read but not insert', async () => {
    const { app } = harness();
    const id = await acceptedRide(app);
    await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer rider')
      .send({ text: 'Hi' });
    const listed = await request(app).get(`/rides/${id}/messages`).set('Authorization', 'Bearer admin');
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    const insert = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer admin')
      .send({ text: 'nope' });
    expect(insert.status).toBe(403);
  });

  it('blocks inserts after cancel (read-only) and always stamps the caller as sender', async () => {
    const { app } = harness();
    const id = await acceptedRide(app);
    await request(app).post(`/rides/${id}/cancel`).set('Authorization', 'Bearer rider');
    const insert = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer rider')
      .send({ text: 'too late' });
    expect(insert.status).toBe(403);
  });

  it('still delivers the original when translation fails', async () => {
    const { app } = harness({ provider: async () => ({ error: 'provider' }) });
    const id = await acceptedRide(app);
    const res = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer rider')
      .send({ text: 'Hello', source_lang: 'en' });
    expect(res.status).toBe(201);
    expect(res.body.original_text).toBe('Hello');
    expect(res.body.translated_text).toBeNull();
  });

  it('uses static preset text and does not call the provider', async () => {
    let calls = 0;
    const { app } = harness({
      provider: async () => {
        calls += 1;
        return { error: 'quota' };
      },
    });
    const id = await acceptedRide(app);
    const res = await request(app)
      .post(`/rides/${id}/messages`)
      .set('Authorization', 'Bearer rider')
      .send({ preset_key: 'on_my_way', source_lang: 'en' });
    expect(res.status).toBe(201);
    expect(calls).toBe(0);
    expect(res.body.original_text).toBe(CHAT_PRESETS.on_my_way.en);
    expect(res.body.translated_text).toBe(CHAT_PRESETS.on_my_way.th);
    expect(res.body.is_preset).toBe(true);
  });
});
