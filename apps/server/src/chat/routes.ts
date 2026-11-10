import type { Express, RequestHandler, Response } from 'express';
import type { AuthLocals } from '../auth/middleware';
import type { LoadMe } from '../auth/me';
import { httpStatusFor, RideError } from '../rides/errors';
import type { ChatActor, ChatService } from './service';

function sendError(res: Response, err: unknown): void {
  if (err instanceof RideError) {
    res.status(httpStatusFor(err.code)).json({ error: err.code === 'invalid' ? err.message : err.code });
    return;
  }
  res.status(503).json({ error: 'message lookup failed' });
}

async function actorOf(res: Response, loadMe: LoadMe): Promise<ChatActor> {
  const auth = (res.locals as AuthLocals).auth;
  if (!auth) throw new RideError('unauthorized', 'unauthorized');
  const me = await loadMe(auth.userId, auth.token);
  return { id: me.id, role: me.role, token: auth.token };
}

function idParam(id: string | string[] | undefined): string {
  const value = Array.isArray(id) ? id[0] : id;
  if (!value) throw new RideError('invalid', 'id required');
  return value;
}

export function mountChatRoutes(
  app: Express,
  requireAuth: RequestHandler,
  chat: ChatService,
  loadMe: LoadMe,
): void {
  app.get('/rides/:id/messages', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      res.status(200).json(await chat.list(actor, idParam(req.params.id)));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/rides/:id/messages', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      const body = (req.body ?? {}) as { text?: unknown; preset_key?: unknown; source_lang?: unknown };
      const sent = await chat.send(actor, idParam(req.params.id), {
        text: typeof body.text === 'string' ? body.text : undefined,
        preset_key: typeof body.preset_key === 'string' ? body.preset_key : undefined,
        source_lang: typeof body.source_lang === 'string' ? body.source_lang : undefined,
      });
      res.status(201).json(sent);
    } catch (err) {
      sendError(res, err);
    }
  });
}
