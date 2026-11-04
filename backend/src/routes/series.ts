import { Router } from 'express';
import { z } from 'zod';
import { pool, Q, tx } from '../db/pool.js';
import { CATEGORY_IDS } from '../lib/categories.js';
import { filterOptional, filterText } from '../lib/contentFilter.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { decodeKeyCursor, keysetCond, keysetPage, limitSchema } from '../lib/pagination.js';
import { emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { singleUpload } from '../middleware/upload.js';
import { MB, storeMedia } from '../media/process.js';
import { deleteKeys } from '../storage/index.js';
import { canSeeUserContentSql, loadPosts, loadSeries, postVisibleSql } from '../services/hydrate.js';
import { assertVisibleUser } from './users.js';

export const seriesRouter = Router();

const titleSchema = z.string().trim().min(1).max(100);
const descriptionSchema = z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(1000));

type SeriesRow = { id: string; author_id: string; cover_key: string | null };

/** Series visible to the viewer (author content visibility), or 404. */
async function getSeries(id: string, viewerId: string): Promise<SeriesRow> {
  const r = await pool.query(
    `SELECT s.id, s.author_id, s.cover_key FROM series s WHERE s.id = $1 AND ${canSeeUserContentSql('s.author_id', '$2')}`,
    [id, viewerId],
  );
  if (!r.rows[0]) throw notFound('Series');
  return r.rows[0];
}

async function ownSeries(id: string, viewerId: string): Promise<SeriesRow> {
  const s = await getSeries(id, viewerId);
  if (s.author_id !== viewerId) throw forbidden('Only the owner can modify this series');
  return s;
}

async function seriesDetail(id: string, viewerId: string) {
  const [series] = await loadSeries(pool, [id], viewerId);
  const { rows } = await pool.query(
    `SELECT si.post_id FROM series_items si JOIN posts p ON p.id = si.post_id
      WHERE si.series_id = $1 AND ${postVisibleSql('p', '$2')} AND (p.status = 'ready' OR p.author_id = $2)
      ORDER BY si.position`,
    [id, viewerId],
  );
  return { ...series, items: await loadPosts(pool, rows.map((r) => r.post_id), viewerId) };
}

/** Rewrites positions 1..n following `orderedIds`. */
async function writePositions(c: { query: typeof pool.query }, seriesId: string, orderedIds: string[]) {
  await c.query(
    `UPDATE series_items si SET position = o.ord FROM unnest($2::uuid[]) WITH ORDINALITY AS o(post_id, ord)
      WHERE si.series_id = $1 AND si.post_id = o.post_id`,
    [seriesId, orderedIds],
  );
  await c.query('UPDATE series SET updated_at = now() WHERE id = $1', [seriesId]);
}

async function currentOrder(c: { query: typeof pool.query }, seriesId: string): Promise<string[]> {
  const r = await c.query('SELECT post_id FROM series_items WHERE series_id = $1 ORDER BY position FOR UPDATE', [seriesId]);
  return r.rows.map((x) => x.post_id as string);
}

// POST /series
seriesRouter.post(
  '/series',
  singleUpload('cover', 10 * MB),
  h(async (req, res) => {
    const body = parse(
      z.object({ title: titleSchema, description: descriptionSchema.optional(), category: z.enum(CATEGORY_IDS) }),
      req.body ?? {},
    );
    const viewer = me(req).id;
    const cover = req.file ? await storeMedia(req.file, ['image']) : null;
    try {
      const r = await pool.query(
        'INSERT INTO series (author_id, title, description, category, cover_key) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [viewer, filterText(body.title, 'title'), filterOptional(body.description, 'description') ?? '', body.category, cover?.key ?? null],
      );
      const [series] = await loadSeries(pool, [r.rows[0].id], viewer);
      res.status(201).json(series);
    } catch (err) {
      if (cover) deleteKeys([cover.key]);
      throw err;
    }
  }),
);

seriesRouter.get(
  '/series/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await getSeries(id, viewer);
    res.json(await seriesDetail(id, viewer));
  }),
);

seriesRouter.patch(
  '/series/:id',
  singleUpload('cover', 10 * MB),
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const series = await ownSeries(id, viewer);
    const body = parse(
      z.object({
        title: z.preprocess(emptyToUndef, titleSchema.optional()),
        description: descriptionSchema.optional(),
        category: z.preprocess(emptyToUndef, z.enum(CATEGORY_IDS).optional()),
      }),
      req.body ?? {},
    );
    const q = new Q();
    const sets: string[] = [];
    if (body.title !== undefined) sets.push(`title = ${q.p(filterText(body.title, 'title'))}`);
    if (body.description !== undefined) sets.push(`description = ${q.p(filterText(body.description, 'description'))}`);
    if (body.category !== undefined) sets.push(`category = ${q.p(body.category)}`);
    let newCover: string | null = null;
    if (req.file) {
      newCover = (await storeMedia(req.file, ['image'])).key;
      sets.push(`cover_key = ${q.p(newCover)}`);
    }
    if (!sets.length) throw badRequest('Nothing to update');
    await pool.query(`UPDATE series SET ${sets.join(', ')}, updated_at = now() WHERE id = ${q.p(id)}`, q.params);
    if (newCover) deleteKeys([series.cover_key]);
    const [updated] = await loadSeries(pool, [id], viewer);
    res.json(updated);
  }),
);

