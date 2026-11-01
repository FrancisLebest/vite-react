import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

export const app = createApp();
export const api = () => request(app);
export const FIXTURES = path.resolve('tmp/fixtures');
export const fixture = (name: string) => path.join(FIXTURES, name);

let counter = 0;

export type TestUser = {
  user: any;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
  password: string;
};

export async function registerUser(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  const body = {
    name: `User ${suffix}`,
    username: `user_${suffix}`,
    email: `user_${suffix}@example.com`,
    password: 'password123',
    university: 'Université Paris Cité',
    ...overrides,
  };
  const res = await api().post('/api/v1/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    user: res.body.user,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
    password: body.password as string,
  };
}

export async function resetDb() {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export async function createTextPost(u: TestUser, text: string, extra: Record<string, unknown> = {}) {
  const res = await api().post('/api/v1/posts').set(u.auth).send({ type: 'post', text, category: 'study-tips', ...extra });
  if (res.status !== 201) throw new Error(`post failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export function expectError(res: request.Response, status: number, code: string) {
  if (res.status !== status || res.body?.error?.code !== code) {
    throw new Error(`Expected ${status} ${code}, got ${res.status} ${JSON.stringify(res.body)}`);
  }
}
