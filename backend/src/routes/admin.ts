import { Router } from 'express';
import { z } from 'zod';
import { pool, Q, tx } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { decodeKeyCursor, keysetCond, keysetPage, limitSchema } from '../lib/pagination.js';
import { revokeAllUserTokens } from '../lib/tokens.js';
import { emptyToUndef, parse, uuid } from '../lib/validate.js';
import { h, me, requireAdmin } from '../middleware/auth.js';
import { deleteKeys } from '../storage/index.js';
import { disconnectUser } from '../realtime/socket.js';
import { loadReports, loadVerificationRequests } from '../services/hydrate.js';
import { notify } from '../services/notifications.js';
import { deletePost } from './posts.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

export async function suspendUser(adminId: string, userId: string, reason: string | null): Promise<void> {
  if (adminId === userId) throw badRequest('You cannot suspend yourself');
  await tx(async (c) => {
    const r = await c.query('UPDATE users SET suspended_at = COALESCE(suspended_at, now()), suspended_reason = $2 WHERE id = $1 RETURNING id', [userId, reason]);
    if (!r.rowCount) throw notFound('User');
    await revokeAllUserTokens(c, userId);
  });
  disconnectUser(userId);
}

async function deleteCommunity(id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM communities WHERE id = $1 RETURNING avatar_key', [id]);
  if (r.rows[0]) deleteKeys([r.rows[0].avatar_key]);
  return !!r.rowCount;
}

/** Deletes the reported content; returns the id of its author (if any). */
async function removeTarget(targetType: string, targetId: string): Promise<string | null> {
  switch (targetType) {
    case 'post': {
      const r = await pool.query('SELECT author_id FROM posts WHERE id = $1', [targetId]);
      await deletePost(targetId);
      return r.rows[0]?.author_id ?? null;
    }
    case 'comment': {
      const r = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING author_id', [targetId]);
      return r.rows[0]?.author_id ?? null;
    }
    case 'message': {
      const r = await pool.query('DELETE FROM messages WHERE id = $1 RETURNING sender_id, media_key, thumbnail_key', [targetId]);
      if (r.rows[0]) deleteKeys([r.rows[0].media_key, r.rows[0].thumbnail_key]);
      return r.rows[0]?.sender_id ?? null;
    }
    case 'community': {
      const r = await pool.query('SELECT owner_id FROM communities WHERE id = $1', [targetId]);
      await deleteCommunity(targetId);
      return r.rows[0]?.owner_id ?? null;
    }
    default:
      return null;
  }
}

async function targetAuthor(targetType: string, targetId: string): Promise<string | null> {
  const sql: Record<string, string> = {
    post: 'SELECT author_id AS id FROM posts WHERE id = $1',
    comment: 'SELECT author_id AS id FROM comments WHERE id = $1',
    message: 'SELECT sender_id AS id FROM messages WHERE id = $1',
    community: 'SELECT owner_id AS id FROM communities WHERE id = $1',
    user: 'SELECT id FROM users WHERE id = $1',
  };
  const r = await pool.query(sql[targetType]!, [targetId]);
  return r.rows[0]?.id ?? null;
}

