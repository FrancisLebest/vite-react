import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.VIDEO_TRANSCODE = 'true';
  process.env.REDIS_URL = 'redis://127.0.0.1:6391';
});

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { closeQueue, startBullWorker } from '../src/media/queue.js';
import { api, fixture, registerUser, resetDb } from './helpers.js';

const hasRedis = spawnSync('which', ['redis-server']).status === 0;
let redis: ChildProcess | null = null;
let worker: { close(): Promise<void> } | null = null;

beforeAll(async () => {
  if (!hasRedis) return;
  await resetDb();
  redis = spawn('redis-server', ['--port', '6391', '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    if (spawnSync('redis-cli', ['-p', '6391', 'ping']).stdout?.toString().includes('PONG')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  worker = await startBullWorker();
});

afterAll(async () => {
  await worker?.close();
  await closeQueue();
  redis?.kill();
});

describe.skipIf(!hasRedis)('video pipeline (BullMQ + Redis)', () => {
  it('enqueues the job in Redis and the worker publishes the post', async () => {
    const u = await registerUser({ username: 'bull_author' });
    const res = await api().post('/api/v1/posts').set(u.auth).field('type', 'video').attach('media', fixture('tiny.mp4'), { contentType: 'video/mp4' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('processing');
    let status = 'processing';
    for (let i = 0; i < 150 && status === 'processing'; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      status = (await pool.query('SELECT status FROM posts WHERE id = $1', [res.body.id])).rows[0].status;
    }
    expect(status).toBe('ready');
    const post = await api().get(`/api/v1/posts/${res.body.id}`).set(u.auth);
    expect(post.body.media.url).toMatch(/\/videos\/.+\.mp4$/);
    expect(post.body.media).toMatchObject({ width: 320, height: 240 });
  });
});
