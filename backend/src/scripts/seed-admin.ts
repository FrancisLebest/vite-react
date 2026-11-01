/**
 * Creates (or updates) a single verified account from environment variables:
 *   ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME (optional), ADMIN_ROLE (optional), ADMIN_UNIVERSITY (optional)
 * No other data is created.
 */
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !username || !password) throw new Error('ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_PASSWORD are required');
  if (!/^[a-z0-9._]{3,30}$/.test(username)) throw new Error('ADMIN_USERNAME must match [a-z0-9._]{3,30}');
  if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  const role = process.env.ADMIN_ROLE ?? 'creator';
  const hash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  const r = await pool.query(
    `INSERT INTO users (email, username, name, password_hash, role, university, verified)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, verified = true
     RETURNING id`,
    [email, username, process.env.ADMIN_NAME ?? 'StudyHub', hash, role, process.env.ADMIN_UNIVERSITY ?? null],
  );
  // eslint-disable-next-line no-console
  console.log(`Verified account ready: @${username} (${r.rows[0].id})`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err.message ?? err);
    await pool.end();
    process.exit(1);
  });
