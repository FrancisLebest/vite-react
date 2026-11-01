import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import { config } from '../config.js';
import { pool, tx } from '../db/pool.js';
import { unauthorized } from './errors.js';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ typ: 'access' }, config.JWT_SECRET, {
    subject: userId,
    expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): string {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') throw new Error('bad token');
    return payload.sub;
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
}

async function insertRefreshToken(db: pg.Pool | pg.PoolClient, userId: string, userAgent?: string) {
  const token = crypto.randomBytes(48).toString('base64url');
  const r = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4) RETURNING id`,
    [userId, sha256(token), config.REFRESH_TOKEN_TTL_DAYS, userAgent?.slice(0, 255) ?? null],
  );
  return { token, id: r.rows[0].id as string };
}

export async function issueTokens(userId: string, userAgent?: string) {
  const { token } = await insertRefreshToken(pool, userId, userAgent);
  return { accessToken: signAccessToken(userId), refreshToken: token };
}

/** Rotates a refresh token. Reuse of a revoked token revokes the whole token family of that user. */
export async function rotateRefreshToken(refreshToken: string, userAgent?: string) {
  const hash = sha256(refreshToken);
  const result = await tx(async (client) => {
    const row = (
      await client.query(
        'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
        [hash],
      )
    ).rows[0];
    if (!row) return { error: 'invalid' as const };
    if (row.revoked_at) {
      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
        row.user_id,
      ]);
      return { error: 'reused' as const };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) return { error: 'expired' as const };
    const next = await insertRefreshToken(client, row.user_id, userAgent);
    await client.query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [row.id, next.id]);
    return { userId: row.user_id as string, refreshToken: next.token };
  });
  if ('error' in result) throw unauthorized('Invalid or expired refresh token');
  return { accessToken: signAccessToken(result.userId), refreshToken: result.refreshToken };
}

export async function revokeRefreshToken(refreshToken: string) {
  await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    sha256(refreshToken),
  ]);
}

export async function revokeAllUserTokens(db: pg.Pool | pg.PoolClient, userId: string) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}
