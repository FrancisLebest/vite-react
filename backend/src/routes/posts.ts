import { Router } from 'express';
import { z } from 'zod';
import { pool, Q, tx } from '../db/pool.js';
import { config } from '../config.js';
import { CATEGORY_IDS } from '../lib/categories.js';
import { filterText } from '../lib/contentFilter.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import {
  decodeCursor,
  decodeKeyCursor,
  decodeOffsetCursor,
  encodeCursor,
  keysetCond,
  keysetPage,
  limitSchema,
  offsetPage,
} from '../lib/pagination.js';
import { extractHashtags, extractMentions } from '../lib/text.js';
import { emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { singleUpload } from '../middleware/upload.js';
import { detectKind, MB, storeMedia, storeVideoSource, type StoredMedia } from '../media/process.js';
import { enqueueVideo } from '../media/queue.js';
import { deleteKeys } from '../storage/index.js';
import { loadPolls, loadPosts, loadUserSummaryMap, postVisibleSql, type Post } from '../services/hydrate.js';
import { notify, notifyMentions } from '../services/notifications.js';

export const postsRouter = Router();

/** Engagement weight used by both the forYou ranking and the "popular" sort. */
const ENGAGEMENT = `(p.like_count + 2 * p.comment_count + 3 * p.share_count + 2 * p.bookmark_count + 2 * p.repost_count + 0.05 * p.view_count)`;

type VisiblePost = { id: string; author_id: string; type: 'video' | 'post'; status: string; pinned_comment_id: string | null };

/** Loads a post the viewer is allowed to see (visibility rules incl. privacy/blocks/status) or throws 404. */
export async function visiblePost(postId: string, viewerId: string, opts: { readyOnly?: boolean } = {}): Promise<VisiblePost> {
  const r = await pool.query(
    `SELECT p.id, p.author_id, p.type, p.status, p.pinned_comment_id FROM posts p WHERE p.id = $1 AND ${postVisibleSql('p', '$2')}`,
    [postId, viewerId],
  );
  const row = r.rows[0] as VisiblePost | undefined;
  if (!row || (opts.readyOnly && row.status !== 'ready')) throw notFound('Post');
  return row;
}

/** Increments the share counter + daily stats. */
export async function recordShare(postId: string): Promise<number> {
  return tx(async (c) => {
    const r = await c.query('UPDATE posts SET share_count = share_count + 1 WHERE id = $1 RETURNING share_count', [postId]);
    await c.query(
      `INSERT INTO post_stats_daily (post_id, day, shares) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
       ON CONFLICT (post_id, day) DO UPDATE SET shares = post_stats_daily.shares + 1`,
      [postId],
    );
    return r.rows[0].share_count as number;
  });
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
    const filters: string[] = [`p.status = 'ready'`, postVisibleSql('p', v)];
    if (query.type) filters.push(`p.type = ${q.p(query.type)}`);
    if (query.category) filters.push(`p.category = ${q.p(query.category)}`);
    const followed = `(SELECT following_id FROM follows WHERE follower_id = ${v})`;
    const sort = query.sort ?? (query.tab === 'following' ? 'latest' : 'ranked');

    if (query.tab === 'following' && sort === 'latest') {
      // Posts by followed users + posts they reposted (one entry per post, latest activity wins).
      const cursor = decodeKeyCursor(query.cursor);
      const f = filters.join(' AND ');
      const cursorSql = cursor ? `WHERE (y.ts, y.id) < (${q.p(cursor.t)}::timestamptz, ${q.p(cursor.id)}::uuid)` : '';
      const { rows } = await pool.query(
        `SELECT y.id, y.ts::text AS _ct, y.reposter_id FROM (
           SELECT DISTINCT ON (x.id) x.id, x.ts, x.reposter_id FROM (
             SELECT p.id, p.created_at AS ts, NULL::uuid AS reposter_id FROM posts p
              WHERE p.author_id IN ${followed} AND ${f}
             UNION ALL
             SELECT p.id, r.created_at, r.user_id FROM reposts r JOIN posts p ON p.id = r.post_id
              WHERE r.user_id IN ${followed} AND p.author_id <> ${v} AND ${f}
           ) x ORDER BY x.id, x.ts DESC
         ) y ${cursorSql}
         ORDER BY y.ts DESC, y.id DESC LIMIT ${query.limit + 1}`,
        q.params,
      );
      const page = keysetPage(rows, query.limit);
      const posts = await loadPosts(pool, page.rows.map((r) => r.id), viewer.id);
      const reposters = await loadUserSummaryMap(pool, page.rows.map((r) => r.reposter_id).filter(Boolean), viewer.id);
      const byId = new Map(page.rows.map((r) => [r.id, r.reposter_id as string | null]));
      for (const p of posts) {
        const rid = byId.get(p.id);
        p.repostedBy = rid ? reposters.get(rid) ?? null : null;
      }
      res.json({ items: posts, nextCursor: page.nextCursor });
      return;
    }

    for (const f of filters) q.and(f);
    if (query.tab === 'following') q.and(`p.author_id IN ${followed}`);

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
      // forYou: unwatched first; then engagement with time decay (HN-style gravity), boosted for
      // followed creators, the viewer's interests and university.
      const uni = q.p(viewer.university);
      const interests = q.p(viewer.interests);
      orderBy = `(p.type = 'video' AND EXISTS (SELECT 1 FROM post_views w WHERE w.post_id = p.id AND w.user_id = ${v} AND w.created_at <= ${ref}::timestamptz)) ASC,
        (
          (1 + ${ENGAGEMENT})
          * CASE WHEN EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${v} AND f.following_id = p.author_id) THEN 1.5 ELSE 1 END
          * CASE WHEN p.category = ANY(${interests}::text[]) THEN 1.4 ELSE 1 END
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

const pollSchema = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    if (!v.trim()) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return '__invalid__';
    }
  },
  z
    .object({
      question: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
      options: z.array(z.string().trim().min(1).max(100)).min(2).max(4),
      correctOptionIndex: z.number().int().min(0).max(3).optional(),
    })
    .strict()
    .refine((p) => p.correctOptionIndex === undefined || p.correctOptionIndex < p.options.length, {
      message: 'correctOptionIndex out of range',
      path: ['correctOptionIndex'],
    })
    .optional(),
);

const createPostSchema = z.object({
  type: z.enum(['video', 'post']),
  text: z.preprocess((v) => (v === undefined || v === null ? '' : v), z.string().trim().max(2200)),
  category: z.preprocess(emptyToUndef, z.enum(CATEGORY_IDS).default('other')),
  communityId: z.preprocess(emptyToUndef, uuid.optional()),
  poll: pollSchema,
});

// POST /posts
postsRouter.post(
  '/posts',
  singleUpload('media', 100 * MB),
  h(async (req, res) => {
    const body = parse(createPostSchema, req.body ?? {});
    const text = filterText(body.text, 'text');
    const viewer = me(req).id;
    const file = req.file;
    if (body.type === 'video') {
      if (!file) throw badRequest('A video file is required for type=video', [{ path: 'media', message: 'Required' }]);
      if (detectKind(file) !== 'video') throw badRequest('type=video requires an mp4/mov video file', [{ path: 'media', message: 'Must be a video' }]);
      if (body.poll) throw badRequest('Polls can only be attached to type=post', [{ path: 'poll', message: 'Not allowed for videos' }]);
    } else if (!file && !text && !body.poll) {
      throw badRequest('Text or media is required', [{ path: 'text', message: 'Required' }]);
    }
    if (body.poll) body.poll.options = body.poll.options.map((o, i) => filterText(o, `poll.options.${i}`));
    if (body.communityId) {
      const m = await pool.query(
        `SELECT c.id, EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = $2) AS member
           FROM communities c WHERE c.id = $1`,
        [body.communityId, viewer],
      );
      if (!m.rows[0]) throw notFound('Community');
      if (!m.rows[0].member) throw forbidden('Join the community to post in it');
    }

    const asyncVideo = !!file && config.VIDEO_TRANSCODE && detectKind(file) === 'video';
    let media: StoredMedia | null = null;
    if (file) media = asyncVideo ? await storeVideoSource(file) : await storeMedia(file);
    const hashtags = extractHashtags(text);
    let postId: string;
    try {
      postId = await tx(async (c) => {
        const r = await c.query(
          `INSERT INTO posts (author_id, community_id, type, text, category, hashtags, media_kind, media_key, thumbnail_key,
                              duration_sec, width, height, status, source_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [
            viewer,
            body.communityId ?? null,
            body.type,
            text,
            body.category,
            hashtags,
            media?.kind ?? null,
            media?.key ?? null,
            media?.thumbnailKey ?? null,
            media?.durationSec ?? null,
            media?.width ?? null,
            media?.height ?? null,
            asyncVideo ? 'processing' : 'ready',
            asyncVideo ? media!.key : null,
          ],
        );
        const id = r.rows[0].id as string;
        if (body.poll) {
          const poll = body.poll;
          const pr = await c.query(
            `INSERT INTO polls (post_id, kind, question) VALUES ($1, $2, $3) RETURNING id`,
            [id, poll.correctOptionIndex !== undefined ? 'quiz' : 'poll', poll.question ?? null],
          );
          const pollId = pr.rows[0].id as string;
          const opts = await c.query(
            `INSERT INTO poll_options (poll_id, position, text) SELECT $1, o.ord, o.text FROM unnest($2::text[]) WITH ORDINALITY AS o(text, ord) RETURNING id, position`,
            [pollId, poll.options],
          );
          if (poll.correctOptionIndex !== undefined) {
            const correct = opts.rows.find((o) => Number(o.position) === poll.correctOptionIndex! + 1);
            await c.query('UPDATE polls SET correct_option_id = $2 WHERE id = $1', [pollId, correct.id]);
          }
        }
        return id;
      });
    } catch (err) {
      if (media) deleteKeys([media.key, media.thumbnailKey]);
      throw err;
    }
    await notifyMentions(
      extractMentions(text),
      viewer,
      { postId },
      body.type === 'video' ? 'mentioned you in a video' : 'mentioned you in a post',
    );
    const [post] = await loadPosts(pool, [postId], viewer);
    if (asyncVideo) await enqueueVideo(postId);
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

