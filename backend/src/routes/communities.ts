import { Router } from 'express';
import { z } from 'zod';
import { pool, Q, tx } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { decodeKeyCursor, decodeOffsetCursor, keysetCond, keysetPage, limitSchema, offsetPage } from '../lib/pagination.js';
import { likeEscape } from '../lib/text.js';
import { boolish, emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { singleUpload } from '../middleware/upload.js';
import { MB, storeAvatar } from '../media/process.js';
import { deleteKeys } from '../storage/index.js';
import { loadCommunities, loadPosts, loadUserSummaries, notBlockedSql, postVisibleSql } from '../services/hydrate.js';
import { filterOptional, filterText } from '../lib/contentFilter.js';
import { notify } from '../services/notifications.js';

export const communitiesRouter = Router();

const kindSchema = z.enum(['university', 'faculty', 'topic']);
const iconSchema = z.string().trim().regex(/^[a-z0-9-]{1,50}$/, 'Icon must be an Ionicons name');
const colorSchema = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a #hex value');
const nameSchema = z.string().trim().min(3, 'Name must be at least 3 characters').max(60);
const descriptionSchema = z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(500));

const createSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  kind: kindSchema,
  icon: z.preprocess(emptyToUndef, iconSchema.default('people-outline')),
  color: z.preprocess(emptyToUndef, colorSchema.default('#6C5CE7')),
});

const updateSchema = z.object({
  name: z.preprocess(emptyToUndef, nameSchema.optional()),
  description: descriptionSchema.optional(),
  kind: z.preprocess(emptyToUndef, kindSchema.optional()),
  icon: z.preprocess(emptyToUndef, iconSchema.optional()),
  color: z.preprocess(emptyToUndef, colorSchema.optional()),
});

async function getCommunity(id: string) {
  const r = await pool.query('SELECT id, owner_id, name, avatar_key FROM communities WHERE id = $1', [id]);
  if (!r.rows[0]) throw notFound('Community');
  return r.rows[0] as { id: string; owner_id: string; name: string; avatar_key: string | null };
}

async function assertNameFree(name: string, exceptId?: string) {
  const r = await pool.query('SELECT 1 FROM communities WHERE name = $1::citext AND ($2::uuid IS NULL OR id <> $2)', [name, exceptId ?? null]);
  if (r.rowCount) throw conflict('A community with this name already exists', { field: 'name' });
}

