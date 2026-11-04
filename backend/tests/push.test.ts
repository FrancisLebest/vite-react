import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { configurePush, flushPush } from '../src/services/push.js';
import { api, createTextPost, registerUser, resetDb, type TestUser } from './helpers.js';

type Captured = { path: string; auth?: string; body: any };
let mock: http.Server;
let base: string;
const requests: Captured[] = [];
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  await resetDb();
  mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/token') {
        const assertion = new URLSearchParams(raw).get('assertion')!;
        const claims = jwt.verify(assertion, publicKey.export({ type: 'spki', format: 'pem' }), { algorithms: ['RS256'] }) as any;
        requests.push({ path: req.url, body: claims });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ access_token: 'mock-access-token', expires_in: 3600 }));
        return;
      }
      const body = JSON.parse(raw);
      requests.push({ path: req.url!, auth: req.headers.authorization, body });
      if (body.message.token === 'bad-token') {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } }),
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: 'projects/test-proj/messages/1' }));
    });
  });
  await new Promise<void>((r) => mock.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  configurePush({
    projectId: 'test-proj',
    apiUrl: base,
    credentials: {
      client_email: 'fcm@test-proj.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      token_uri: `${base}/token`,
    },
  });
  alice = await registerUser({ name: 'Alice Push', username: 'alice_push' });
  bob = await registerUser({ name: 'Bob Push', username: 'bob_push' });
  await api().post('/api/v1/users/me/push-token').set(bob.auth).send({ token: 'bob-device-1', platform: 'android' });
});

beforeEach(() => {
  requests.length = 0;
});

afterAll(async () => {
  configurePush(null);
  await new Promise((r) => mock.close(r));
});

const sends = () => requests.filter((r) => r.path.includes('messages:send'));

describe('push notifications (FCM HTTP v1)', () => {
  it('sends a push on like with OAuth service-account token', async () => {
    const post = await createTextPost(bob, 'push me');
    await api().post(`/api/v1/posts/${post.id}/like`).set(alice.auth);
    await flushPush();
    const token = requests.find((r) => r.path === '/token');
    if (token) {
      expect(token.body).toMatchObject({ iss: 'fcm@test-proj.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: `${base}/token` });
    }
    const [send] = sends();
    expect(send!.path).toBe('/v1/projects/test-proj/messages:send');
    expect(send!.auth).toBe('Bearer mock-access-token');
    expect(send!.body.message).toMatchObject({
      token: 'bob-device-1',
      notification: { title: 'Alice Push', body: 'liked your post' },
      data: { type: 'like', postId: post.id, actorId: alice.user.id },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    expect(Object.values(send!.body.message.data).every((v) => typeof v === 'string')).toBe(true);
  });

  it('sends for comment, follow and messages, but not when the conversation is muted', async () => {
    const post = await createTextPost(bob, 'comment me');
    await api().post(`/api/v1/posts/${post.id}/comments`).set(alice.auth).send({ text: 'Top !' });
    await api().post(`/api/v1/users/${bob.user.id}/follow`).set(alice.auth);
    const dm = await api().post('/api/v1/conversations').set(alice.auth).send({ userId: bob.user.id });
    await api().post(`/api/v1/conversations/${dm.body.id}/messages`).set(alice.auth).send({ text: 'Salut' });
    await flushPush();
    const types = sends().map((s) => s.body.message.data.type);
    expect(types).toEqual(['comment', 'follow', 'message']);
    const msg = sends().find((s) => s.body.message.data.type === 'message')!;
    expect(msg.body.message).toMatchObject({ notification: { title: 'Alice Push', body: 'Salut' }, data: { conversationId: dm.body.id } });

    requests.length = 0;
    await api().patch(`/api/v1/conversations/${dm.body.id}`).set(bob.auth).send({ muted: true });
    await api().post(`/api/v1/conversations/${dm.body.id}/messages`).set(alice.auth).send({ text: 'Encore' });
    await flushPush();
    expect(sends()).toHaveLength(0);
  });

  it('respects notification preferences (type switch and push master switch)', async () => {
    await api().put('/api/v1/users/me/settings').set(bob.auth).send({ notifications: { likes: false } });
    const post = await createTextPost(bob, 'no like pings');
    const before = (await api().get('/api/v1/notifications/unread-count').set(bob.auth)).body.count;
    await api().post(`/api/v1/posts/${post.id}/like`).set(alice.auth);
    await flushPush();
    expect(sends()).toHaveLength(0);
    expect((await api().get('/api/v1/notifications/unread-count').set(bob.auth)).body.count).toBe(before);

    await api().put('/api/v1/users/me/settings').set(bob.auth).send({ notifications: { likes: true, push: false } });
    await api().post(`/api/v1/posts/${post.id}/repost`).set(alice.auth);
    await flushPush();
    expect(sends()).toHaveLength(0);
    expect((await api().get('/api/v1/notifications/unread-count').set(bob.auth)).body.count).toBe(before + 1);
    await api().put('/api/v1/users/me/settings').set(bob.auth).send({ notifications: { push: true } });
  });

  it('deletes invalid tokens', async () => {
    await api().post('/api/v1/users/me/push-token').set(bob.auth).send({ token: 'bad-token', platform: 'ios' });
    const post = await createTextPost(bob, 'invalid token');
    await api().post(`/api/v1/posts/${post.id}/like`).set(alice.auth);
    await flushPush();
    expect(sends().map((s) => s.body.message.token).sort()).toEqual(['bad-token', 'bob-device-1']);
    const { rows } = await pool.query('SELECT token FROM push_tokens WHERE user_id = $1 ORDER BY token', [bob.user.id]);
    expect(rows.map((r) => r.token)).toEqual(['bob-device-1']);
  });

  it('is a silent no-op when FCM is not configured', async () => {
    configurePush(null);
    const post = await createTextPost(bob, 'offline');
    const res = await api().post(`/api/v1/posts/${post.id}/like`).set(alice.auth);
    await flushPush();
    expect(res.status).toBe(200);
    expect(requests).toHaveLength(0);
  });
});
