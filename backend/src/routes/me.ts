import { Router } from 'express';
import { z } from 'zod';
import { pool, Q } from '../db/pool.js';
import { conflict, notFound } from '../lib/errors.js';
import { decodeKeyCursor, keysetCond, keysetPage, limitSchema } from '../lib/pagination.js';
import { filterOptional } from '../lib/contentFilter.js';
import { emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { loadPosts, loadUserSummaryMap, loadVerificationRequests } from '../services/hydrate.js';
import { acceptRequest } from './users.js';

export const meRouter = Router();

// ------------------------------------------------------------------ follow requests
meRouter.get(
  '/follow-requests',
  h(async (req, res) => {
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    const q = new Q();
    q.and(`fr.target_id = ${q.p(viewer)}`);
    keysetCond(q, 'fr.created_at', 'fr.requester_id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT fr.requester_id AS id, fr.created_at, fr.created_at::text AS _ct FROM follow_requests fr ${q.whereSql()}
        ORDER BY fr.created_at DESC, fr.requester_id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    const users = await loadUserSummaryMap(pool, page.rows.map((r) => r.id), viewer);
    res.json({
      items: page.rows.filter((r) => users.has(r.id)).map((r) => ({ user: users.get(r.id), createdAt: new Date(r.created_at).toISOString() })),
      nextCursor: page.nextCursor,
    });
  }),
);

meRouter.get(
  '/follow-requests/count',
  h(async (req, res) => {
    const r = await pool.query('SELECT count(*)::int AS count FROM follow_requests WHERE target_id = $1', [me(req).id]);
    res.json({ count: r.rows[0].count });
  }),
);

meRouter.post(
  '/follow-requests/:userId/accept',
  h(async (req, res) => {
    const requester = parse(uuid, req.params.userId);
    if (!(await acceptRequest(me(req).id, requester))) throw notFound('Follow request');
    res.status(204).end();
  }),
);

meRouter.post(
  '/follow-requests/:userId/decline',
  h(async (req, res) => {
    const requester = parse(uuid, req.params.userId);
    const viewer = me(req).id;
    const del = await pool.query('DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2 RETURNING 1', [requester, viewer]);
    if (!del.rowCount) throw notFound('Follow request');
    await pool.query(`DELETE FROM notifications WHERE user_id = $1 AND actor_id = $2 AND type = 'follow_request'`, [viewer, requester]);
    res.status(204).end();
  }),
);

// ------------------------------------------------------------------ analytics
const RANGES = { '7d': 7, '28d': 28, '90d': 90 } as const;

meRouter.get(
  '/analytics',
  h(async (req, res) => {
    const { range } = parse(z.object({ range: z.preprocess(emptyToUndef, z.enum(['7d', '28d', '90d']).default('28d')) }), req.query);
    const viewer = me(req).id;
    const n = RANGES[range];
    const bounds = await pool.query(
      `SELECT to_char((now() AT TIME ZONE 'UTC')::date - ($1::int - 1), 'YYYY-MM-DD') AS from,
              to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS to`,
      [n],
    );
    const { from, to } = bounds.rows[0] as { from: string; to: string };
    const fromTs = `${from}T00:00:00Z`;
    const [stats, likes, comments, followers, top, totals] = await Promise.all([
      pool.query(
        `SELECT to_char(s.day, 'YYYY-MM-DD') AS day, sum(s.views)::int AS views, sum(s.shares)::int AS shares
           FROM post_stats_daily s JOIN posts p ON p.id = s.post_id
          WHERE p.author_id = $1 AND s.day >= $2::date GROUP BY s.day`,
        [viewer, from],
      ),
      pool.query(
        `SELECT to_char((l.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
           FROM post_likes l JOIN posts p ON p.id = l.post_id
          WHERE p.author_id = $1 AND l.user_id <> $1 AND l.created_at >= $2::timestamptz GROUP BY 1`,
        [viewer, fromTs],
      ),
      pool.query(
        `SELECT to_char((c.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
           FROM comments c JOIN posts p ON p.id = c.post_id
          WHERE p.author_id = $1 AND c.author_id <> $1 AND c.created_at >= $2::timestamptz GROUP BY 1`,
        [viewer, fromTs],
      ),
      pool.query(
        `SELECT to_char((f.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
           FROM follows f WHERE f.following_id = $1 AND f.created_at >= $2::timestamptz GROUP BY 1`,
        [viewer, fromTs],
      ),
      pool.query(
        `SELECT p.id,
                COALESCE((SELECT sum(views) FROM post_stats_daily s WHERE s.post_id = p.id AND s.day >= $2::date), 0)::int AS views,
                COALESCE((SELECT sum(shares) FROM post_stats_daily s WHERE s.post_id = p.id AND s.day >= $2::date), 0)::int AS shares,
                (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id AND l.user_id <> $1 AND l.created_at >= $3::timestamptz)::int AS likes,
                (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.author_id <> $1 AND c.created_at >= $3::timestamptz)::int AS comments
           FROM posts p WHERE p.author_id = $1 AND p.status = 'ready'`,
        [viewer, from, fromTs],
      ),
      pool.query('SELECT follower_count, post_count FROM users WHERE id = $1', [viewer]),
    ]);
    const daily = new Map<string, { date: string; views: number; likes: number; comments: number; shares: number; newFollowers: number }>();
    const start = Date.parse(fromTs);
    for (let i = 0; i < n; i += 1) {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      daily.set(date, { date, views: 0, likes: 0, comments: 0, shares: 0, newFollowers: 0 });
    }
    for (const r of stats.rows) {
      const d = daily.get(r.day);
      if (d) {
        d.views = r.views;
        d.shares = r.shares;
      }
    }
    for (const [rows, key] of [[likes.rows, 'likes'], [comments.rows, 'comments'], [followers.rows, 'newFollowers']] as const) {
      for (const r of rows) {
        const d = daily.get(r.day);
        if (d) d[key] = r.n;
      }
    }
    const series = [...daily.values()];
    const sum = (k: 'views' | 'likes' | 'comments' | 'shares' | 'newFollowers') => series.reduce((acc, d) => acc + d[k], 0);
    const ranked = top.rows
      .filter((r) => r.views + r.likes + r.comments + r.shares > 0)
      .sort((a, b) => b.views - a.views || b.likes - a.likes || b.comments - a.comments)
      .slice(0, 5);
    const posts = new Map((await loadPosts(pool, ranked.map((r) => r.id), viewer)).map((p) => [p.id, p]));
    res.json({
      range,
      from,
      to,
      totals: { views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), newFollowers: sum('newFollowers') },
      daily: series,
      topPosts: ranked
        .filter((r) => posts.has(r.id))
        .map((r) => ({ post: posts.get(r.id), views: r.views, likes: r.likes, comments: r.comments, shares: r.shares })),
      followerCount: totals.rows[0].follower_count,
      postCount: totals.rows[0].post_count,
    });
  }),
);

// ------------------------------------------------------------------ verification requests
meRouter.post(
  '/verification-request',
  h(async (req, res) => {
    const { message } = parse(z.object({ message: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()) }), req.body ?? {});
    const viewer = me(req).id;
    const u = await pool.query('SELECT verified FROM users WHERE id = $1', [viewer]);
    if (u.rows[0].verified) throw conflict('Your account is already verified');
    const ins = await pool.query(
      `INSERT INTO verification_requests (user_id, message) VALUES ($1, $2) ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING RETURNING id`,
      [viewer, filterOptional(message, 'message') ?? null],
    );
    if (!ins.rowCount) throw conflict('A verification request is already pending');
    const [out] = await loadVerificationRequests(pool, [ins.rows[0].id], viewer);
    res.status(201).json(out);
  }),
);

meRouter.get(
  '/verification-request',
  h(async (req, res) => {
    const viewer = me(req).id;
    const r = await pool.query('SELECT id FROM verification_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [viewer]);
    if (!r.rows[0]) {
      res.json(null);
      return;
    }
    const [out] = await loadVerificationRequests(pool, [r.rows[0].id], viewer);
    res.json(out);
  }),
);
