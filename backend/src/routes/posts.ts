import { Router } from 'express';
import { z } from 'zod';
import { pool, Q } from '../db/pool.js';
import { CATEGORY_IDS } from '../lib/categories.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import {
  decodeCursor,
  decodeKeyCursor,
  encodeCursor,
  keysetCond,
  keysetPage,
  limitSchema,
} from '../lib/pagination.js';
import { extractHashtags, extractMentions, snippet } from '../lib/text.js';
import { emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { singleUpload } from '../middleware/upload.js';
import { detectKind, MB, storeMedia, type StoredMedia } from '../media/process.js';
import { deleteKeys } from '../storage/index.js';
import { loadComments, loadPosts, notBlockedSql } from '../services/hydrate.js';
import { notify, notifyMentions } from '../services/notifications.js';

export const postsRouter = Router();

/** Engagement weight used by both the forYou ranking and the "popular" sort. */
const ENGAGEMENT = `(p.like_count + 2 * p.comment_count + 3 * p.share_count + 2 * p.bookmark_count + 0.05 * p.view_count)`;

/** Loads a post the viewer is allowed to see (exists, no block with author) or throws 404. */
export async function visiblePost(postId: string, viewerId: string) {
  const r = await pool.query(
    `SELECT p.id, p.author_id, p.type FROM posts p WHERE p.id = $1 AND ${notBlockedSql('p.author_id', '$2')}`,
    [postId, viewerId],
  );
  if (!r.rows[0]) throw notFound('Post');
  return r.rows[0] as { id: string; author_id: string; type: 'video' | 'post' };
}

const feedQuery = z.object({
  tab: z.preprocess(emptyToUndef, z.enum(['forYou', 'following']).default('forYou')),
  type: z.preprocess(emptyToUndef, z.enum(['video', 'post']).optional()),
  sort: z.preprocess(emptyToUndef, z.enum(['latest', 'popular']).optional()),
  category: z.preprocess(emptyToUndef, z.enum(CATEGORY_IDS).optional()),
  cursor: z.string().optional(),
  limit: limitSchema,
});

// GET /feed
postsRouter.get(
  '/feed',
  h(async (req, res) => {
    const query = parse(feedQuery, req.query);
    const viewer = me(req);
    const q = new Q();
    const v = q.p(viewer.id);
    q.and(notBlockedSql('p.author_id', v));
    if (query.tab === 'following') {
      q.and(`p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ${v})`);
    }
    if (query.type) q.and(`p.type = ${q.p(query.type)}`);
    if (query.category) q.and(`p.category = ${q.p(query.category)}`);

    const sort = query.sort ?? (query.tab === 'following' ? 'latest' : 'ranked');

    if (sort === 'latest') {
      keysetCond(q, 'p.created_at', 'p.id', decodeKeyCursor(query.cursor));
      const { rows } = await pool.query(
        `SELECT p.id, p.created_at::text AS _ct FROM posts p ${q.whereSql()}
          ORDER BY p.created_at DESC, p.id DESC LIMIT ${query.limit + 1}`,
        q.params,
      );
      const page = keysetPage(rows, query.limit);
      res.json({ items: await loadPosts(pool, page.rows.map((r) => r.id), viewer.id), nextCursor: page.nextCursor });
      return;
    }

    // Ranked / popular lists use an offset cursor that also pins the reference time,
    // so the order stays stable while the user scrolls.
    const c = decodeCursor<{ o: number; ts: string }>(query.cursor);
    const offset = c?.o ?? 0;
    const refTime = c?.ts ?? new Date().toISOString();
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_000 || Number.isNaN(Date.parse(refTime))) {
      throw badRequest('Invalid cursor');
    }
    const ref = q.p(refTime);
    q.and(`p.created_at <= ${ref}::timestamptz`);
    let orderBy: string;
    if (sort === 'popular') {
      orderBy = `${ENGAGEMENT} DESC, p.created_at DESC, p.id DESC`;
    } else {
      // forYou: engagement with time decay (HN-style gravity), boosted for followed authors and same university.
      const uni = q.p(viewer.university);
      orderBy = `(
          (1 + ${ENGAGEMENT})
          * CASE WHEN EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${v} AND f.following_id = p.author_id) THEN 1.5 ELSE 1 END
          * CASE WHEN ${uni}::text IS NOT NULL AND lower(au.university) = lower(${uni}::text) THEN 1.2 ELSE 1 END
        ) / power(GREATEST(extract(epoch FROM (${ref}::timestamptz - p.created_at)), 0) / 3600.0 + 2, 1.5) DESC,
        p.created_at DESC, p.id DESC`;
    }
    const { rows } = await pool.query(
      `SELECT p.id FROM posts p JOIN users au ON au.id = p.author_id ${q.whereSql()}
        ORDER BY ${orderBy} LIMIT ${query.limit + 1} OFFSET ${offset}`,
      q.params,
    );
    const hasMore = rows.length > query.limit;
    const ids = rows.slice(0, query.limit).map((r) => r.id);
    res.json({
      items: await loadPosts(pool, ids, viewer.id),
      nextCursor: hasMore ? encodeCursor({ o: offset + query.limit, ts: refTime }) : null,
    });
  }),
);