seriesRouter.delete(
  '/series/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const series = await ownSeries(id, me(req).id);
    await pool.query('DELETE FROM series WHERE id = $1', [id]);
    deleteKeys([series.cover_key]);
    res.status(204).end();
  }),
);

// Items
seriesRouter.post(
  '/series/:id/items',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(z.object({ postId: uuid, position: z.number().int().min(1).optional() }), req.body ?? {});
    const viewer = me(req).id;
    await ownSeries(id, viewer);
    const post = await pool.query('SELECT author_id FROM posts WHERE id = $1', [body.postId]);
    if (!post.rows[0]) throw notFound('Post');
    if (post.rows[0].author_id !== viewer) throw forbidden('You can only add your own posts');
    const inSeries = await pool.query('SELECT series_id FROM series_items WHERE post_id = $1', [body.postId]);
    if (inSeries.rowCount) throw conflict('This post already belongs to a series', { seriesId: inSeries.rows[0].series_id });
    await tx(async (c) => {
      const order = await currentOrder(c, id);
      await c.query('INSERT INTO series_items (series_id, post_id, position) VALUES ($1, $2, $3)', [id, body.postId, order.length + 1]);
      const pos = Math.min(body.position ?? order.length + 1, order.length + 1);
      order.splice(pos - 1, 0, body.postId);
      await writePositions(c, id, order);
    });
    res.json(await seriesDetail(id, viewer));
  }),
);

seriesRouter.delete(
  '/series/:id/items/:postId',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const postId = parse(uuid, req.params.postId);
    const viewer = me(req).id;
    await ownSeries(id, viewer);
    await tx(async (c) => {
      const del = await c.query('DELETE FROM series_items WHERE series_id = $1 AND post_id = $2 RETURNING 1', [id, postId]);
      if (!del.rowCount) throw notFound('Series item');
      await writePositions(c, id, await currentOrder(c, id));
    });
    res.json(await seriesDetail(id, viewer));
  }),
);

seriesRouter.put(
  '/series/:id/items',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { postIds } = parse(z.object({ postIds: z.array(uuid).max(500) }), req.body ?? {});
    const viewer = me(req).id;
    await ownSeries(id, viewer);
    await tx(async (c) => {
      const current = await currentOrder(c, id);
      const same = current.length === postIds.length && new Set(postIds).size === postIds.length && postIds.every((p) => current.includes(p));
      if (!same) throw badRequest('postIds must contain exactly the current items of the series', [{ path: 'postIds', message: 'Mismatch' }]);
      await writePositions(c, id, postIds);
    });
    res.json(await seriesDetail(id, viewer));
  }),
);

// Follow
seriesRouter.post(
  '/series/:id/follow',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const series = await getSeries(id, viewer);
    if (series.author_id === viewer) throw badRequest('You cannot follow your own series');
    await pool.query('INSERT INTO series_follows (series_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, viewer]);
    const c = await pool.query('SELECT follower_count FROM series WHERE id = $1', [id]);
    res.json({ isFollowing: true, followerCount: c.rows[0].follower_count });
  }),
);

seriesRouter.delete(
  '/series/:id/follow',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await getSeries(id, viewer);
    await pool.query('DELETE FROM series_follows WHERE series_id = $1 AND user_id = $2', [id, viewer]);
    const c = await pool.query('SELECT follower_count FROM series WHERE id = $1', [id]);
    res.json({ isFollowing: false, followerCount: c.rows[0].follower_count });
  }),
);

// GET /users/:id/series
seriesRouter.get(
  '/users/:id/series',
  h(async (req, res) => {
    const target = parse(uuid, req.params.id);
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    if (target !== viewer && !(await assertVisibleUser(viewer, target)).canSeeContent) {
      res.json({ items: [], nextCursor: null });
      return;
    }
    const q = new Q();
    q.and(`s.author_id = ${q.p(target)}`);
    keysetCond(q, 's.created_at', 's.id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT s.id, s.created_at::text AS _ct FROM series s ${q.whereSql()} ORDER BY s.created_at DESC, s.id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadSeries(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// GET /me/series/following
seriesRouter.get(
  '/me/series/following',
  h(async (req, res) => {
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`f.user_id = ${v}`).and(canSeeUserContentSql('s.author_id', v));
    keysetCond(q, 'f.created_at', 'f.series_id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT f.series_id AS id, f.created_at::text AS _ct FROM series_follows f JOIN series s ON s.id = f.series_id ${q.whereSql()}
        ORDER BY f.created_at DESC, f.series_id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadSeries(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);
