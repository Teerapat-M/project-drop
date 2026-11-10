import express from 'express';
import { createAuthMiddleware, type AuthLocals } from './auth/middleware';
import { loadMe, type LoadMe } from './auth/me';
import { verifySupabaseJwt, type JwtVerifyFn } from './auth/verifyJwt';
import { mountChatRoutes } from './chat/routes';
import { createSupabaseChatService, type ChatService } from './chat/service';
import { mountRideRoutes } from './rides/routes';
import { createSupabaseRideService, type RideService } from './rides/service';

export type AppDeps = {
  verify?: JwtVerifyFn;
  loadMe?: LoadMe;
  rides?: RideService;
  chat?: ChatService;
};

export function createApp(deps: AppDeps = {}) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const requireAuth = createAuthMiddleware(deps.verify ?? verifySupabaseJwt);
  const fetchMe = deps.loadMe ?? loadMe;
  const rides = deps.rides ?? createSupabaseRideService();
  const chat = deps.chat ?? createSupabaseChatService();

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

  mountRideRoutes(app, requireAuth, rides, fetchMe);
  mountChatRoutes(app, requireAuth, chat, fetchMe);

  return app;
}

export const app = createApp();
