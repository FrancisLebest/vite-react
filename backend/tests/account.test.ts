import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, createTextPost, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  await resetDb();
  alice = await registerUser({ username: 'alice' });
  bob = await registerUser({ username: 'bob' });
});

describe('delete account', () => {
  it('removes the user and all their content, keeping counters consistent', async () => {
    const bobPost = await createTextPost(bob, 'Bob post');
    const video = await api().post('/api/v1/posts').set(alice.auth).field('type', 'video').attach('media', fixture('tiny.mp4'));
    expect(video.status).toBe(201);
    const videoFile = path.resolve('tmp/test-uploads', video.body.media.url.replace('http://test.local/uploads/', ''));
    expect(fs.existsSync(videoFile)).toBe(true);

    await api().post(`/api/v1/users/${bob.user.id}/follow`).set(alice.auth);
    await api().post(`/api/v1/users/${alice.user.id}/follow`).set(bob.auth);
    await api().post(`/api/v1/posts/${bobPost.id}/like`).set(alice.auth);
    await api().post(`/api/v1/posts/${bobPost.id}/bookmark`).set(alice.auth);
    await api().post(`/api/v1/posts/${bobPost.id}/view`).set(alice.auth);
    await api().post(`/api/v1/posts/${bobPost.id}/comments`).set(alice.auth).send({ text: 'nice' });
    const comm = await api().post('/api/v1/communities').set(bob.auth).send({ name: 'Bob club', kind: 'topic', icon: 'apps-outline', color: '#111111' });
    await api().post(`/api/v1/communities/${comm.body.id}/join`).set(alice.auth);
    const aliceComm = await api().post('/api/v1/communities').set(alice.auth).send({ name: 'Alice club', kind: 'topic', icon: 'apps-outline', color: '#111111' });
    const dm = await api().post('/api/v1/conversations').set(alice.auth).send({ userId: bob.user.id });
    await api().post(`/api/v1/conversations/${dm.body.id}/messages`).set(alice.auth).send({ text: 'bye' });

    let b = (await api().get(`/api/v1/posts/${bobPost.id}`).set(bob.auth)).body;
    expect(b).toMatchObject({ likeCount: 1, bookmarkCount: 1, viewCount: 1, commentCount: 1 });

    expect((await api().delete('/api/v1/users/me').set(alice.auth)).status).toBe(204);

    b = (await api().get(`/api/v1/posts/${bobPost.id}`).set(bob.auth)).body;
    expect(b).toMatchObject({ likeCount: 0, bookmarkCount: 0, viewCount: 0, commentCount: 0 });
    const bobMe = (await api().get('/api/v1/auth/me').set(bob.auth)).body;
    expect(bobMe).toMatchObject({ followerCount: 0, followingCount: 0, postCount: 1 });
    expect((await api().get(`/api/v1/communities/${comm.body.id}`).set(bob.auth)).body.memberCount).toBe(1);
    expectError(await api().get(`/api/v1/communities/${aliceComm.body.id}`).set(bob.auth), 404, 'NOT_FOUND');
    expectError(await api().get(`/api/v1/posts/${video.body.id}`).set(bob.auth), 404, 'NOT_FOUND');
    expectError(await api().get(`/api/v1/users/${alice.user.id}`).set(bob.auth), 404, 'NOT_FOUND');
    expect((await api().get(`/api/v1/conversations/${dm.body.id}/messages`).set(bob.auth)).body.items).toEqual([]);
    expect((await api().get('/api/v1/notifications').set(bob.auth)).body.items).toEqual([]);

    // tokens no longer usable, login impossible
    expectError(await api().get('/api/v1/auth/me').set(alice.auth), 401, 'UNAUTHORIZED');
    expectError(await api().post('/api/v1/auth/refresh').send({ refreshToken: alice.refreshToken }), 401, 'UNAUTHORIZED');
    expectError(await api().post('/api/v1/auth/login').send({ identifier: 'alice', password: alice.password }), 401, 'UNAUTHORIZED');

    const leftovers = await pool.query(
      `SELECT (SELECT count(*) FROM posts WHERE author_id = $1) + (SELECT count(*) FROM follows WHERE follower_id = $1 OR following_id = $1)
            + (SELECT count(*) FROM post_likes WHERE user_id = $1) + (SELECT count(*) FROM messages WHERE sender_id = $1)
            + (SELECT count(*) FROM refresh_tokens WHERE user_id = $1) AS n`,
      [alice.user.id],
    );
    expect(Number(leftovers.rows[0].n)).toBe(0);
    // media removed from storage (async best-effort)
    await new Promise((r) => setTimeout(r, 200));
    expect(fs.existsSync(videoFile)).toBe(false);
  });
});
