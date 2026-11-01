import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { pool } from '../db/pool.js';
import { unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

export type Viewer = { id: string; university: string | null };

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
  const r = await pool.query('SELECT id, university FROM users WHERE id = $1', [id]);
  if (!r.rows[0]) throw unauthorized('Account no longer exists');
  return { id: r.rows[0].id, university: r.rows[0].university };
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

/** Wraps async handlers so rejections reach the error middleware. */
export function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
