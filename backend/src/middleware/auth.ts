import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { pool } from '../db/pool.js';
import { forbidden, suspended, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

export type Viewer = { id: string; university: string | null; isAdmin: boolean; interests: string[] };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Viewer;
    }
  }
}

export async function viewerFromToken(token: string): Promise<Viewer> {
  const id = verifyAccessToken(token);
  const r = await pool.query('SELECT id, university, is_admin, interests, suspended_at, suspended_reason FROM users WHERE id = $1', [id]);
  const row = r.rows[0];
  if (!row) throw unauthorized('Account no longer exists');
  if (row.suspended_at) throw suspended(row.suspended_reason);
  return { id: row.id, university: row.university, isAdmin: row.is_admin, interests: row.interests ?? [] };
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = bearer(req);
  if (!token) return next(unauthorized());
  viewerFromToken(token)
    .then((v) => {
      req.user = v;
      next();
    })
    .catch(next);
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next();
  viewerFromToken(token)
    .then((v) => {
      req.user = v;
      next();
    })
    .catch(next);
};

/** The authenticated viewer (use only behind requireAuth). */
export function me(req: Request): Viewer {
  if (!req.user) throw unauthorized();
  return req.user;
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user?.isAdmin) return next(forbidden('Administrator access required'));
  next();
};

/** Wraps async handlers so rejections reach the error middleware. */
export function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
