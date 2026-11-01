import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { errorBody } from '../lib/errors.js';

const passthrough: RequestHandler = (_req, _res, next) => next();

function make(windowMs: number, limit: number): RequestHandler {
  if (!config.RATE_LIMIT_ENABLED) return passthrough;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(errorBody('RATE_LIMITED', 'Too many requests, please try again later'));
    },
  });
}

export const apiLimiter = make(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX);
export const authLimiter = make(config.AUTH_RATE_LIMIT_WINDOW_MS, config.AUTH_RATE_LIMIT_MAX);
