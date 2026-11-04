/**
 * Grants (or revokes) administrator rights:
 *   npm run make-admin -- someone@example.com
 *   npm run make-admin -- --revoke someone@example.com
 */
import { pool } from '../db/pool.js';

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run make-admin -- [--revoke] <email>');
  const r = await pool.query('UPDATE users SET is_admin = $2 WHERE email = $1::citext RETURNING username', [email, !revoke]);
  if (!r.rowCount) throw new Error(`No user with email ${email}`);
  // eslint-disable-next-line no-console
  console.log(`@${r.rows[0].username} is ${revoke ? 'no longer' : 'now'} an administrator`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err.message ?? err);
    await pool.end();
    process.exit(1);
  });