// PATCH /posts/:id — edit text / category (author only)
postsRouter.patch(
  '/posts/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(
      z.object({ text: z.string().trim().max(2200).optional(), category: z.enum(CATEGORY_IDS).optional() }).strict(),
      req.body ?? {},
    );
    if (body.text === undefined && body.category === undefined) throw badRequest('Nothing to update');
    const viewer = me(req).id;
    const r = await pool.query(
      'SELECT author_id, media_key, (SELECT 1 FROM polls WHERE post_id = p.id) AS has_poll FROM posts p WHERE id = $1',
      [id],
    );
    const row = r.rows[0];
    if (!row) throw notFound('Post');
    if (row.author_id !== viewer) throw forbidden('Only the author can edit this post');
    const q = new Q();
    const sets = ['edited_at = now()'];
    if (body.text !== undefined) {
      const text = filterText(body.text, 'text');
      if (!text && !row.media_key && !row.has_poll) throw badRequest('Text cannot be empty', [{ path: 'text', message: 'Required' }]);
      sets.push(`text = ${q.p(text)}`, `hashtags = ${q.p(extractHashtags(text))}`);
    }
    if (body.category) sets.push(`category = ${q.p(body.category)}`);
    await pool.query(`UPDATE posts SET ${sets.join(', ')} WHERE id = ${q.p(id)}`, q.params);
    const [post] = await loadPosts(pool, [id], viewer);
    res.json(post);
  }),
);

