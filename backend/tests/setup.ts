import { afterAll } from 'vitest';

// Dynamic import: test files may adjust process.env (vi.hoisted) before the config module loads.
afterAll(async () => {
  const { pool } = await import('../src/db/pool.js');
  await pool.end();
});
