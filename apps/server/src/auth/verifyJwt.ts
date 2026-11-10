import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { getSupabaseConfig, jwksUrl } from '../config';

export type VerifiedAccess = {
  userId: string;
  token: string;
  payload: JWTPayload;
};

export type JwtVerifyFn = (token: string) => Promise<VerifiedAccess>;

const jwksCache = new Map<string, JWTVerifyGetKey>();

function getJwks(url: string): JWTVerifyGetKey {
  const endpoint = jwksUrl(url);
  let jwks = jwksCache.get(endpoint);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(endpoint));
    jwksCache.set(endpoint, jwks);
  }
  return jwks;
}

function requireSub(payload: JWTPayload, token: string): VerifiedAccess {
  const userId = typeof payload.sub === 'string' ? payload.sub : '';
  if (!userId) throw new Error('missing sub');
  return { userId, token, payload };
}

/**
 * Prefer JWKS at SUPABASE_URL/auth/v1/.well-known/jwks.json.
 * Fall back to SUPABASE_JWT_SECRET HS256 when that env is set (legacy projects).
 */
export async function verifySupabaseJwt(token: string): Promise<VerifiedAccess> {
  const { url, jwtSecret } = getSupabaseConfig();
  if (!token) throw new Error('missing token');

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    alg = undefined;
  }

  if (alg === 'HS256') {
    if (!jwtSecret) throw new Error('HS256 token requires SUPABASE_JWT_SECRET');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
      algorithms: ['HS256'],
    });
    return requireSub(payload, token);
  }

  if (url) {
    try {
      const { payload } = await jwtVerify(token, getJwks(url));
      return requireSub(payload, token);
    } catch (err) {
      if (!jwtSecret) throw err;
    }
  }

  if (jwtSecret) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
      algorithms: ['HS256'],
    });
    return requireSub(payload, token);
  }

  throw new Error('JWT verification is not configured');
}
