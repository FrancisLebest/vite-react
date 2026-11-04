import { Router } from 'express';
import { z } from 'zod';
import { pool, Q } from '../db/pool.js';
import { filterText } from '../lib/contentFilter.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { decodeKeyCursor, keysetCond, keysetPage, limitSchema } from '../lib/pagination.js';
import { emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { loadEvents } from '../services/hydrate.js';
import { notifyMany } from '../services/notifications.js';

export const eventsRouter = Router();

const isoDate = z.string().datetime({ offset: true, message: 'Must be an ISO 8601 date-time' });
const nullableText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());
const urlSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(500).url().refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL').nullable().optional(),
);

async function membership(communityId: string, userId: string) {
  const r = await pool.query(
    `SELECT c.id, c.name, c.owner_id, EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = $2) AS member
       FROM communities c WHERE c.id = $1`,
    [communityId, userId],
  );
  if (!r.rows[0]) throw notFound('Community');
  return r.rows[0] as { id: string; name: string; owner_id: string; member: boolean };
}

async function getEvent(id: string) {
  const r = await pool.query(
    'SELECT e.id, e.community_id, e.creator_id, e.starts_at, e.ends_at, c.owner_id FROM events e JOIN communities c ON c.id = e.community_id WHERE e.id = $1',
    [id],
  );
  if (!r.rows[0]) throw notFound('Event');
  return r.rows[0];
}

