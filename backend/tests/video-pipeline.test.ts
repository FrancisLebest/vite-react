import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.VIDEO_TRANSCODE = 'true';
});

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { pool } from '../src/db/pool.js';
import { attachSocket, closeSocket } from '../src/realtime/socket.js';
import { enqueueVideo, waitForVideoQueueIdle } from '../src/media/queue.js';
import { api, app, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let server: http.Server;
let url: string;
let author: TestUser;
let other: TestUser;
let socket: Socket;

const localFile = (u: string) => path.resolve('tmp/test-uploads', u.replace('http://test.local/uploads/', ''));

function probe(file: string) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]).toString());
}

beforeAll(async () => {
  await resetDb();
  server = http.createServer(app);
  await attachSocket(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  author = await registerUser({ username: 'vid_author' });
  other = await registerUser({ username: 'vid_viewer' });
  await api().post(`/api/v1/users/${author.user.id}/follow`).set(other.auth);
  socket = await new Promise<Socket>((resolve, reject) => {
    const s = ioClient(url, { auth: { token: author.accessToken }, transports: ['websocket'], reconnection: false, forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
});

afterAll(async () => {
  socket?.close();
  await closeSocket();
  await new Promise((r) => server.close(r));
});

describe('video pipeline (in-process queue)', () => {
  it('transcodes an HEVC upload to H.264/AAC 720p, hidden until ready, emits post:ready', async () => {
    const ready = new Promise<any>((resolve) => socket.once('post:ready', resolve));
    const res = await api()
      .post('/api/v1/posts')
      .set(author.auth)
      .field('type', 'video')
      .field('text', 'Cours en HEVC #pipeline')
      .attach('media', fixture('hevc.mov'), { contentType: 'video/quicktime' });
    expect(res.status).toBe(201);
    const post = res.body;
    expect(post.status).toBe('processing');
    expect(post.media.kind).toBe('video');
    const originalFile = localFile(post.media.url);

    // While processing: only the author sees it (the job may already be done on a fast machine).
    const stillProcessing = (await pool.query('SELECT status FROM posts WHERE id = $1', [post.id])).rows[0].status === 'processing';
    if (stillProcessing) {
      expectError(await api().get(`/api/v1/posts/${post.id}`).set(other.auth), 404, 'NOT_FOUND');
      const feed = await api().get('/api/v1/feed?tab=following').set(other.auth);
      expect(feed.body.items.map((p: any) => p.id)).not.toContain(post.id);
      expect((await api().get(`/api/v1/posts/${post.id}`).set(author.auth)).body.status).toBe('processing');
    }

    const evt = await ready;
    await waitForVideoQueueIdle();
    expect(evt.post).toMatchObject({ id: post.id, status: 'ready' });

    const final = (await api().get(`/api/v1/posts/${post.id}`).set(other.auth)).body;
    expect(final.status).toBe('ready');
    expect(final.media.url).toMatch(/\/uploads\/videos\/.+\.mp4$/);
    expect(final.media.thumbnailUrl).toMatch(/\/uploads\/thumbnails\/.+\.jpg$/);
    expect(final.media).toMatchObject({ width: 960, height: 720 });
    expect(final.media.durationSec).toBeGreaterThan(1.5);

    const info = probe(localFile(final.media.url));
    const v = info.streams.find((s: any) => s.codec_type === 'video');
    const a = info.streams.find((s: any) => s.codec_type === 'audio');
    expect(v.codec_name).toBe('h264');
    expect(v.pix_fmt).toBe('yuv420p');
    expect([v.width, v.height]).toEqual([960, 720]);
    expect(a.codec_name).toBe('aac');
    // faststart: moov atom before mdat
    const head = fs.readFileSync(localFile(final.media.url)).subarray(0, 4096).toString('latin1');
    expect(head.indexOf('moov')).toBeGreaterThan(-1);
    expect(fs.existsSync(localFile(final.media.thumbnailUrl))).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(originalFile)).toBe(false);

    const feed = await api().get('/api/v1/feed?tab=following').set(other.auth);
    expect(feed.body.items.map((p: any) => p.id)).toContain(post.id);
  });

  it('marks the post failed and emits post:failed when processing fails', async () => {
    const failed = new Promise<any>((resolve) => socket.once('post:failed', resolve));
    const r = await pool.query(
      `INSERT INTO posts (author_id, type, text, category, media_kind, media_key, source_key, status)
       VALUES ($1, 'video', 'broken', 'other', 'video', 'originals/missing.mov', 'originals/missing.mov', 'processing') RETURNING id`,
      [author.user.id],
    );
    const id = r.rows[0].id;
    await enqueueVideo(id);
    await waitForVideoQueueIdle();
    expect(await failed).toMatchObject({ postId: id, reason: expect.any(String) });
    const p = await api().get(`/api/v1/posts/${id}`).set(author.auth);
    expect(p.body.status).toBe('failed');
    expectError(await api().get(`/api/v1/posts/${id}`).set(other.auth), 404, 'NOT_FOUND');
    expect((await api().delete(`/api/v1/posts/${id}`).set(author.auth)).status).toBe(204);
  });

  it('still rejects non-video files synchronously', async () => {
    expectError(
      await api().post('/api/v1/posts').set(author.auth).field('type', 'video').attach('media', fixture('fake.mp4'), { contentType: 'video/mp4' }),
      400,
      'VALIDATION_ERROR',
    );
  });
});
