import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  decodeProtectedHeader: jest.fn(),
  createRemoteJWKSet: jest.fn(() => jest.fn()),
}));

import { createApp } from './app';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('JWT middleware + GET /me', () => {
  const verify = async (token: string) => {
    if (token !== 'good') throw new Error('bad token');
    return { userId: 'user-1', token, payload: { sub: 'user-1' } };
  };

  it('rejects missing or invalid bearer tokens', async () => {
    const app = createApp({
      verify,
      loadMe: async (id) => ({ id, role: 'rider', trip_pin_enabled: false }),
    });
    expect((await request(app).get('/me')).status).toBe(401);
    expect((await request(app).get('/me').set('Authorization', 'Bearer nope')).status).toBe(401);
  });

  it('returns the verified user id and profile role', async () => {
    const app = createApp({
      verify,
      loadMe: async (id, token) => {
        expect(id).toBe('user-1');
        expect(token).toBe('good');
        return { id, role: 'driver', trip_pin_enabled: true };
      },
    });
    const res = await request(app).get('/me').set('Authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'user-1', role: 'driver', trip_pin_enabled: true });
  });

  it('returns null role when the profile has not chosen one', async () => {
    const app = createApp({
      verify,
      loadMe: async (id) => ({ id, role: null, trip_pin_enabled: false }),
    });
    const res = await request(app).get('/me').set('Authorization', 'Bearer good');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'user-1', role: null, trip_pin_enabled: false });
  });

  it('returns 503 when the profile lookup fails', async () => {
    const app = createApp({
      verify,
      loadMe: async () => {
        throw new Error('no supabase');
      },
    });
    const res = await request(app).get('/me').set('Authorization', 'Bearer good');
    expect(res.status).toBe(503);
  });
});
