import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  decodeProtectedHeader: jest.fn(),
  createRemoteJWKSet: jest.fn(() => 'JWKS'),
}));

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { verifySupabaseJwt } from './verifyJwt';
import { jwksUrl } from '../config';

const verify = jwtVerify as unknown as jest.Mock;
const header = decodeProtectedHeader as unknown as jest.Mock;
const remoteJwks = createRemoteJWKSet as unknown as jest.Mock;

describe('jwksUrl', () => {
  it('points at the Auth JWKS endpoint', () => {
    expect(jwksUrl('https://example.supabase.co/')).toBe(
      'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });
});

describe('verifySupabaseJwt', () => {
  beforeEach(() => {
    verify.mockReset();
    header.mockReset();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_JWT_SECRET = 'test-secret';
  });

  it('verifies HS256 with SUPABASE_JWT_SECRET', async () => {
    header.mockReturnValue({ alg: 'HS256' });
    verify.mockResolvedValue({ payload: { sub: 'user-hs' } } as never);
    const result = await verifySupabaseJwt('token');
    expect(result.userId).toBe('user-hs');
    expect(verify).toHaveBeenCalled();
  });

  it('verifies non-HS256 tokens via JWKS', async () => {
    header.mockReturnValue({ alg: 'ES256' });
    verify.mockResolvedValue({ payload: { sub: 'user-as' } } as never);
    const result = await verifySupabaseJwt('token');
    expect(result.userId).toBe('user-as');
    expect(remoteJwks).toHaveBeenCalled();
    const arg = remoteJwks.mock.calls[0]?.[0] as URL;
    expect(String(arg)).toContain('/auth/v1/.well-known/jwks.json');
  });
});
