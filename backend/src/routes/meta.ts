import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { CATEGORIES } from '../lib/categories.js';
import { likeEscape } from '../lib/text.js';
import { emptyToUndef, parse } from '../lib/validate.js';
import { h, optionalAuth, requireAuth } from '../middleware/auth.js';

export const metaRouter = Router();

metaRouter.get('/categories', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').json(CATEGORIES);
});

metaRouter.get(
  '/trending/topics',
  requireAuth,
  h(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT category, count(*)::int AS n FROM posts WHERE created_at > now() - interval '7 days' GROUP BY category`,
    );
    const counts = new Map(rows.map((r) => [r.category as string, r.n as number]));
    const topics = CATEGORIES.map((c, i) => ({ ...c, postCount: counts.get(c.id) ?? 0, _i: i }))
      .sort((a, b) => b.postCount - a.postCount || a._i - b._i)
      .map(({ _i, ...c }) => c);
    res.json(topics);
  }),
);

metaRouter.get(
  '/trending/hashtags',
  requireAuth,
  h(async (req, res) => {
    const { limit } = parse(
      z.object({ limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(50).default(10)) }),
      req.query,
    );
    const { rows } = await pool.query(
      `SELECT tag, count(*)::int AS "postCount"
         FROM posts, unnest(hashtags) AS tag
        WHERE created_at > now() - interval '7 days'
        GROUP BY tag ORDER BY count(*) DESC, max(created_at) DESC LIMIT $1`,
      [limit],
    );
    res.json(rows);
  }),
);

// Public: used by the sign-up screen.
metaRouter.get(
  '/universities',
  optionalAuth,
  h(async (req, res) => {
    const { q } = parse(z.object({ q: z.preprocess(emptyToUndef, z.string().trim().max(100).optional()) }), req.query);
    const like = q ? `%${likeEscape(q)}%` : '%';
    const { rows } = await pool.query(
      `SELECT min(name) AS name FROM (
         SELECT btrim(university) AS name FROM users WHERE university IS NOT NULL AND btrim(university) <> '' AND university ILIKE $1
         UNION ALL
         SELECT name::text FROM communities WHERE kind = 'university' AND name ILIKE $1
       ) s
       GROUP BY lower(name)
       ORDER BY count(*) DESC, min(name)
       LIMIT 50`,
      [like],
    );
    const out = rows.map((r) => r.name as string);
    res.json(out);
  }),
);
