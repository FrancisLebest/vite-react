import { Router } from 'express';
import { z } from 'zod';
import { pool, Q, tx } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { decodeKeyCursor, decodeOffsetCursor, keysetCond, keysetPage, limitSchema, offsetPage } from '../lib/pagination.js';
import { likeEscape } from '../lib/text.js';
import { emptyToUndef, nullableTrimmed, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { singleUpload } from '../middleware/upload.js';
import { storeAvatar, MB } from '../media/process.js';
import { deleteKeys } from '../storage/index.js';
import { loadMe, loadPosts, loadUser, loadUsers, loadUserSummaries, notBlockedSql } from '../services/hydrate.js';
import { notify } from '../services/notifications.js';
import { roleSchema, usernameSchema } from './auth.js';

export const usersRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ensures the user exists and that there is no block between viewer and target. */
export async function assertVisibleUser(viewerId: string, targetId: string) {
  const r = await pool.query(
    `SELECT u.id,
            EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = $2 AND b.blocked_id = u.id) AS i_blocked,
            EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = $2) AS blocked_me
       FROM users u WHERE u.id = $1`,
    [targetId, viewerId],
  );
  const row = r.rows[0];
  if (!row || row.blocked_me) throw notFound('User');
  return { iBlocked: row.i_blocked as boolean };
}


// GET /users — directory
usersRouter.get(
  '/',
  h(async (req, res) => {
    const query = parse(
      z.object({
        q: z.preprocess(emptyToUndef, z.string().trim().max(100).optional()),
        role: z.preprocess(emptyToUndef, roleSchema.optional()),
        university: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
        sort: z.preprocess(emptyToUndef, z.enum(['popular', 'recent']).default('popular')),
        cursor: z.string().optional(),
        limit: limitSchema,
      }),
      req.query,
    );
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`u.id <> ${v}`).and(notBlockedSql('u.id', v));
    if (query.q) {
      const like = q.p(`%${likeEscape(query.q)}%`);
      q.and(`(u.name ILIKE ${like} OR u.username::text ILIKE ${like})`);
    }
    if (query.role) q.and(`u.role = ${q.p(query.role)}`);
    if (query.university) q.and(`u.university ILIKE ${q.p(`%${likeEscape(query.university)}%`)}`);

    if (query.sort === 'recent') {
      keysetCond(q, 'u.created_at', 'u.id', decodeKeyCursor(query.cursor));
      const rows = await pool.query(
        `SELECT u.id, u.created_at::text AS _ct FROM users u ${q.whereSql()} ORDER BY u.created_at DESC, u.id DESC LIMIT ${query.limit + 1}`,
        q.params,
      );
      const page = keysetPage(rows.rows, query.limit);
      res.json({ items: await loadUsers(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
      return;
    }
    const offset = decodeOffsetCursor(query.cursor);
    const rows = await pool.query(
      `SELECT u.id FROM users u ${q.whereSql()} ORDER BY u.follower_count DESC, u.post_count DESC, u.created_at DESC, u.id
       LIMIT ${query.limit + 1} OFFSET ${offset}`,
      q.params,
    );
    const page = offsetPage(rows.rows, query.limit, offset);
    res.json({ items: await loadUsers(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// GET /users/suggested
usersRouter.get(
  '/suggested',
  h(async (req, res) => {
    const { limit } = parse(z.object({ limit: z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number().int().min(1).max(50).default(10)) }), req.query);
    const viewer = me(req);
    const { rows } = await pool.query(
      `SELECT u.id FROM users u
        WHERE u.id <> $1
          AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id)
          AND ${notBlockedSql('u.id', '$1')}
        ORDER BY (u.university IS NOT NULL AND lower(u.university) = lower($2)) DESC,
                 (SELECT count(*) FROM follows f1 JOIN follows f2 ON f2.follower_id = f1.following_id
                   WHERE f1.follower_id = $1 AND f2.following_id = u.id) DESC,
                 u.follower_count DESC, u.post_count DESC, u.created_at DESC
        LIMIT $3`,
      [viewer.id, viewer.university, limit],
    );
    res.json(await loadUserSummaries(pool, rows.map((r) => r.id), viewer.id));
  }),
);

// GET /users/me/blocked
usersRouter.get(
  '/me/blocked',
  h(async (req, res) => {
    const viewer = me(req).id;
    const { rows } = await pool.query('SELECT blocked_id FROM blocks WHERE blocker_id = $1 ORDER BY created_at DESC', [viewer]);
    res.json(await loadUserSummaries(pool, rows.map((r) => r.blocked_id), viewer));
  }),
);

// POST /users/me/push-token
usersRouter.post(
  '/me/push-token',
  h(async (req, res) => {
    const body = parse(z.object({ token: z.string().trim().min(1).max(512), platform: z.enum(['ios', 'android']) }), req.body);
    await pool.query(
      `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now()`,
      [body.token, me(req).id, body.platform],
    );
    res.status(204).end();
  }),
);

// PATCH /users/me
usersRouter.patch(
  '/me',
  h(async (req, res) => {
    const body = parse(
      z
        .object({
          name: z.string().trim().min(1).max(60).optional(),
          username: usernameSchema.optional(),
          bio: nullableTrimmed(300),
          university: nullableTrimmed(120),
          role: roleSchema.optional(),
        })
        .strict(),
      req.body ?? {},
    );
    const viewer = me(req).id;
    if (body.username) {
      const taken = await pool.query('SELECT 1 FROM users WHERE username = $1::citext AND id <> $2', [body.username, viewer]);
      if (taken.rowCount) throw conflict('Username already taken', { field: 'username' });
    }
    const q = new Q();
    const sets: string[] = [];
    const map: Record<string, string> = { name: 'name', username: 'username', bio: 'bio', university: 'university', role: 'role' };
    for (const [k, col] of Object.entries(map)) {
      const val = (body as Record<string, unknown>)[k];
      if (val !== undefined) sets.push(`${col} = ${q.p(val)}`);
    }
    if (sets.length) {
      await pool.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = ${q.p(viewer)}`, q.params);
    }
    res.json(await loadMe(pool, viewer));
  }),
);

// POST /users/me/avatar
usersRouter.post(
  '/me/avatar',
  singleUpload('avatar', 5 * MB),
  h(async (req, res) => {
    if (!req.file) throw badRequest('Missing "avatar" file', [{ path: 'avatar', message: 'Required' }]);
    const viewer = me(req).id;
    const key = await storeAvatar(req.file);
    const old = await pool.query('SELECT avatar_key FROM users WHERE id = $1', [viewer]);
    await pool.query('UPDATE users SET avatar_key = $2, updated_at = now() WHERE id = $1', [viewer, key]);
    deleteKeys([old.rows[0]?.avatar_key]);
    res.json(await loadMe(pool, viewer));
  }),
);

// DELETE /users/me — deletes the account and every piece of content (cascades).
usersRouter.delete(
  '/me',
  h(async (req, res) => {
    const viewer = me(req).id;
    const keys = await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT avatar_key AS k FROM users WHERE id = $1
         UNION ALL SELECT media_key FROM posts WHERE author_id = $1
         UNION ALL SELECT thumbnail_key FROM posts WHERE author_id = $1
         UNION ALL SELECT media_key FROM messages WHERE sender_id = $1
         UNION ALL SELECT thumbnail_key FROM messages WHERE sender_id = $1
         UNION ALL SELECT avatar_key FROM communities WHERE owner_id = $1`,
        [viewer],
      );
      await c.query('DELETE FROM reports WHERE target_type = $1 AND target_id = $2', ['user', viewer]);
      await c.query('DELETE FROM users WHERE id = $1', [viewer]);
      return rows.map((r) => r.k as string | null);
    });
    deleteKeys(keys);
    res.status(204).end();
  }),
);

// GET /users/:idOrUsername
usersRouter.get(
  '/:idOrUsername',
  h(async (req, res) => {
    const viewer = me(req).id;
    const key = String(req.params.idOrUsername).replace(/^@/, '');
    let id: string | undefined;
    if (key === 'me') id = viewer;
    else if (UUID_RE.test(key)) id = key;
    else {
      const r = await pool.query('SELECT id FROM users WHERE username = $1::citext', [key.toLowerCase()]);
      id = r.rows[0]?.id;
    }
    if (!id) throw notFound('User');
    if (id !== viewer) await assertVisibleUser(viewer, id);
    const user = await loadUser(pool, id, viewer);
    if (!user) throw notFound('User');
    res.json(user);
  }),
);

// Follow / unfollow
usersRouter.post(
  '/:id/follow',
  h(async (req, res) => {
    const target = parse(uuid, req.params.id);
    const viewer = me(req).id;
    if (target === viewer) throw badRequest('You cannot follow yourself');
    const { iBlocked } = await assertVisibleUser(viewer, target);
    if (iBlocked) throw forbidden('Unblock this user first');
    const ins = await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1',
      [viewer, target],
    );
    if (ins.rowCount) await notify({ userId: target, actorId: viewer, type: 'follow', text: 'started following you' });
    const c = await pool.query('SELECT follower_count FROM users WHERE id = $1', [target]);
    res.json({ isFollowing: true, followerCount: c.rows[0].follower_count });
  }),
);

usersRouter.delete(
  '/:id/follow',
  h(async (req, res) => {
    const target = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const del = await pool.query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING 1', [viewer, target]);
    if (del.rowCount) {
      await pool.query(`DELETE FROM notifications WHERE user_id = $1 AND actor_id = $2 AND type = 'follow'`, [target, viewer]);
    }
    const c = await pool.query('SELECT follower_count FROM users WHERE id = $1', [target]);
    if (!c.rows[0]) throw notFound('User');
    res.json({ isFollowing: false, followerCount: c.rows[0].follower_count });
  }),
);

// Followers / following
for (const kind of ['followers', 'following'] as const) {
  usersRouter.get(
    `/:id/${kind}`,
    h(async (req, res) => {
      const target = parse(uuid, req.params.id);
      const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
      const viewer = me(req).id;
      if (target !== viewer) await assertVisibleUser(viewer, target);
      const [selfCol, otherCol] = kind === 'followers' ? ['following_id', 'follower_id'] : ['follower_id', 'following_id'];
      const q = new Q();
      const v = q.p(viewer);
      q.and(`f.${selfCol} = ${q.p(target)}`).and(notBlockedSql(`f.${otherCol}`, v));
      keysetCond(q, 'f.created_at', `f.${otherCol}`, decodeKeyCursor(query.cursor));
      const { rows } = await pool.query(
        `SELECT f.${otherCol} AS id, f.created_at::text AS _ct FROM follows f ${q.whereSql()}
          ORDER BY f.created_at DESC, f.${otherCol} DESC LIMIT ${query.limit + 1}`,
        q.params,
      );
      const page = keysetPage(rows, query.limit);
      res.json({ items: await loadUserSummaries(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
    }),
  );
}

// GET /users/:id/posts
usersRouter.get(
  '/:id/posts',
  h(async (req, res) => {
    const target = parse(uuid, req.params.id);
    const query = parse(
      z.object({
        type: z.preprocess(emptyToUndef, z.enum(['video', 'post']).optional()),
        cursor: z.string().optional(),
        limit: limitSchema,
      }),
      req.query,
    );
    const viewer = me(req).id;
    if (target !== viewer) {
      const { iBlocked } = await assertVisibleUser(viewer, target);
      if (iBlocked) {
        res.json({ items: [], nextCursor: null });
        return;
      }
    }
    const q = new Q();
    q.and(`p.author_id = ${q.p(target)}`);
    if (query.type) q.and(`p.type = ${q.p(query.type)}`);
    keysetCond(q, 'p.created_at', 'p.id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT p.id, p.created_at::text AS _ct FROM posts p ${q.whereSql()} ORDER BY p.created_at DESC, p.id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadPosts(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// Block / unblock
usersRouter.post(
  '/:id/block',
  h(async (req, res) => {
    const target = parse(uuid, req.params.id);
    const viewer = me(req).id;
    if (target === viewer) throw badRequest('You cannot block yourself');
    const exists = await pool.query('SELECT 1 FROM users WHERE id = $1', [target]);
    if (!exists.rowCount) throw notFound('User');
    await tx(async (c) => {
      await c.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [viewer, target]);
      await c.query(
        'DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)',
        [viewer, target],
      );
    });
    res.status(204).end();
  }),
);

usersRouter.delete(
  '/:id/block',
  h(async (req, res) => {
    const target = parse(uuid, req.params.id);
    await pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [me(req).id, target]);
    res.status(204).end();
  }),
);
