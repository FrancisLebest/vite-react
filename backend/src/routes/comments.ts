import { Router } from 'express';
import { z } from 'zod';
import { pool, Q } from '../db/pool.js';
import { filterText } from '../lib/contentFilter.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { decodeKeyCursor, keysetCond, keysetPage, limitSchema } from '../lib/pagination.js';
import { extractMentions, snippet } from '../lib/text.js';
import { emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { loadComments, notBlockedSql } from '../services/hydrate.js';
import { notify, notifyMentions } from '../services/notifications.js';
import { visiblePost } from './posts.js';

export const commentsRouter = Router();

/** Loads a comment whose post is visible to the viewer, or 404. */
async function visibleComment(commentId: string, viewerId: string) {
  const r = await pool.query(
    `SELECT c.id, c.post_id, c.author_id, c.parent_id, c.text FROM comments c WHERE c.id = $1 AND ${notBlockedSql('c.author_id', '$2')}`,
    [commentId, viewerId],
  );
  const row = r.rows[0];
  if (!row) throw notFound('Comment');
  const post = await visiblePost(row.post_id, viewerId);
  return { ...row, post } as { id: string; post_id: string; author_id: string; parent_id: string | null; text: string; post: Awaited<ReturnType<typeof visiblePost>> };
}

// GET /posts/:id/comments — top-level only, pinned first then oldest first
commentsRouter.get(
  '/posts/:id/comments',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer);
    const q = new Q();
    const v = q.p(viewer);
    q.and(`c.post_id = ${q.p(id)}`).and('c.parent_id IS NULL').and(notBlockedSql('c.author_id', v));
    if (post.pinned_comment_id) q.and(`c.id <> ${q.p(post.pinned_comment_id)}`);
    keysetCond(q, 'c.created_at', 'c.id', decodeKeyCursor(query.cursor), '>');
    const { rows } = await pool.query(
      `SELECT c.id, c.created_at::text AS _ct FROM comments c ${q.whereSql()}
        ORDER BY c.created_at ASC, c.id ASC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    const ids = page.rows.map((r) => r.id);
    if (!query.cursor && post.pinned_comment_id) ids.unshift(post.pinned_comment_id);
    res.json({ items: await loadComments(pool, ids, viewer), nextCursor: page.nextCursor });
  }),
);

// GET /comments/:id/replies — oldest first
commentsRouter.get(
  '/comments/:id/replies',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    await visibleComment(id, viewer);
    const q = new Q();
    const v = q.p(viewer);
    q.and(`c.parent_id = ${q.p(id)}`).and(notBlockedSql('c.author_id', v));
    keysetCond(q, 'c.created_at', 'c.id', decodeKeyCursor(query.cursor), '>');
    const { rows } = await pool.query(
      `SELECT c.id, c.created_at::text AS _ct FROM comments c ${q.whereSql()} ORDER BY c.created_at ASC, c.id ASC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadComments(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// POST /posts/:id/comments
commentsRouter.post(
  '/posts/:id/comments',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(
      z.object({ text: z.string().trim().min(1, 'Comment cannot be empty').max(1000), parentId: z.preprocess(emptyToUndef, uuid.optional()) }),
      req.body ?? {},
    );
    const text = filterText(body.text, 'text');
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer, { readyOnly: true });
    let parent: { id: string; author_id: string } | null = null;
    if (body.parentId) {
      const pr = await pool.query('SELECT id, author_id, parent_id, post_id FROM comments WHERE id = $1', [body.parentId]);
      const row = pr.rows[0];
      if (!row || row.post_id !== id) throw badRequest('Parent comment not found on this post', [{ path: 'parentId', message: 'Invalid' }]);
      if (row.parent_id) {
        // One level only: attach replies-to-replies to the top-level comment, but notify the replied-to author.
        const root = (await pool.query('SELECT id, author_id FROM comments WHERE id = $1', [row.parent_id])).rows[0];
        parent = { id: root.id, author_id: row.author_id };
      } else {
        parent = { id: row.id, author_id: row.author_id };
      }
    }
    const r = await pool.query('INSERT INTO comments (post_id, author_id, text, parent_id) VALUES ($1, $2, $3, $4) RETURNING id', [
      id,
      viewer,
      text,
      parent?.id ?? null,
    ]);
    const commentId = r.rows[0].id as string;
    await notify({ userId: post.author_id, actorId: viewer, type: 'comment', postId: id, commentId, text: `commented: ${snippet(text)}` });
    const notified = [post.author_id];
    if (parent && parent.author_id !== post.author_id) {
      await notify({ userId: parent.author_id, actorId: viewer, type: 'reply', postId: id, commentId, text: `replied to your comment: ${snippet(text)}` });
      notified.push(parent.author_id);
    }
    await notifyMentions(extractMentions(text), viewer, { postId: id, commentId }, 'mentioned you in a comment', notified);
    const [comment] = await loadComments(pool, [commentId], viewer);
    res.status(201).json(comment);
  }),
);

// DELETE /comments/:id — comment author or post author
commentsRouter.delete(
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

// Comment likes
commentsRouter.post(
  '/comments/:id/like',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const c = await visibleComment(id, viewer);
    const ins = await pool.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1', [id, viewer]);
    if (ins.rowCount) {
      await notify({ userId: c.author_id, actorId: viewer, type: 'comment_like', postId: c.post_id, commentId: id, text: `liked your comment: ${snippet(c.text, 60)}` });
    }
    const n = await pool.query('SELECT like_count FROM comments WHERE id = $1', [id]);
    res.json({ liked: true, likeCount: n.rows[0].like_count });
  }),
);

commentsRouter.delete(
  '/comments/:id/like',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await visibleComment(id, viewer);
    const del = await pool.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2 RETURNING 1', [id, viewer]);
    if (del.rowCount) await pool.query(`DELETE FROM notifications WHERE actor_id = $1 AND comment_id = $2 AND type = 'comment_like'`, [viewer, id]);
    const n = await pool.query('SELECT like_count FROM comments WHERE id = $1', [id]);
    res.json({ liked: false, likeCount: n.rows[0].like_count });
  }),
);

// Pin (post author, top-level comments)
commentsRouter.post(
  '/comments/:id/pin',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const c = await visibleComment(id, viewer);
    if (c.post.author_id !== viewer) throw forbidden('Only the post author can pin comments');
    if (c.parent_id) throw badRequest('Only top-level comments can be pinned');
    await pool.query('UPDATE posts SET pinned_comment_id = $2 WHERE id = $1', [c.post_id, id]);
    const [comment] = await loadComments(pool, [id], viewer);
    res.json(comment);
  }),
);

commentsRouter.delete(
  '/comments/:id/pin',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const c = await visibleComment(id, viewer);
    if (c.post.author_id !== viewer) throw forbidden('Only the post author can unpin comments');
    await pool.query('UPDATE posts SET pinned_comment_id = NULL WHERE id = $1 AND pinned_comment_id = $2', [c.post_id, id]);
    res.status(204).end();
  }),
);
