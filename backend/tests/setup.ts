import { afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';

afterAll(async () => {
  await pool.end();
});
