import type { NextFunction, Request, Response } from 'express';
import { verifySupabaseJwt, type JwtVerifyFn, type VerifiedAccess } from './verifyJwt';

export type AuthLocals = {
  auth?: VerifiedAccess;
};

export function createAuthMiddleware(verify: JwtVerifyFn = verifySupabaseJwt) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      (res.locals as AuthLocals).auth = await verify(token);
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
}

export const requireAuth = createAuthMiddleware();