// DELETE /posts/:id
postsRouter.delete(
  '/posts/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const r = await pool.query('SELECT author_id, media_key, thumbnail_key, source_key FROM posts WHERE id = $1', [id]);
    const row = r.rows[0];
    if (!row) throw notFound('Post');
    if (row.author_id !== viewer) throw forbidden('Only the author can delete this post');
    await deletePost(id);
    res.status(204).end();
  }),
);

/** Deletes a post and its media. */
export async function deletePost(id: string): Promise<void> {
  const r = await pool.query('DELETE FROM posts WHERE id = $1 RETURNING media_key, thumbnail_key, source_key', [id]);
  // Open reports about it are closed (kept for the moderation history).
  await pool.query(
    `UPDATE reports SET status = 'reviewed', resolution = 'content_removed', resolved_at = now() WHERE target_type = 'post' AND target_id = $1 AND status = 'open'`,
    [id],
  );
  const row = r.rows[0];
  if (row) deleteKeys([row.media_key, row.thumbnail_key, row.source_key]);
}

// Like
postsRouter.post(
  '/posts/:id/like',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer, { readyOnly: true });
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
    await visiblePost(id, viewer, { readyOnly: true });
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
    await visiblePost(id, me(req).id, { readyOnly: true });
    res.json({ shareCount: await recordShare(id) });
  }),
);

