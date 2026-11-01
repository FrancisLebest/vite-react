import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { parse, uuid } from '../lib/validate.js';
import { h, me } from '../middleware/auth.js';

export const reportsRouter = Router();

const TABLE: Record<string, string> = {
  post: 'posts',
  comment: 'comments',
  user: 'users',
  community: 'communities',
  message: 'messages',
};

reportsRouter.post(
  '/',
  h(async (req, res) => {
    const body = parse(
      z.object({
        targetType: z.enum(['post', 'comment', 'user', 'community', 'message']),
        targetId: uuid,
        reason: z.enum(['spam', 'harassment', 'inappropriate', 'other']),
        details: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.string().trim().max(1000).optional()),
      }),
      req.body ?? {},
    );
    const viewer = me(req).id;
    const exists =
      body.targetType === 'message'
        ? await pool.query(
            `SELECT 1 FROM messages m JOIN conversation_participants p ON p.conversation_id = m.conversation_id AND p.user_id = $2 WHERE m.id = $1`,
            [body.targetId, viewer],
          )
        : await pool.query(`SELECT 1 FROM ${TABLE[body.targetType]} WHERE id = $1`, [body.targetId]);
    if (!exists.rowCount) throw notFound('Report target');
    const r = await pool.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at`,
      [viewer, body.targetType, body.targetId, body.reason, body.details ?? null],
    );
    res.status(201).json({ id: r.rows[0].id, status: r.rows[0].status, createdAt: new Date(r.rows[0].created_at).toISOString() });
  }),
);
