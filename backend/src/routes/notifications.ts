import { Router } from 'express';
import { z } from 'zod';
import { pool, Q } from '../db/pool.js';
import { decodeKeyCursor, keysetCond, keysetPage, limitSchema } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { loadNotifications, notBlockedSql } from '../services/hydrate.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  h(async (req, res) => {
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`n.user_id = ${v}`).and(notBlockedSql('n.actor_id', v));
    keysetCond(q, 'n.created_at', 'n.id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT n.id, n.created_at::text AS _ct FROM notifications n ${q.whereSql()}
        ORDER BY n.created_at DESC, n.id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadNotifications(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

notificationsRouter.get(
  '/unread-count',
  h(async (req, res) => {
    const viewer = me(req).id;
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count FROM notifications n WHERE n.user_id = $1 AND NOT n.read AND ${notBlockedSql('n.actor_id', '$1')}`,
      [viewer],
    );
    res.json({ count: rows[0].count });
  }),
);

notificationsRouter.post(
  '/read-all',
  h(async (req, res) => {
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1 AND NOT read', [me(req).id]);
    res.status(204).end();
  }),
);
