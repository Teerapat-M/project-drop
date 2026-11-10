import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';
import { verifySupabaseJwt } from './verifyJwt';

const SUPABASE_URL = 'https://example.supabase.co/';
const ISSUER = 'https://example.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';
const SUBJECT = 'user-1';
const HS_SECRET = 'test-hs256-secret';
const KID = 'test-es256';

type SignOpts = {
  iss?: string | null;
  aud?: string | null;
  exp?: string | number;
  sub?: string;
  key?: CryptoKey;
  alg?: 'ES256' | 'HS256';
  kid?: string;
  secret?: Uint8Array;
};

async function signToken(opts: SignOpts = {}): Promise<string> {
  const alg = opts.alg ?? 'ES256';
  let jwt = new SignJWT({});
  jwt = jwt.setProtectedHeader(alg === 'ES256' ? { alg, kid: opts.kid ?? KID } : { alg });
  jwt = jwt.setSubject(opts.sub ?? SUBJECT);
  if (opts.iss !== null) jwt = jwt.setIssuer(opts.iss ?? ISSUER);
  if (opts.aud !== null) jwt = jwt.setAudience(opts.aud ?? AUDIENCE);
  jwt = jwt.setExpirationTime(opts.exp ?? '5m');
  if (alg === 'HS256') {
    return jwt.sign(opts.secret ?? new TextEncoder().encode(HS_SECRET));
  }
  if (!opts.key) throw new Error('ES256 sign requires a key');
  return jwt.sign(opts.key);
}

describe('verifySupabaseJwt with real jose', () => {
  let privateKey: CryptoKey;
  let otherPrivateKey: CryptoKey;
  let getKey: JWTVerifyGetKey;

  before(async () => {
    const pair = await generateKeyPair('ES256');
    const other = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    otherPrivateKey = other.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    jwk.kid = KID;
    jwk.alg = 'ES256';
    jwk.use = 'sig';
    getKey = createLocalJWKSet({ keys: [jwk] });
  });

  const jwksOpts = () => ({
    url: SUPABASE_URL,
    jwtSecret: '',
    getKey,
  });

  const hsOpts = () => ({
    url: SUPABASE_URL,
    jwtSecret: HS_SECRET,
    hs256Only: true as const,
  });

  describe('JWKS path (ES256)', () => {
    it('accepts a valid token', async () => {
      const token = await signToken({ key: privateKey });
      const result = await verifySupabaseJwt(token, jwksOpts());
      assert.equal(result.userId, SUBJECT);
      assert.equal(result.payload.iss, ISSUER);
      assert.equal(result.payload.aud, AUDIENCE);
    });

    it('rejects a wrong issuer', async () => {
      const token = await signToken({ key: privateKey, iss: 'https://evil.example/auth/v1' });
      await assert.rejects(() => verifySupabaseJwt(token, jwksOpts()));
    });

    it('rejects a missing issuer', async () => {
      const token = await signToken({ key: privateKey, iss: null });
      await assert.rejects(() => verifySupabaseJwt(token, jwksOpts()));
    });

    it('rejects a wrong audience', async () => {
      const token = await signToken({ key: privateKey, aud: 'anon' });
      await assert.rejects(() => verifySupabaseJwt(token, jwksOpts()));
    });

    it('rejects a missing audience', async () => {
      const token = await signToken({ key: privateKey, aud: null });
      await assert.rejects(() => verifySupabaseJwt(token, jwksOpts()));
    });

    it('rejects an expired token', async () => {
      const token = await signToken({ key: privateKey, exp: 0 });
      await assert.rejects(() => verifySupabaseJwt(token, jwksOpts()));
    });

    it('rejects a bad signature signed by a different key', async () => {
      const token = await signToken({ key: otherPrivateKey });
      await assert.rejects(() => verifySupabaseJwt(token, jwksOpts()));
    });

    it('rejects an HS256 token (alg mismatch)', async () => {
      const token = await signToken({ alg: 'HS256' });
      await assert.rejects(() => verifySupabaseJwt(token, jwksOpts()));
    });
  });

  describe('HS256 path', () => {
    it('accepts a valid token', async () => {
      const token = await signToken({ alg: 'HS256' });
      const result = await verifySupabaseJwt(token, hsOpts());
      assert.equal(result.userId, SUBJECT);
      assert.equal(result.payload.iss, ISSUER);
      assert.equal(result.payload.aud, AUDIENCE);
    });

    it('rejects a wrong issuer', async () => {
      const token = await signToken({ alg: 'HS256', iss: 'https://evil.example/auth/v1' });
      await assert.rejects(() => verifySupabaseJwt(token, hsOpts()));
    });

    it('rejects a wrong audience', async () => {
      const token = await signToken({ alg: 'HS256', aud: 'service_role' });
      await assert.rejects(() => verifySupabaseJwt(token, hsOpts()));
    });

    it('rejects an ES256 token (alg mismatch)', async () => {
      const token = await signToken({ key: privateKey });
      await assert.rejects(() => verifySupabaseJwt(token, hsOpts()));
    });
  });
});
