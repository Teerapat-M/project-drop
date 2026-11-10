import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { authIssuer, getSupabaseConfig, jwksUrl } from '../config';

export type VerifiedAccess = {
  userId: string;
  token: string;
  payload: JWTPayload;
};

export type JwtVerifyFn = (token: string) => Promise<VerifiedAccess>;

export const ACCESS_TOKEN_AUDIENCE = 'authenticated';
export const JWKS_ALGORITHMS = ['ES256', 'RS256'] as const;
export const HS256_ALGORITHMS = ['HS256'] as const;

export type VerifyJwtOptions = {
  url?: string;
  jwtSecret?: string;
  /** Injected JWKS (tests). Ignored when `hs256Only` is true. */
  getKey?: JWTVerifyGetKey;
  /** Force the HS256 secret path (no JWKS). */
  hs256Only?: boolean;
};

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

function resolveGetKey(url: string, options: VerifyJwtOptions): JWTVerifyGetKey | undefined {
  if (options.hs256Only) return undefined;
  if (options.getKey) return options.getKey;
  return url ? getJwks(url) : undefined;
}

/**
 * Prefer JWKS at SUPABASE_URL/auth/v1/.well-known/jwks.json (ES256/RS256).
 * Fall back to SUPABASE_JWT_SECRET HS256 when that env is set (legacy projects).
 * Both paths require issuer `${SUPABASE_URL}/auth/v1` and audience `authenticated`.
 */
export async function verifySupabaseJwt(
  token: string,
  options: VerifyJwtOptions = {},
): Promise<VerifiedAccess> {
  const cfg = getSupabaseConfig();
  const url = options.url ?? cfg.url;
  const jwtSecret = options.jwtSecret ?? cfg.jwtSecret;
  if (!token) throw new Error('missing token');
  if (!url) throw new Error('JWT verification is not configured');

  const issuer = authIssuer(url);
  const getKey = resolveGetKey(url, options);

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    alg = undefined;
  }

  const verifyHs256 = async () => {
    if (!jwtSecret) throw new Error('HS256 token requires SUPABASE_JWT_SECRET');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
      issuer,
      audience: ACCESS_TOKEN_AUDIENCE,
      algorithms: [...HS256_ALGORITHMS],
    });
    return requireSub(payload, token);
  };

  const verifyJwks = async () => {
    if (!getKey) throw new Error('JWT verification is not configured');
    const { payload } = await jwtVerify(token, getKey, {
      issuer,
      audience: ACCESS_TOKEN_AUDIENCE,
      algorithms: [...JWKS_ALGORITHMS],
    });
    return requireSub(payload, token);
  };

  if (options.hs256Only) {
    return verifyHs256();
  }

  if (alg === 'HS256') {
    if (jwtSecret) return verifyHs256();
    if (getKey) return verifyJwks();
    throw new Error('HS256 token requires SUPABASE_JWT_SECRET');
  }

  if (getKey) return verifyJwks();
  if (jwtSecret) return verifyHs256();

  throw new Error('JWT verification is not configured');
}