// GET /communities
communitiesRouter.get(
  '/',
  h(async (req, res) => {
    const query = parse(
      z.object({
        q: z.preprocess(emptyToUndef, z.string().trim().max(100).optional()),
        kind: z.preprocess(emptyToUndef, kindSchema.optional()),
        mine: z.preprocess(emptyToUndef, boolish.optional()),
        sort: z.preprocess(emptyToUndef, z.enum(['popular', 'recent']).default('popular')),
        cursor: z.string().optional(),
        limit: limitSchema,
      }),
      req.query,
    );
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(notBlockedSql('c.owner_id', v));
    if (query.q) {
      const like = q.p(`%${likeEscape(query.q)}%`);
      q.and(`(c.name::text ILIKE ${like} OR c.description ILIKE ${like})`);
    }
    if (query.kind) q.and(`c.kind = ${q.p(query.kind)}`);
    if (query.mine) q.and(`EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = ${v})`);
    if (query.sort === 'recent') {
      keysetCond(q, 'c.created_at', 'c.id', decodeKeyCursor(query.cursor));
      const { rows } = await pool.query(
        `SELECT c.id, c.created_at::text AS _ct FROM communities c ${q.whereSql()} ORDER BY c.created_at DESC, c.id DESC LIMIT ${query.limit + 1}`,
        q.params,
      );
      const page = keysetPage(rows, query.limit);
      res.json({ items: await loadCommunities(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
      return;
    }
    const offset = decodeOffsetCursor(query.cursor);
    const { rows } = await pool.query(
      `SELECT c.id FROM communities c ${q.whereSql()}
        ORDER BY c.member_count DESC, c.post_count DESC, c.created_at DESC, c.id LIMIT ${query.limit + 1} OFFSET ${offset}`,
      q.params,
    );
    const page = offsetPage(rows, query.limit, offset);
    res.json({ items: await loadCommunities(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// POST /communities (JSON or multipart with optional `avatar`)
communitiesRouter.post(
  '/',
  singleUpload('avatar', 5 * MB),
  h(async (req, res) => {
    const body = parse(createSchema, req.body ?? {});
    body.name = filterText(body.name, 'name');
    body.description = filterOptional(body.description, 'description');
    const viewer = me(req).id;
    await assertNameFree(body.name);
    const avatarKey = req.file ? await storeAvatar(req.file) : null;
    try {
      const id = await tx(async (c) => {
        const r = await c.query(
          `INSERT INTO communities (name, description, kind, icon, color, avatar_key, owner_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [body.name, body.description ?? '', body.kind, body.icon, body.color, avatarKey, viewer],
        );
        await c.query(`INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'owner')`, [r.rows[0].id, viewer]);
        return r.rows[0].id as string;
      });
      const [community] = await loadCommunities(pool, [id], viewer);
      res.status(201).json(community);
    } catch (err) {
      deleteKeys([avatarKey]);
      throw err;
    }
  }),
);

// GET /communities/:id
communitiesRouter.get(
  '/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const [community] = await loadCommunities(pool, [id], me(req).id);
    if (!community) throw notFound('Community');
    res.json(community);
  }),
);

// PATCH /communities/:id (owner only)
communitiesRouter.patch(
  '/:id',
  singleUpload('avatar', 5 * MB),
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const community = await getCommunity(id);
    if (community.owner_id !== viewer) throw forbidden('Only the owner can edit this community');
    const body = parse(updateSchema, req.body ?? {});
    body.name = filterOptional(body.name, 'name');
    body.description = filterOptional(body.description, 'description');
    if (body.name) await assertNameFree(body.name, id);
    const q = new Q();
    const sets: string[] = [];
    for (const k of ['name', 'description', 'kind', 'icon', 'color'] as const) {
      if (body[k] !== undefined) sets.push(`${k} = ${q.p(body[k])}`);
    }
    let newAvatar: string | null = null;
    if (req.file) {
      newAvatar = await storeAvatar(req.file);
      sets.push(`avatar_key = ${q.p(newAvatar)}`);
    }
    if (!sets.length) throw badRequest('Nothing to update');
    await pool.query(`UPDATE communities SET ${sets.join(', ')}, updated_at = now() WHERE id = ${q.p(id)}`, q.params);
    if (newAvatar) deleteKeys([community.avatar_key]);
    const [updated] = await loadCommunities(pool, [id], viewer);
    res.json(updated);
  }),
);

// DELETE /communities/:id (owner only)
communitiesRouter.delete(
  '/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const community = await getCommunity(id);
    if (community.owner_id !== me(req).id) throw forbidden('Only the owner can delete this community');
    await pool.query('DELETE FROM communities WHERE id = $1', [id]);
    await pool.query(`DELETE FROM reports WHERE target_type = 'community' AND target_id = $1`, [id]);
    deleteKeys([community.avatar_key]);
    res.status(204).end();
  }),
);

// Join / leave
communitiesRouter.post(
  '/:id/join',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const community = await getCommunity(id);
    const ins = await pool.query(
      'INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1',
      [id, viewer],
    );
    if (ins.rowCount) {
      await notify({
        userId: community.owner_id,
        actorId: viewer,
        type: 'community_join',
        communityId: id,
        text: `joined your community ${community.name}`,
      });
    }
    const c = await pool.query('SELECT member_count FROM communities WHERE id = $1', [id]);
    res.json({ isMember: true, memberCount: c.rows[0].member_count });
  }),
);

communitiesRouter.delete(
  '/:id/join',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const community = await getCommunity(id);
    if (community.owner_id === viewer) throw forbidden('The owner cannot leave the community (delete it instead)');
    const del = await pool.query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2 RETURNING 1', [id, viewer]);
    if (del.rowCount) {
      await pool.query(`DELETE FROM notifications WHERE actor_id = $1 AND community_id = $2 AND type = 'community_join'`, [viewer, id]);
    }
    const c = await pool.query('SELECT member_count FROM communities WHERE id = $1', [id]);
    res.json({ isMember: false, memberCount: c.rows[0].member_count });
  }),
);

// GET /communities/:id/posts
communitiesRouter.get(
  '/:id/posts',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    await getCommunity(id);
    const q = new Q();
    const v = q.p(viewer);
    q.and(`p.community_id = ${q.p(id)}`).and(`p.status = 'ready'`).and(postVisibleSql('p', v));
    keysetCond(q, 'p.created_at', 'p.id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT p.id, p.created_at::text AS _ct FROM posts p ${q.whereSql()} ORDER BY p.created_at DESC, p.id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadPosts(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// GET /communities/:id/members
communitiesRouter.get(
  '/:id/members',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    await getCommunity(id);
    const q = new Q();
    const v = q.p(viewer);
    q.and(`m.community_id = ${q.p(id)}`).and(notBlockedSql('m.user_id', v));
    keysetCond(q, 'm.created_at', 'm.user_id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT m.user_id AS id, m.created_at::text AS _ct FROM community_members m ${q.whereSql()}
        ORDER BY m.created_at DESC, m.user_id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadUserSummaries(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);