postsRouter.post(
  '/posts/:id/view',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer);
    if (post.status === 'ready') {
      await tx(async (c) => {
        const prev = await c.query(
          `SELECT (last_viewed_at AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date AS new_day
             FROM post_views WHERE post_id = $1 AND user_id = $2 FOR UPDATE`,
          [id, viewer],
        );
        let countDay = true;
        if (!prev.rows[0]) {
          await c.query('INSERT INTO post_views (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, viewer]);
        } else {
          countDay = prev.rows[0].new_day;
          await c.query('UPDATE post_views SET last_viewed_at = now(), in_history = true WHERE post_id = $1 AND user_id = $2', [id, viewer]);
        }
        if (countDay) {
          await c.query(
            `INSERT INTO post_stats_daily (post_id, day, views) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
             ON CONFLICT (post_id, day) DO UPDATE SET views = post_stats_daily.views + 1`,
            [id],
          );
        }
      });
    }
    res.status(204).end();
  }),
);

// Repost
postsRouter.post(
  '/posts/:id/repost',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer, { readyOnly: true });
    if (post.author_id === viewer) throw badRequest('You cannot repost your own post');
    const ins = await pool.query('INSERT INTO reposts (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1', [id, viewer]);
    if (ins.rowCount) {
      await notify({ userId: post.author_id, actorId: viewer, type: 'repost', postId: id, text: post.type === 'video' ? 'reposted your video' : 'reposted your post' });
    }
    const c = await pool.query('SELECT repost_count FROM posts WHERE id = $1', [id]);
    res.json({ reposted: true, repostCount: c.rows[0].repost_count });
  }),
);

postsRouter.delete(
  '/posts/:id/repost',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await visiblePost(id, viewer);
    const del = await pool.query('DELETE FROM reposts WHERE post_id = $1 AND user_id = $2 RETURNING 1', [id, viewer]);
    if (del.rowCount) await pool.query(`DELETE FROM notifications WHERE actor_id = $1 AND post_id = $2 AND type = 'repost'`, [viewer, id]);
    const c = await pool.query('SELECT repost_count FROM posts WHERE id = $1', [id]);
    res.json({ reposted: false, repostCount: c.rows[0].repost_count });
  }),
);

// Profile pins (max 3)
const MAX_PINS = 3;
postsRouter.post(
  '/posts/:id/pin',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const r = await pool.query('SELECT author_id, status FROM posts WHERE id = $1', [id]);
    const row = r.rows[0];
    if (!row) throw notFound('Post');
    if (row.author_id !== viewer) throw forbidden('You can only pin your own posts');
    if (row.status !== 'ready') throw badRequest('Only published posts can be pinned');
    const upd = await pool.query(
      `UPDATE users SET pinned_post_ids = CASE WHEN $2 = ANY(pinned_post_ids) THEN pinned_post_ids ELSE array_append(pinned_post_ids, $2) END
        WHERE id = $1 AND ($2 = ANY(pinned_post_ids) OR cardinality(pinned_post_ids) < ${MAX_PINS}) RETURNING pinned_post_ids`,
      [viewer, id],
    );
    if (!upd.rowCount) throw conflict(`You can pin at most ${MAX_PINS} posts`);
    res.json({ isPinned: true, pinnedPostIds: upd.rows[0].pinned_post_ids });
  }),
);

postsRouter.delete(
  '/posts/:id/pin',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const upd = await pool.query(
      'UPDATE users SET pinned_post_ids = array_remove(pinned_post_ids, $2) WHERE id = $1 RETURNING pinned_post_ids',
      [me(req).id, id],
    );
    res.json({ isPinned: false, pinnedPostIds: upd.rows[0].pinned_post_ids });
  }),
);

