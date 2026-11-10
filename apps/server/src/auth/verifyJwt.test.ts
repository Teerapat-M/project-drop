import { describe, expect, it } from '@jest/globals';
import { authIssuer, jwksUrl } from '../config';

describe('jwksUrl / authIssuer', () => {
  it('normalizes a trailing slash on SUPABASE_URL', () => {
    expect(authIssuer('https://example.supabase.co/')).toBe(
      'https://example.supabase.co/auth/v1',
    );
    expect(authIssuer('https://example.supabase.co')).toBe(
      'https://example.supabase.co/auth/v1',
    );
    expect(jwksUrl('https://example.supabase.co/')).toBe(
      'https://example.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });
});
