import { Router } from 'express';
import { z } from 'zod';
import { pool, Q, tx } from '../db/pool.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { decodeKeyCursor, keysetCond, keysetPage, limitSchema } from '../lib/pagination.js';
import { parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';
import { singleUpload } from '../middleware/upload.js';
import { MB, storeMedia, type StoredMedia } from '../media/process.js';
import { deleteKeys } from '../storage/index.js';
import { emitToUser } from '../realtime/socket.js';
import { loadConversations, loadMessages } from '../services/hydrate.js';

export const conversationsRouter = Router();

/** Hides DMs with a blocked user (either direction). */
const DM_NOT_BLOCKED = (v: string) => `(c.is_group OR NOT EXISTS (
  SELECT 1 FROM conversation_participants o JOIN blocks bl
    ON (bl.blocker_id = ${v} AND bl.blocked_id = o.user_id) OR (bl.blocker_id = o.user_id AND bl.blocked_id = ${v})
   WHERE o.conversation_id = c.id AND o.user_id <> ${v}))`;

async function participantIds(conversationId: string): Promise<string[]> {
  const r = await pool.query('SELECT user_id FROM conversation_participants WHERE conversation_id = $1', [conversationId]);
  return r.rows.map((x) => x.user_id);
}

/** Loads the conversation if the viewer participates, otherwise 404/403. */
async function assertParticipant(conversationId: string, viewerId: string) {
  const r = await pool.query(
    `SELECT c.id, c.is_group, EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = $2) AS member
       FROM conversations c WHERE c.id = $1`,
    [conversationId, viewerId],
  );
  const row = r.rows[0];
  if (!row) throw notFound('Conversation');
  if (!row.member) throw forbidden('You are not a participant of this conversation');
  return { id: row.id as string, isGroup: row.is_group as boolean };
}

async function hasBlockBetween(a: string, others: string[]): Promise<boolean> {
  if (!others.length) return false;
  const r = await pool.query(
    `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = ANY($2::uuid[])) OR (blocked_id = $1 AND blocker_id = ANY($2::uuid[])) LIMIT 1`,
    [a, others],
  );
  return !!r.rowCount;
}

// GET /conversations
conversationsRouter.get(
  '/',
  h(async (req, res) => {
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    const q = new Q();
    const v = q.p(viewer);
    q.and(`EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = ${v})`)
      .and('(c.is_group OR c.last_message_at IS NOT NULL)')
      .and(DM_NOT_BLOCKED(v));
    keysetCond(q, 'c.updated_at', 'c.id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT c.id, c.updated_at::text AS _ct FROM conversations c ${q.whereSql()}
        ORDER BY c.updated_at DESC, c.id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadConversations(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// GET /conversations/unread-count
conversationsRouter.get(
  '/unread-count',
  h(async (req, res) => {
    const viewer = me(req).id;
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count FROM conversation_participants me
         JOIN conversations c ON c.id = me.conversation_id
        WHERE me.user_id = $1
          AND ${DM_NOT_BLOCKED('$1')}
          AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = me.conversation_id
                       AND m.created_at > me.last_read_at AND m.sender_id <> $1)`,
      [viewer],
    );
    res.json({ count: rows[0].count });
  }),
);

const createSchema = z.union([
  z.object({ userId: uuid }).strict(),
  z
    .object({
      title: z.string().trim().min(1).max(80),
      memberIds: z.array(uuid).min(1).max(49),
    })
    .strict(),
]);

// POST /conversations
conversationsRouter.post(
  '/',
  h(async (req, res) => {
    const body = parse(createSchema, req.body ?? {});
    const viewer = me(req).id;
    if ('userId' in body) {
      if (body.userId === viewer) throw badRequest('You cannot message yourself');
      const exists = await pool.query('SELECT 1 FROM users WHERE id = $1', [body.userId]);
      if (!exists.rowCount) throw notFound('User');
      if (await hasBlockBetween(viewer, [body.userId])) throw forbidden('You cannot message this user');
      const dmKey = [viewer, body.userId].sort().join(':');
      const { id, created } = await tx(async (c) => {
        const ins = await c.query(
          `INSERT INTO conversations (is_group, dm_key, created_by) VALUES (false, $1, $2)
           ON CONFLICT (dm_key) DO NOTHING RETURNING id`,
          [dmKey, viewer],
        );
        if (ins.rows[0]) {
          await c.query(
            'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
            [ins.rows[0].id, viewer, body.userId],
          );
          return { id: ins.rows[0].id as string, created: true };
        }
        const ex = await c.query('SELECT id FROM conversations WHERE dm_key = $1', [dmKey]);
        return { id: ex.rows[0].id as string, created: false };
      });
      const [conversation] = await loadConversations(pool, [id], viewer);
      res.status(created ? 201 : 200).json(conversation);
      return;
    }
    const memberIds = [...new Set(body.memberIds.filter((id) => id !== viewer))];
    if (!memberIds.length) throw badRequest('A group needs at least one other member');
    const found = await pool.query('SELECT id FROM users WHERE id = ANY($1::uuid[])', [memberIds]);
    if (found.rowCount !== memberIds.length) throw notFound('User');
    if (await hasBlockBetween(viewer, memberIds)) throw forbidden('You cannot add a user you blocked or who blocked you');
    const id = await tx(async (c) => {
      const r = await c.query(
        `INSERT INTO conversations (is_group, title, created_by, last_message_at) VALUES (true, $1, $2, NULL) RETURNING id`,
        [body.title, viewer],
      );
      const convId = r.rows[0].id as string;
      await c.query(
        `INSERT INTO conversation_participants (conversation_id, user_id) SELECT $1, unnest($2::uuid[])`,
        [convId, [viewer, ...memberIds]],
      );
      return convId;
    });
    const [conversation] = await loadConversations(pool, [id], viewer);
    res.status(201).json(conversation);
  }),
);

// GET /conversations/:id
conversationsRouter.get(
  '/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await assertParticipant(id, viewer);
    const [conversation] = await loadConversations(pool, [id], viewer);
    res.json(conversation);
  }),
);

// PATCH /conversations/:id
conversationsRouter.patch(
  '/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(z.object({ muted: z.boolean().optional(), title: z.string().trim().min(1).max(80).optional() }).strict(), req.body ?? {});
    const viewer = me(req).id;
    const conv = await assertParticipant(id, viewer);
    if (body.muted !== undefined) {
      await pool.query('UPDATE conversation_participants SET muted = $3 WHERE conversation_id = $1 AND user_id = $2', [id, viewer, body.muted]);
    }
    if (body.title !== undefined) {
      if (!conv.isGroup) throw badRequest('Only group conversations have a title');
      await pool.query('UPDATE conversations SET title = $2 WHERE id = $1', [id, body.title]);
    }
    const [conversation] = await loadConversations(pool, [id], viewer);
    res.json(conversation);
  }),
);

// GET /conversations/:id/messages (newest first)
conversationsRouter.get(
  '/:id/messages',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const query = parse(z.object({ cursor: z.string().optional(), limit: limitSchema }), req.query);
    const viewer = me(req).id;
    await assertParticipant(id, viewer);
    const q = new Q();
    q.and(`m.conversation_id = ${q.p(id)}`);
    keysetCond(q, 'm.created_at', 'm.id', decodeKeyCursor(query.cursor));
    const { rows } = await pool.query(
      `SELECT m.id, m.created_at::text AS _ct FROM messages m ${q.whereSql()}
        ORDER BY m.created_at DESC, m.id DESC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadMessages(pool, page.rows.map((r) => r.id), viewer), nextCursor: page.nextCursor });
  }),
);

// POST /conversations/:id/messages (JSON or multipart text + media)
conversationsRouter.post(
  '/:id/messages',
  singleUpload('media', 100 * MB),
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { text } = parse(
      z.object({ text: z.preprocess((v) => (v === undefined || v === null ? '' : v), z.string().trim().max(2000)) }),
      req.body ?? {},
    );
    const viewer = me(req).id;
    const conv = await assertParticipant(id, viewer);
    if (!text && !req.file) throw badRequest('Message text or media is required', [{ path: 'text', message: 'Required' }]);
    const participants = await participantIds(id);
    const others = participants.filter((p) => p !== viewer);
    if (!conv.isGroup && (await hasBlockBetween(viewer, others))) throw forbidden('You cannot message this user');

    let media: StoredMedia | null = null;
    if (req.file) media = await storeMedia(req.file);
    let messageId: string;
    try {
      messageId = await tx(async (c) => {
        const r = await c.query(
          `INSERT INTO messages (conversation_id, sender_id, text, media_kind, media_key, thumbnail_key, duration_sec, width, height)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at`,
          [id, viewer, text, media?.kind ?? null, media?.key ?? null, media?.thumbnailKey ?? null, media?.durationSec ?? null, media?.width ?? null, media?.height ?? null],
        );
        await c.query('UPDATE conversations SET last_message_at = $2, updated_at = $2 WHERE id = $1', [id, r.rows[0].created_at]);
        await c.query('UPDATE conversation_participants SET last_read_at = $3 WHERE conversation_id = $1 AND user_id = $2', [
          id,
          viewer,
          r.rows[0].created_at,
        ]);
        return r.rows[0].id as string;
      });
    } catch (err) {
      if (media) deleteKeys([media.key, media.thumbnailKey]);
      throw err;
    }
    const [message] = await loadMessages(pool, [messageId], viewer);
    for (const uid of participants) {
      const payload = uid === viewer ? message : (await loadMessages(pool, [messageId], uid))[0];
      emitToUser(uid, 'message:new', { message: payload });
    }
    res.status(201).json(message);
  }),
);

// POST /conversations/:id/read
conversationsRouter.post(
  '/:id/read',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const viewer = me(req).id;
    await assertParticipant(id, viewer);
    await pool.query(
      'UPDATE conversation_participants SET last_read_at = GREATEST(last_read_at, clock_timestamp()) WHERE conversation_id = $1 AND user_id = $2',
      [id, viewer],
    );
    for (const uid of await participantIds(id)) {
      emitToUser(uid, 'conversation:read', { conversationId: id, userId: viewer });
    }
    res.status(204).end();
  }),
);