// Poll vote
postsRouter.post(
  '/posts/:id/poll/vote',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { optionId } = parse(z.object({ optionId: uuid }), req.body ?? {});
    const viewer = me(req).id;
    const post = await visiblePost(id, viewer, { readyOnly: true });
    const poll = (await pool.query('SELECT id FROM polls WHERE post_id = $1', [id])).rows[0];
    if (!poll) throw notFound('Poll');
    if (post.author_id === viewer) throw forbidden('You cannot vote on your own poll');
    const opt = await pool.query('SELECT 1 FROM poll_options WHERE id = $1 AND poll_id = $2', [optionId, poll.id]);
    if (!opt.rowCount) throw badRequest('Unknown option', [{ path: 'optionId', message: 'Not an option of this poll' }]);
    const ins = await pool.query(
      'INSERT INTO poll_votes (poll_id, user_id, option_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING 1',
      [poll.id, viewer, optionId],
    );
    if (!ins.rowCount) throw conflict('You already voted');
    res.json((await loadPolls(pool, [id], viewer)).get(id));
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
    q.and(`b.user_id = ${v}`).and(postVisibleSql('p', v));
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

// Watch history
postsRouter.get(
  '/me/history',
  h(async (req, res) => {
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`pv.user_id = ${v}`).and('pv.in_history').and(postVisibleSql('p', v));
    keysetCond(q, 'pv.last_viewed_at', 'pv.post_id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT pv.post_id AS id, pv.last_viewed_at, pv.last_viewed_at::text AS _ct FROM post_views pv JOIN posts p ON p.id = pv.post_id
        ${q.whereSql()} ORDER BY pv.last_viewed_at DESC, pv.post_id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    const posts = new Map((await loadPosts(pool, page.rows.map((r) => r.id), viewer)).map((p) => [p.id, p]));
    const items = page.rows
      .filter((r) => posts.has(r.id))
      .map((r) => ({ viewedAt: new Date(r.last_viewed_at).toISOString(), post: posts.get(r.id) as Post }));
    res.json({ items, nextCursor: page.nextCursor });
  }),
);

postsRouter.delete(
  '/me/history',
  h(async (req, res) => {
    await pool.query('UPDATE post_views SET in_history = false WHERE user_id = $1 AND in_history', [me(req).id]);
    res.status(204).end();
  }),
);

postsRouter.delete(
  '/me/history/:postId',
  h(async (req, res) => {
    const postId = parse(uuid, req.params.postId);
    await pool.query('UPDATE post_views SET in_history = false WHERE user_id = $1 AND post_id = $2', [me(req).id, postId]);
    res.status(204).end();
  }),
);

// GET /hashtags/:tag
postsRouter.get(
  '/hashtags/:tag',
  h(async (req, res) => {
    const tag = parse(
      z.string().transform((t) => t.replace(/^#/, '').toLowerCase()).pipe(z.string().regex(/^[\p{L}\p{N}_]{1,50}$/u, 'Invalid hashtag')),
      req.params.tag,
    );
    const query = parse(
      z.object({ sort: z.preprocess(emptyToUndef, z.enum(['recent', 'popular']).default('recent')), cursor: z.string().optional(), limit: limitSchema }),
      req.query,
    );
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`${q.p(tag)}::text = ANY(p.hashtags)`).and(`p.status = 'ready'`).and(postVisibleSql('p', v));
    const count = await pool.query(`SELECT count(*)::int AS n FROM posts p ${q.whereSql()}`, q.params);
    let ids: string[];
    let nextCursor: string | null;
    if (query.sort === 'recent') {
      keysetCond(q, 'p.created_at', 'p.id', decodeKeyCursor(query.cursor));
      const { rows } = await pool.query(
        `SELECT p.id, p.created_at::text AS _ct FROM posts p ${q.whereSql()} ORDER BY p.created_at DESC, p.id DESC LIMIT ${query.limit + 1}`,
        q.params,
      );
      const page = keysetPage(rows, query.limit);
      ids = page.rows.map((r) => r.id);
      nextCursor = page.nextCursor;
    } else {
      const offset = decodeOffsetCursor(query.cursor);
      const { rows } = await pool.query(
        `SELECT p.id FROM posts p ${q.whereSql()} ORDER BY ${ENGAGEMENT} DESC, p.created_at DESC, p.id LIMIT ${query.limit + 1} OFFSET ${offset}`,
        q.params,
      );
      const page = offsetPage(rows, query.limit, offset);
      ids = page.rows.map((r) => r.id);
      nextCursor = page.nextCursor;
    }
    res.json({ tag, postCount: count.rows[0].n, items: await loadPosts(pool, ids, viewer), nextCursor });
  }),
);
