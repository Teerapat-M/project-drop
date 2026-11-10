import type { Express, RequestHandler, Response } from 'express';
import { isVehicleType } from '@drop/types';
import type { AuthLocals } from '../auth/middleware';
import type { LoadMe } from '../auth/me';
import { httpStatusFor, RideError } from './errors';
import { parseCreateRide, type RideActor, type RideService } from './service';

function sendError(res: Response, err: unknown): void {
  if (err instanceof RideError) {
    res.status(httpStatusFor(err.code)).json({
      error: err.code === 'invalid' ? err.message : err.code,
      ...err.extras,
    });
    return;
  }
  res.status(503).json({ error: 'ride lookup failed' });
}

async function actorOf(res: Response, loadMe: LoadMe): Promise<RideActor> {
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

export function mountRideRoutes(
  app: Express,
  requireAuth: RequestHandler,
  rides: RideService,
  loadMe: LoadMe,
): void {
  app.post('/rides', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      const input = parseCreateRide(req.body);
      const body = await rides.create(actor, input);
      res.status(201).json(body);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/rides', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      res.status(200).json(await rides.list(actor, status));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/rides/nearby', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new RideError('invalid', 'lat and lng required');
      }
      const radiusRaw = req.query.radius_m;
      const radiusM =
        typeof radiusRaw === 'string' && radiusRaw !== '' ? Number(radiusRaw) : undefined;
      if (radiusM !== undefined && !Number.isFinite(radiusM)) {
        throw new RideError('invalid', 'radius_m must be a number');
      }
      res.status(200).json(await rides.listNearby(actor, lat, lng, radiusM));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/rides/:id', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      res.status(200).json(await rides.get(actor, idParam(req.params.id)));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/rides/:id/accept', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      res.status(200).json(await rides.accept(actor, idParam(req.params.id)));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/rides/:id/decline', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      res.status(200).json(await rides.decline(actor, idParam(req.params.id)));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/rides/:id/arrive', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      res.status(200).json(await rides.arrive(actor, idParam(req.params.id)));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/rides/:id/start', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      const pin = typeof req.body?.pin === 'string' ? req.body.pin : undefined;
      res.status(200).json(await rides.start(actor, idParam(req.params.id), pin));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/rides/:id/cancel', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      res.status(200).json(await rides.cancel(actor, idParam(req.params.id)));
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put('/driver-location', requireAuth, async (req, res) => {
    try {
      const actor = await actorOf(res, loadMe);
      const b = req.body as Record<string, unknown>;
      const lat = b?.lat;
      const lng = b?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new RideError('invalid', 'lat and lng required');
      }
      const vehicle_type = isVehicleType(b.vehicle_type) ? b.vehicle_type : null;
      const body = await rides.upsertLocation(actor, {
        lat,
        lng,
        heading: typeof b.heading === 'number' ? b.heading : null,
        is_online: b.is_online === true,
        vehicle_type,
      });
      res.status(200).json(body);
    } catch (err) {
      sendError(res, err);
    }
  });
}
