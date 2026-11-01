import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'));

export type Db = pg.Pool | pg.PoolClient;

/** Run `fn` inside a transaction. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Tiny helper to build parameterised SQL incrementally. */
export class Q {
  params: unknown[] = [];
  where: string[] = [];
  /** Add a parameter and return its placeholder ($n). */
  p(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
  and(cond: string): this {
    this.where.push(cond);
    return this;
  }
  whereSql(prefix = 'WHERE'): string {
    return this.where.length ? `${prefix} ${this.where.join(' AND ')}` : '';
  }
}

export async function one<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await db.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T = any>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}
