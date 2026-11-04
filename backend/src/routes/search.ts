import { Router } from 'express';
import { z } from 'zod';
import { pool, Q } from '../db/pool.js';
import { CATEGORY_IDS } from '../lib/categories.js';
import { decodeOffsetCursor, limitSchema, offsetPage } from '../lib/pagination.js';
import { likeEscape } from '../lib/text.js';
import { emptyToUndef, parse } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { loadCommunities, loadPosts, loadUserSummaries, notBlockedSql, postVisibleSql } from '../services/hydrate.js';

export const searchRouter = Router();

const searchQuery = z.object({
  q: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string().trim().max(100)),
  type: z.preprocess(emptyToUndef, z.enum(['all', 'posts', 'users', 'communities']).default('all')),
  category: z.preprocess(emptyToUndef, z.enum(CATEGORY_IDS).optional()),
  university: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  sort: z.preprocess(emptyToUndef, z.enum(['relevant', 'recent', 'popular']).default('relevant')),
  cursor: z.string().optional(),
  limit: limitSchema,
});
type SearchQuery = z.infer<typeof searchQuery>;

type Built = { where: string; order: string; params: unknown[]; whereParams: number; from: string };

function buildPosts(s: SearchQuery, viewer: string): Built {
  const q = new Q();
  const v = q.p(viewer);
  q.and(`p.status = 'ready'`).and(postVisibleSql('p', v));
  let relevance = '0::float';
  if (s.q) {
    const term = s.q.replace(/^#/, '');
    const like = q.p(`%${likeEscape(s.q)}%`);
    const tagLike = q.p(`%${likeEscape(term.toLowerCase())}%`);
    q.and(`(p.text ILIKE ${like} OR EXISTS (SELECT 1 FROM unnest(p.hashtags) t WHERE t LIKE ${tagLike}))`);
  }
  if (s.category) q.and(`p.category = ${q.p(s.category)}`);
  if (s.university) q.and(`au.university ILIKE ${q.p(`%${likeEscape(s.university)}%`)}`);
  const whereParams = q.params.length;
  if (s.q && s.sort === 'relevant') {
    const raw = q.p(s.q);
    const tag = q.p(s.q.replace(/^#/, '').toLowerCase());
    relevance = `(CASE WHEN ${tag}::text = ANY(p.hashtags) THEN 1 ELSE 0 END + similarity(p.text, ${raw}::text))`;
  }
  const engagement = '(p.like_count + 2 * p.comment_count + 3 * p.share_count + 2 * p.bookmark_count)';
  const order =
    s.sort === 'recent'
      ? 'p.created_at DESC, p.id DESC'
      : s.sort === 'popular'
        ? `${engagement} DESC, p.created_at DESC, p.id`
        : `${relevance} DESC, ${engagement} DESC, p.created_at DESC, p.id`;
  return { from: 'posts p JOIN users au ON au.id = p.author_id', where: q.whereSql(), order, params: q.params, whereParams };
}

function buildUsers(s: SearchQuery, viewer: string): Built {
  const q = new Q();
  const v = q.p(viewer);
  q.and(notBlockedSql('u.id', v)).and('u.suspended_at IS NULL');
  let relevance = '0::float';
  if (s.q) {
    const like = q.p(`%${likeEscape(s.q.replace(/^@/, ''))}%`);
    q.and(`(u.name ILIKE ${like} OR u.username::text ILIKE ${like})`);
  }
  if (s.university) q.and(`u.university ILIKE ${q.p(`%${likeEscape(s.university)}%`)}`);
  const whereParams = q.params.length;
  if (s.q && s.sort === 'relevant') {
    const raw = q.p(s.q.replace(/^@/, ''));
    relevance = `(CASE WHEN u.username = ${raw}::citext THEN 2 ELSE 0 END + GREATEST(similarity(u.name, ${raw}::text), similarity(u.username::text, ${raw}::text)))`;
  }
  const order =
    s.sort === 'recent'
      ? 'u.created_at DESC, u.id DESC'
      : s.sort === 'popular'
        ? 'u.follower_count DESC, u.created_at DESC, u.id'
        : `${relevance} DESC, u.follower_count DESC, u.id`;
  return { from: 'users u', where: q.whereSql(), order, params: q.params, whereParams };
}

function buildCommunities(s: SearchQuery, viewer: string): Built {
  const q = new Q();
  const v = q.p(viewer);
  q.and(notBlockedSql('c.owner_id', v));
  let relevance = '0::float';
  if (s.q) {
    const like = q.p(`%${likeEscape(s.q)}%`);
    q.and(`(c.name::text ILIKE ${like} OR c.description ILIKE ${like})`);
  }
  if (s.university) {
    const uni = q.p(`%${likeEscape(s.university)}%`);
    q.and(`(c.name::text ILIKE ${uni} OR c.description ILIKE ${uni})`);
  }
  const whereParams = q.params.length;
  if (s.q && s.sort === 'relevant') {
    const raw = q.p(s.q);
    relevance = `(similarity(c.name::text, ${raw}::text) * 2 + similarity(c.description, ${raw}::text))`;
  }
  const order =
    s.sort === 'recent'
      ? 'c.created_at DESC, c.id DESC'
      : s.sort === 'popular'
        ? 'c.member_count DESC, c.created_at DESC, c.id'
        : `${relevance} DESC, c.member_count DESC, c.id`;
  return { from: 'communities c', where: q.whereSql(), order, params: q.params, whereParams };
}

async function runSearch(b: Built, alias: string, limit: number, offset: number) {
  const [rows, count] = await Promise.all([
    pool.query(`SELECT ${alias}.id FROM ${b.from} ${b.where} ORDER BY ${b.order} LIMIT ${limit + 1} OFFSET ${offset}`, b.params),
    pool.query(`SELECT count(*)::int AS n FROM ${b.from} ${b.where}`, b.params.slice(0, b.whereParams)),
  ]);
  return { ...offsetPage(rows.rows as { id: string }[], limit, offset), total: count.rows[0].n as number };
}

searchRouter.get(
  '/',
  h(async (req, res) => {
    const s = parse(searchQuery, req.query);
    const viewer = me(req).id;
    if (s.type === 'all') {
      const [posts, users, communities] = await Promise.all([
        runSearch(buildPosts(s, viewer), 'p', 10, 0),
        runSearch(buildUsers(s, viewer), 'u', 10, 0),
        runSearch(buildCommunities(s, viewer), 'c', 10, 0),
      ]);
      const ids = (r: { rows: { id: string }[] }) => r.rows.map((x) => x.id);
      res.json({
        posts: await loadPosts(pool, ids(posts), viewer),
        users: await loadUserSummaries(pool, ids(users), viewer),
        communities: await loadCommunities(pool, ids(communities), viewer),
        total: posts.total + users.total + communities.total,
      });
      return;
    }
    const offset = decodeOffsetCursor(s.cursor);
    if (s.type === 'posts') {
      const r = await runSearch(buildPosts(s, viewer), 'p', s.limit, offset);
      res.json({ items: await loadPosts(pool, r.rows.map((x) => x.id), viewer), nextCursor: r.nextCursor, total: r.total });
    } else if (s.type === 'users') {
      const r = await runSearch(buildUsers(s, viewer), 'u', s.limit, offset);
      res.json({ items: await loadUserSummaries(pool, r.rows.map((x) => x.id), viewer), nextCursor: r.nextCursor, total: r.total });
    } else {
      const r = await runSearch(buildCommunities(s, viewer), 'c', s.limit, offset);
      res.json({ items: await loadCommunities(pool, r.rows.map((x) => x.id), viewer), nextCursor: r.nextCursor, total: r.total });
    }
  }),
);