// POST /communities/:id/events
eventsRouter.post(
  '/communities/:id/events',
  h(async (req, res) => {
    const communityId = parse(uuid, req.params.id);
    const body = parse(
      z.object({
        title: z.string().trim().min(3).max(120),
        description: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(2000)).optional(),
        startsAt: isoDate,
        endsAt: z.preprocess(emptyToUndef, isoDate.nullable().optional()),
        location: nullableText(200),
        onlineUrl: urlSchema,
      }),
      req.body ?? {},
    );
    const viewer = me(req).id;
    const community = await membership(communityId, viewer);
    if (!community.member) throw forbidden('Join the community to create events');
    if (Date.parse(body.startsAt) <= Date.now()) throw badRequest('startsAt must be in the future', [{ path: 'startsAt', message: 'Must be in the future' }]);
    if (body.endsAt && Date.parse(body.endsAt) <= Date.parse(body.startsAt)) {
      throw badRequest('endsAt must be after startsAt', [{ path: 'endsAt', message: 'Must be after startsAt' }]);
    }
    const title = filterText(body.title, 'title');
    const r = await pool.query(
      `INSERT INTO events (community_id, creator_id, title, description, starts_at, ends_at, location, online_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [communityId, viewer, title, filterText(body.description ?? '', 'description'), body.startsAt, body.endsAt ?? null, body.location ?? null, body.onlineUrl ?? null],
    );
    const eventId = r.rows[0].id as string;
    await pool.query(`INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, 'going')`, [eventId, viewer]);
    const members = await pool.query('SELECT user_id FROM community_members WHERE community_id = $1 AND user_id <> $2', [communityId, viewer]);
    await notifyMany(
      members.rows.map((m) => m.user_id),
      { actorId: viewer, type: 'event', communityId, eventId, text: `created an event in ${community.name}: ${title}` },
    );
    const [event] = await loadEvents(pool, [eventId], viewer);
    res.status(201).json(event);
  }),
);

// GET /communities/:id/events
eventsRouter.get(
  '/communities/:id/events',
  h(async (req, res) => {
    const communityId = parse(uuid, req.params.id);
    const query = parse(
      z.object({ when: z.preprocess(emptyToUndef, z.enum(['upcoming', 'past']).default('upcoming')), cursor: z.string().optional(), limit: limitSchema }),
      req.query,
    );
    const viewer = me(req).id;
    await membership(communityId, viewer);
    const q = new Q();
    q.and(`e.community_id = ${q.p(communityId)}`);
    const upcoming = query.when === 'upcoming';
    q.and(upcoming ? 'COALESCE(e.ends_at, e.starts_at) >= now()' : 'COALESCE(e.ends_at, e.starts_at) < now()');
    keysetCond(q, 'e.starts_at', 'e.id', decodeKeyCursor(query.cursor), upcoming ? '>' : '<');
    const dir = upcoming ? 'ASC' : 'DESC';
    const { rows } = await pool.query(
      `SELECT e.id, e.starts_at::text AS _ct FROM events e ${q.whereSql()} ORDER BY e.starts_at ${dir}, e.id ${dir} LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadEvents(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// GET /me/events — upcoming events of my communities
eventsRouter.get(
  '/me/events',
  h(async (req, res) => {
    const query = parse(
      z.object({ rsvp: z.preprocess(emptyToUndef, z.enum(['going']).optional()), cursor: z.string().optional(), limit: limitSchema }),
      req.query,
    );
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = e.community_id AND m.user_id = ${v})`);
    q.and('COALESCE(e.ends_at, e.starts_at) >= now()');
    if (query.rsvp) q.and(`EXISTS (SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = ${v} AND r.status = 'going')`);
    keysetCond(q, 'e.starts_at', 'e.id', decodeKeyCursor(query.cursor), '>');
    const { rows } = await pool.query(
      `SELECT e.id, e.starts_at::text AS _ct FROM events e ${q.whereSql()} ORDER BY e.starts_at ASC, e.id ASC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadEvents(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

eventsRouter.get(
  '/events/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    await getEvent(id);
    const [event] = await loadEvents(pool, [id], me(req).id);
    res.json(event);
  }),
);

eventsRouter.patch(
  '/events/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const ev = await getEvent(id);
    if (ev.creator_id !== viewer && ev.owner_id !== viewer) throw forbidden('Only the creator or the community owner can edit this event');
    const body = parse(
      z
        .object({
          title: z.string().trim().min(3).max(120).optional(),
          description: z.string().trim().max(2000).optional(),
          startsAt: isoDate.optional(),
          endsAt: isoDate.nullable().optional(),
          location: nullableText(200),
          onlineUrl: urlSchema,
        })
        .strict(),
      req.body ?? {},
    );
    const startsAt = body.startsAt ?? new Date(ev.starts_at).toISOString();
    const endsAt = body.endsAt !== undefined ? body.endsAt : ev.ends_at ? new Date(ev.ends_at).toISOString() : null;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw badRequest('endsAt must be after startsAt', [{ path: 'endsAt', message: 'Must be after startsAt' }]);
    const q = new Q();
    const sets: string[] = [];
    if (body.title !== undefined) sets.push(`title = ${q.p(filterText(body.title, 'title'))}`);
    if (body.description !== undefined) sets.push(`description = ${q.p(filterText(body.description, 'description'))}`);
    if (body.startsAt !== undefined) sets.push(`starts_at = ${q.p(body.startsAt)}`);
    if (body.endsAt !== undefined) sets.push(`ends_at = ${q.p(body.endsAt)}`);
    if (body.location !== undefined) sets.push(`location = ${q.p(body.location)}`);
    if (body.onlineUrl !== undefined) sets.push(`online_url = ${q.p(body.onlineUrl)}`);
    if (!sets.length) throw badRequest('Nothing to update');
    await pool.query(`UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id = ${q.p(id)}`, q.params);
    const [event] = await loadEvents(pool, [id], viewer);
    res.json(event);
  }),
);

eventsRouter.delete(
  '/events/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    const ev = await getEvent(id);
    if (ev.creator_id !== viewer && ev.owner_id !== viewer) throw forbidden('Only the creator or the community owner can delete this event');
    await pool.query('DELETE FROM events WHERE id = $1', [id]);
    res.status(204).end();
  }),
);

eventsRouter.put(
  '/events/:id/rsvp',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { status } = parse(z.object({ status: z.enum(['going', 'not_going']) }), req.body ?? {});
    const viewer = me(req).id;
    const ev = await getEvent(id);
    if (!(await membership(ev.community_id, viewer)).member) throw forbidden('Join the community to RSVP');
    await pool.query(
      `INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [id, viewer, status],
    );
    const c = await pool.query('SELECT going_count FROM events WHERE id = $1', [id]);
    res.json({ myRsvp: status, goingCount: c.rows[0].going_count });
  }),
);

eventsRouter.delete(
  '/events/:id/rsvp',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    await getEvent(id);
    await pool.query('DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [id, me(req).id]);
    const c = await pool.query('SELECT going_count FROM events WHERE id = $1', [id]);
    res.json({ myRsvp: null, goingCount: c.rows[0].going_count });
  }),
);