const createPostSchema = z.object({
  type: z.enum(['video', 'post']),
  text: z.preprocess((v) => (v === undefined || v === null ? '' : v), z.string().trim().max(2200)),
  category: z.preprocess(emptyToUndef, z.enum(CATEGORY_IDS).default('other')),
  communityId: z.preprocess(emptyToUndef, uuid.optional()),
});

// POST /posts
postsRouter.post(
  '/posts',
  singleUpload('media', 100 * MB),
  h(async (req, res) => {
    const body = parse(createPostSchema, req.body ?? {});
    const viewer = me(req).id;
    const file = req.file;
    if (body.type === 'video') {
      if (!file) throw badRequest('A video file is required for type=video', [{ path: 'media', message: 'Required' }]);
      if (detectKind(file) !== 'video') throw badRequest('type=video requires an mp4/mov video file', [{ path: 'media', message: 'Must be a video' }]);
    } else if (!file && !body.text) {
      throw badRequest('Text or media is required', [{ path: 'text', message: 'Required' }]);
    }
    if (body.communityId) {
      const m = await pool.query(
        `SELECT c.id, EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = $2) AS member
           FROM communities c WHERE c.id = $1`,
        [body.communityId, viewer],
      );
      if (!m.rows[0]) throw notFound('Community');
      if (!m.rows[0].member) throw forbidden('Join the community to post in it');
    }

    let media: StoredMedia | null = null;
    if (file) media = await storeMedia(file);
    const hashtags = extractHashtags(body.text);
    let postId: string;
    try {
      const r = await pool.query(
        `INSERT INTO posts (author_id, community_id, type, text, category, hashtags, media_kind, media_key, thumbnail_key, duration_sec, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          viewer,
          body.communityId ?? null,
          body.type,
          body.text,
          body.category,
          hashtags,
          media?.kind ?? null,
          media?.key ?? null,
          media?.thumbnailKey ?? null,
          media?.durationSec ?? null,
          media?.width ?? null,
          media?.height ?? null,
        ],
      );
      postId = r.rows[0].id;
    } catch (err) {
      if (media) deleteKeys([media.key, media.thumbnailKey]);
      throw err;
    }
    await notifyMentions(
      extractMentions(body.text),
      viewer,
      { postId },
      body.type === 'video' ? 'mentioned you in a video' : 'mentioned you in a post',
    );
    const [post] = await loadPosts(pool, [postId], viewer);
    res.status(201).json(post);
  }),
);

// GET /posts/:id
postsRouter.get(
  '/posts/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await visiblePost(id, viewer);
    const [post] = await loadPosts(pool, [id], viewer);
    if (!post) throw notFound('Post');
    res.json(post);
  }),
);

// DELETE /posts/:id
postsRouter.delete(
  '/posts/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const r = await pool.query('SELECT author_id, media_key, thumbnail_key FROM posts WHERE id = $1', [id]);
    const row = r.rows[0];
    if (!row) throw notFound('Post');
    if (row.author_id !== viewer) throw forbidden('Only the author can delete this post');
    await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    await pool.query(`DELETE FROM reports WHERE target_type = 'post' AND target_id = $1`, [id]);
    deleteKeys([row.media_key, row.thumbnail_key]);
    res.status(204).end();
  }),
);

// Like
postsRouter.post(
  '/posts/:id/like',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer);
    const ins = await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1', [id, viewer]);
    if (ins.rowCount) {
      await notify({
        userId: post.author_id,
        actorId: viewer,
        type: 'like',
        postId: id,
        text: post.type === 'video' ? 'liked your video' : 'liked your post',
      });
    }
    const c = await pool.query('SELECT like_count FROM posts WHERE id = $1', [id]);
    res.json({ liked: true, likeCount: c.rows[0].like_count });
  }),
);

postsRouter.delete(
  '/posts/:id/like',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await visiblePost(id, viewer);
    const del = await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2 RETURNING 1', [id, viewer]);
    if (del.rowCount) {
      await pool.query(`DELETE FROM notifications WHERE actor_id = $1 AND post_id = $2 AND type = 'like'`, [viewer, id]);
    }
    const c = await pool.query('SELECT like_count FROM posts WHERE id = $1', [id]);
    res.json({ liked: false, likeCount: c.rows[0].like_count });
  }),
);

// Bookmark
postsRouter.post(
  '/posts/:id/bookmark',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await visiblePost(id, viewer);
    await pool.query('INSERT INTO bookmarks (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, viewer]);
    const c = await pool.query('SELECT bookmark_count FROM posts WHERE id = $1', [id]);
    res.json({ bookmarked: true, bookmarkCount: c.rows[0].bookmark_count });
  }),
);

postsRouter.delete(
  '/posts/:id/bookmark',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await visiblePost(id, viewer);
    await pool.query('DELETE FROM bookmarks WHERE post_id = $1 AND user_id = $2', [id, viewer]);
    const c = await pool.query('SELECT bookmark_count FROM posts WHERE id = $1', [id]);
    res.json({ bookmarked: false, bookmarkCount: c.rows[0].bookmark_count });
  }),
);

// Share / view
postsRouter.post(
  '/posts/:id/share',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    await visiblePost(id, me(req).id);
    const r = await pool.query('UPDATE posts SET share_count = share_count + 1 WHERE id = $1 RETURNING share_count', [id]);
    res.json({ shareCount: r.rows[0].share_count });
  }),
);

postsRouter.post(
  '/posts/:id/view',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await visiblePost(id, viewer);
    await pool.query('INSERT INTO post_views (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, viewer]);
    res.status(204).end();
  }),
);

// Comments
postsRouter.get(
  '/posts/:id/comments',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    await visiblePost(id, viewer);
    const q = new Q();
    const v = q.p(viewer);
    q.and(`c.post_id = ${q.p(id)}`).and(notBlockedSql('c.author_id', v));
    keysetCond(q, 'c.created_at', 'c.id', decodeKeyCursor(query.cursor), '>');
    const { rows } = await pool.query(
      `SELECT c.id, c.created_at::text AS _ct FROM comments c ${q.whereSql()}
        ORDER BY c.created_at ASC, c.id ASC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadComments(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

postsRouter.post(
  '/posts/:id/comments',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { text } = parse(z.object({ text: z.string().trim().min(1, 'Comment cannot be empty').max(1000) }), req.body ?? {});
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer);
    const r = await pool.query('INSERT INTO comments (post_id, author_id, text) VALUES ($1, $2, $3) RETURNING id', [id, viewer, text]);
    const commentId = r.rows[0].id as string;
    await notify({
      userId: post.author_id,
      actorId: viewer,
      type: 'comment',
      postId: id,
      commentId,
      text: `commented: ${snippet(text)}`,
    });
    await notifyMentions(extractMentions(text), viewer, { postId: id, commentId }, 'mentioned you in a comment', [post.author_id]);
    const [comment] = await loadComments(pool, [commentId], viewer);
    res.status(201).json(comment);
  }),
);

postsRouter.delete(
  '/comments/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const r = await pool.query(
      'SELECT c.author_id, p.author_id AS post_author_id FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = $1',
      [id],
    );
    const row = r.rows[0];
    if (!row) throw notFound('Comment');
    if (row.author_id !== viewer && row.post_author_id !== viewer) throw forbidden('You cannot delete this comment');
    await pool.query('DELETE FROM comments WHERE id = $1', [id]);
    res.status(204).end();
  }),
);

// GET /me/bookmarks
postsRouter.get(
  '/me/bookmarks',
  h(async (req, res) => {
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`b.user_id = ${v}`).and(notBlockedSql('p.author_id', v));
    keysetCond(q, 'b.created_at', 'b.post_id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT b.post_id AS id, b.created_at::text AS _ct FROM bookmarks b JOIN posts p ON p.id = b.post_id ${q.whereSql()}
        ORDER BY b.created_at DESC, b.post_id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadPosts(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);
