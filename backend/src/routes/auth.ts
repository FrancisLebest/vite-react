import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, tx } from '../db/pool.js';
import { badRequest, conflict, suspended, unauthorized } from '../lib/errors.js';
import { filterText } from '../lib/contentFilter.js';
import { sendMail } from '../lib/mailer.js';
import { issueTokens, revokeAllUserTokens, revokeRefreshToken, rotateRefreshToken, sha256 } from '../lib/tokens.js';
import { nullableTrimmed, parse } from '../lib/validate.js';
import { h, me, requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { loadMe } from '../services/hydrate.js';

export const usernameSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.string().regex(/^[a-z0-9._]{3,30}$/, 'Username must be 3-30 characters: a-z, 0-9, "." or "_"'),
);
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);
export const roleSchema = z.enum(['student', 'professor', 'creator']);
const emailSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.string().email('Invalid email').max(254),
);

const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  university: nullableTrimmed(120),
  role: roleSchema.optional(),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10).max(200) });

const RESET_CODE_TTL_MIN = 15;
const RESET_MAX_ATTEMPTS = 5;

export const hashPassword = (pw: string) => bcrypt.hash(pw, config.BCRYPT_ROUNDS);

// A constant hash so that unknown identifiers take as long as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 4);

function codeHash(email: string, code: string) {
  return sha256(`${config.JWT_SECRET}:${email.toLowerCase()}:${code}`);
}

const VERIFY_CODE_TTL_HOURS = 24;

function verifyHash(userId: string, code: string) {
  return sha256(`${config.JWT_SECRET}:verify:${userId}:${code}`);
}