// Reports queue
adminRouter.get(
  '/reports',
  h(async (req, res) => {
    const query = parse(
      z.object({ status: z.preprocess(emptyToUndef, z.enum(['open', 'reviewed', 'dismissed']).default('open')), cursor: z.string().optional(), limit: limitSchema }),
      req.query,
    );
    const q = new Q();
    q.and(`r.status = ${q.p(query.status)}`);
    const asc = query.status === 'open';
    keysetCond(q, 'r.created_at', 'r.id', decodeKeyCursor(query.cursor), asc ? '>' : '<');
    const dir = asc ? 'ASC' : 'DESC';
    const { rows } = await pool.query(
      `SELECT r.id, r.created_at::text AS _ct FROM reports r ${q.whereSql()} ORDER BY r.created_at ${dir}, r.id ${dir} LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadReports(pool, page.rows.map((r) => r.id), me(req).id), nextCursor: page.nextCursor });
  }),
);

async function getReport(id: string) {
  const r = await pool.query('SELECT * FROM reports WHERE id = $1', [id]);
  if (!r.rows[0]) throw notFound('Report');
  return r.rows[0];
}

adminRouter.post(
  '/reports/:id/resolve',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(
      z.object({ action: z.enum(['none', 'remove_content', 'suspend_user']).default('none'), note: z.string().trim().max(1000).optional() }),
      req.body ?? {},
    );
    const admin = me(req).id;
    const report = await getReport(id);
    let resolution: 'none' | 'content_removed' | 'user_suspended' = 'none';
    if (body.action === 'remove_content') {
      if (report.target_type === 'user') throw badRequest('Use suspend_user for user reports');
      await removeTarget(report.target_type, report.target_id);
      resolution = 'content_removed';
    } else if (body.action === 'suspend_user') {
      const authorId = await targetAuthor(report.target_type, report.target_id);
      if (!authorId) throw notFound('Reported user');
      await suspendUser(admin, authorId, body.note ?? `Report ${report.reason}`);
      resolution = 'user_suspended';
    }
    await pool.query(
      `UPDATE reports SET status = 'reviewed', resolution = $2, note = $3, resolved_by = $4, resolved_at = now() WHERE id = $1`,
      [id, resolution, body.note ?? null, admin],
    );
    const [out] = await loadReports(pool, [id], admin);
    res.json(out);
  }),
);

adminRouter.post(
  '/reports/:id/dismiss',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(z.object({ note: z.string().trim().max(1000).optional() }), req.body ?? {});
    const admin = me(req).id;
    await getReport(id);
    await pool.query(
      `UPDATE reports SET status = 'dismissed', resolution = NULL, note = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`,
      [id, body.note ?? null, admin],
    );
    const [out] = await loadReports(pool, [id], admin);
    res.json(out);
  }),
);

// Content removal
adminRouter.delete(
  '/posts/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const r = await pool.query('SELECT 1 FROM posts WHERE id = $1', [id]);
    if (!r.rowCount) throw notFound('Post');
    await deletePost(id);
    res.status(204).end();
  }),
);

adminRouter.delete(
  '/comments/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const r = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING 1', [id]);
    if (!r.rowCount) throw notFound('Comment');
    res.status(204).end();
  }),
);

adminRouter.delete(
  '/communities/:id',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    if (!(await deleteCommunity(id))) throw notFound('Community');
    res.status(204).end();
  }),
);

// Suspension
adminRouter.post(
  '/users/:id/suspend',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { reason } = parse(z.object({ reason: z.string().trim().max(500).optional() }), req.body ?? {});
    await suspendUser(me(req).id, id, reason ?? null);
    res.status(204).end();
  }),
);

adminRouter.delete(
  '/users/:id/suspend',
  h(async (req, res) => {
    const id = parse(uuid, req.params.id);
    const r = await pool.query('UPDATE users SET suspended_at = NULL, suspended_reason = NULL WHERE id = $1 RETURNING 1', [id]);
    if (!r.rowCount) throw notFound('User');
    res.status(204).end();
  }),
);

// Verification requests
adminRouter.get(
  '/verification-requests',
  h(async (req, res) => {
    const query = parse(
      z.object({ status: z.preprocess(emptyToUndef, z.enum(['pending', 'approved', 'rejected']).default('pending')), cursor: z.string().optional(), limit: limitSchema }),
      req.query,
    );
    const q = new Q();
    q.and(`v.status = ${q.p(query.status)}`);
    keysetCond(q, 'v.created_at', 'v.id', decodeKeyCursor(query.cursor), '>');
    const { rows } = await pool.query(
      `SELECT v.id, v.created_at::text AS _ct FROM verification_requests v ${q.whereSql()} ORDER BY v.created_at ASC, v.id ASC LIMIT ${query.limit + 1}`,
      q.params,
    );
    const page = keysetPage(rows, query.limit);
    res.json({ items: await loadVerificationRequests(pool, page.rows.map((r) => r.id), me(req).id), nextCursor: page.nextCursor });
  }),
);

for (const decision of ['approve', 'reject'] as const) {
  adminRouter.post(
    `/verification-requests/:id/${decision}`,
    h(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const admin = me(req).id;
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const r = await tx(async (c) => {
        const upd = await c.query(
          `UPDATE verification_requests SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING user_id`,
          [id, status, admin],
        );
        if (!upd.rowCount) {
          const exists = await c.query('SELECT 1 FROM verification_requests WHERE id = $1', [id]);
          if (!exists.rowCount) throw notFound('Verification request');
          throw conflict('This request has already been decided');
        }
        if (decision === 'approve') await c.query('UPDATE users SET verified = true WHERE id = $1', [upd.rows[0].user_id]);
        return upd.rows[0].user_id as string;
      });
      if (decision === 'approve') {
        await notify({ userId: r, actorId: admin, type: 'verification', text: 'Your account is now verified' });
      }
      const [out] = await loadVerificationRequests(pool, [id], admin);
      res.json(out);
    }),
  );
}
