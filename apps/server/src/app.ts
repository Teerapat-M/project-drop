import express from 'express';
import { createAuthMiddleware, type AuthLocals } from './auth/middleware';
import { loadMe, type LoadMe } from './auth/me';
import { verifySupabaseJwt, type JwtVerifyFn } from './auth/verifyJwt';

export type AppDeps = {
  verify?: JwtVerifyFn;
  loadMe?: LoadMe;
};

export function createApp(deps: AppDeps = {}) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const requireAuth = createAuthMiddleware(deps.verify ?? verifySupabaseJwt);
  const fetchMe = deps.loadMe ?? loadMe;

  app.get('/me', requireAuth, async (_req, res) => {
    try {
      const auth = (res.locals as AuthLocals).auth;
      if (!auth) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const body = await fetchMe(auth.userId, auth.token);
      res.status(200).json(body);
    } catch {
      res.status(503).json({ error: 'profile lookup failed' });
    }
  });

  return app;
}

export const app = createApp();