/** Creates a new e-mail verification code (invalidating previous ones) and mails it. */
async function sendVerificationCode(userId: string): Promise<void> {
  const { rows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  await tx(async (c) => {
    await c.query('UPDATE email_verifications SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await c.query(
      `INSERT INTO email_verifications (user_id, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [userId, verifyHash(userId, code), VERIFY_CODE_TTL_HOURS],
    );
  });
  void sendMail(
    user.email,
    'StudyHub – vérifiez votre adresse e-mail / verify your e-mail',
    `Bonjour ${user.name},\n\nVotre code de vérification StudyHub est : ${code}\nIl expire dans ${VERIFY_CODE_TTL_HOURS} heures.\n\nYour StudyHub verification code is: ${code}`,
  );
}

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  h(async (req, res) => {
    const body = parse(registerSchema, req.body);
    body.name = filterText(body.name, 'name');
    const existing = await pool.query(
      'SELECT (username = $1::citext) AS u, (email = $2::citext) AS e FROM users WHERE username = $1::citext OR email = $2::citext',
      [body.username, body.email],
    );
    if (existing.rows.some((r) => r.e)) throw conflict('Email already in use', { field: 'email' });
    if (existing.rows.some((r) => r.u)) throw conflict('Username already taken', { field: 'username' });
    const passwordHash = await hashPassword(body.password);
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, email, password_hash, university, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [body.name, body.username, body.email, passwordHash, body.university ?? null, body.role ?? 'student'],
    );
    const id = rows[0].id as string;
    await sendVerificationCode(id);
    const tokens = await issueTokens(id, req.get('user-agent'));
    res.status(201).json({ user: await loadMe(pool, id), ...tokens });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  h(async (req, res) => {
    const { identifier, password } = parse(loginSchema, req.body);
    const ident = identifier.replace(/^@/, '');
    const { rows } = await pool.query(
      'SELECT id, password_hash, suspended_at, suspended_reason FROM users WHERE email = $1::citext OR username = $1::citext LIMIT 1',
      [ident],
    );
    const row = rows[0];
    const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) throw unauthorized('Invalid credentials');
    if (row.suspended_at) throw suspended(row.suspended_reason);
    const tokens = await issueTokens(row.id, req.get('user-agent'));
    res.json({ user: await loadMe(pool, row.id), ...tokens });
  }),
);

authRouter.post(
  '/refresh',
  authLimiter,
  h(async (req, res) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    const s = await pool.query(
      'SELECT u.suspended_at, u.suspended_reason FROM refresh_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1',
      [sha256(refreshToken)],
    );
    if (s.rows[0]?.suspended_at) throw suspended(s.rows[0].suspended_reason);
    res.json(await rotateRefreshToken(refreshToken, req.get('user-agent')));
  }),
);

authRouter.post(
  '/logout',
  h(async (req, res) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    await revokeRefreshToken(refreshToken);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  h(async (req, res) => {
    res.json(await loadMe(pool, me(req).id));
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  h(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1::citext', [email]);
    const user = rows[0];
    if (user) {
      const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      await tx(async (c) => {
        await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await c.query(
          `INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
          [user.id, codeHash(user.email, code), RESET_CODE_TTL_MIN],
        );
      });
      // Not awaited: response time must not reveal whether the email exists.
      void sendMail(
        user.email,
        'StudyHub – code de réinitialisation / password reset code',
        `Bonjour ${user.name},\n\nVotre code de réinitialisation StudyHub est : ${code}\nIl expire dans ${RESET_CODE_TTL_MIN} minutes.\n\nYour StudyHub password reset code is: ${code} (valid ${RESET_CODE_TTL_MIN} minutes).\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
      );
    }
    res.status(204).end();
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  h(async (req, res) => {
    const body = parse(
      z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'), newPassword: passwordSchema }),
      req.body,
    );
    const invalid = badRequest('Invalid or expired code');
    const newHash = await hashPassword(body.newPassword);
    const ok = await tx(async (c) => {
      const row = (
        await c.query(
          `SELECT r.id, r.code_hash, r.attempts, u.id AS user_id, u.email
             FROM password_resets r JOIN users u ON u.id = r.user_id
            WHERE u.email = $1::citext AND r.used_at IS NULL AND r.expires_at > now()
            ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE OF r`,
          [body.email],
        )
      ).rows[0];
      if (!row || row.attempts >= RESET_MAX_ATTEMPTS) return false;
      const a = Buffer.from(row.code_hash);
      const b = Buffer.from(codeHash(row.email, body.code));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        await c.query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1', [row.id]);
        return false;
      }
      await c.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [row.id]);
      await c.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [row.user_id, newHash]);
      await revokeAllUserTokens(c, row.user_id);
      return true;
    });
    if (!ok) throw invalid;
    res.status(204).end();
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  h(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }), req.body);
    const { id } = me(req);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
    if (!(await bcrypt.compare(body.currentPassword, rows[0].password_hash))) {
      throw badRequest('Current password is incorrect', [{ path: 'currentPassword', message: 'Incorrect password' }]);
    }
    await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, await hashPassword(body.newPassword)]);
    res.status(204).end();
  }),
);

authRouter.post(
  '/verify-email',
  authLimiter,
  requireAuth,
  h(async (req, res) => {
    const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits') }), req.body ?? {});
    const { id } = me(req);
    const already = await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [id]);
    if (already.rows[0].email_verified_at) {
      res.json(await loadMe(pool, id));
      return;
    }
    const ok = await tx(async (c) => {
      const row = (
        await c.query(
          `SELECT id, code_hash, attempts FROM email_verifications
            WHERE user_id = $1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!row || row.attempts >= RESET_MAX_ATTEMPTS) return false;
      const a = Buffer.from(row.code_hash);
      const b = Buffer.from(verifyHash(id, code));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        await c.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1', [row.id]);
        return false;
      }
      await c.query('UPDATE email_verifications SET used_at = now() WHERE id = $1', [row.id]);
      await c.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [id]);
      return true;
    });
    if (!ok) throw badRequest('Invalid or expired code', [{ path: 'code', message: 'Invalid or expired code' }]);
    res.json(await loadMe(pool, id));
  }),
);

authRouter.post(
  '/resend-verification',
  authLimiter,
  requireAuth,
  h(async (req, res) => {
    const { id } = me(req);
    const r = await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [id]);
    if (r.rows[0].email_verified_at) throw conflict('E-mail already verified');
    await sendVerificationCode(id);
    res.status(204).end();
  }),
);
