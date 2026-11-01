import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { uploadRoot, storage } from './storage/index.js';
import { authRouter } from './routes/auth.js';
import { metaRouter } from './routes/meta.js';
import { usersRouter } from './routes/users.js';
import { postsRouter } from './routes/posts.js';
import { communitiesRouter } from './routes/communities.js';
import { searchRouter } from './routes/search.js';
import { conversationsRouter } from './routes/conversations.js';
import { notificationsRouter } from './routes/notifications.js';
import { reportsRouter } from './routes/reports.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      // Media is consumed by native apps / other origins.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: config.corsOrigins === '*' ? true : config.corsOrigins, credentials: true, maxAge: 86400 }));
  if (!config.isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === '/health' || (req.url ?? '').startsWith('/uploads/') },
      }),
    );
  }

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', error: { code: 'INTERNAL', message: 'Database unavailable' } });
    }
  });

  if (storage.driver === 'local') {
    app.use('/uploads', express.static(uploadRoot, { maxAge: '365d', immutable: true, fallthrough: false, index: false, dotfiles: 'deny' }));
  }

  const api = Router();
  api.use(apiLimiter);
  api.use(express.json({ limit: '1mb' }));
  api.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Public routes
  api.use('/auth', authRouter);
  api.use(metaRouter);

  // Everything below requires a valid access token.
  api.use(requireAuth);
  api.use('/users', usersRouter);
  api.use('/communities', communitiesRouter);
  api.use('/search', searchRouter);
  api.use('/conversations', conversationsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/reports', reportsRouter);
  api.use(postsRouter); // /feed, /posts, /comments, /me/bookmarks

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
