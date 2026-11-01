import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { attachSocket, closeSocket } from '../src/realtime/socket.js';
import { api, app, createTextPost, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let server: http.Server;
let url: string;
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
const sockets: Socket[] = [];

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { path: '/socket.io', auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', (err) => reject(err));
  });
}

function waitFor<T = any>(s: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    s.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

beforeAll(async () => {
  await resetDb();
  server = http.createServer(app);
  await attachSocket(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  alice = await registerUser({ name: 'Alice', username: 'alice' });
  bob = await registerUser({ name: 'Bob', username: 'bob' });
  carol = await registerUser({ name: 'Carol', username: 'carol' });
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await closeSocket();
  await new Promise((r) => server.close(r));
});

describe('socket auth', () => {
  it('rejects invalid tokens with UNAUTHORIZED', async () => {
    await expect(connect('bad-token')).rejects.toThrow('UNAUTHORIZED');
  });
});

describe('direct messages', () => {
  let convId: string;

  it('gets or creates a DM', async () => {
    const res = await api().post('/api/v1/conversations').set(alice.auth).send({ userId: bob.user.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isGroup: false, title: 'Bob', lastMessage: null, unreadCount: 0, muted: false });
    expect(res.body.participants.map((p: any) => p.id)).toEqual([bob.user.id]);
    convId = res.body.id;
    const again = await api().post('/api/v1/conversations').set(bob.auth).send({ userId: alice.user.id });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(convId);
    expect(again.body.title).toBe('Alice');
    expectError(await api().post('/api/v1/conversations').set(alice.auth).send({ userId: alice.user.id }), 400, 'VALIDATION_ERROR');
    // empty DMs are not listed yet
    expect((await api().get('/api/v1/conversations').set(alice.auth)).body.items).toEqual([]);
  });

  it('delivers message:new over Socket.IO, tracks unread and read receipts', async () => {
    const bobSocket = await connect(bob.accessToken);
    const aliceSocket = await connect(alice.accessToken);
    const incoming = waitFor(bobSocket, 'message:new');
    const sent = await api().post(`/api/v1/conversations/${convId}/messages`).set(alice.auth).send({ text: 'Salut Bob !' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ conversationId: convId, text: 'Salut Bob !', media: null, sender: { id: alice.user.id } });
    const evt = await incoming;
    expect(evt.message).toMatchObject({ id: sent.body.id, text: 'Salut Bob !', conversationId: convId });

    await api().post(`/api/v1/conversations/${convId}/messages`).set(alice.auth).send({ text: 'Tu as les notes ?' });
    expect((await api().get('/api/v1/conversations/unread-count').set(bob.auth)).body).toEqual({ count: 1 });
    expect((await api().get('/api/v1/conversations/unread-count').set(alice.auth)).body).toEqual({ count: 0 });

    const list = await api().get('/api/v1/conversations').set(bob.auth);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: convId, unreadCount: 2, lastMessage: { text: 'Tu as les notes ?' } });

    const msgs = await api().get(`/api/v1/conversations/${convId}/messages?limit=1`).set(bob.auth);
    expect(msgs.body.items[0].text).toBe('Tu as les notes ?'); // newest first
    const older = await api().get(`/api/v1/conversations/${convId}/messages?limit=1&cursor=${msgs.body.nextCursor}`).set(bob.auth);
    expect(older.body.items[0].text).toBe('Salut Bob !');

    const readEvt = waitFor(aliceSocket, 'conversation:read');
    expect((await api().post(`/api/v1/conversations/${convId}/read`).set(bob.auth)).status).toBe(204);
    expect(await readEvt).toEqual({ conversationId: convId, userId: bob.user.id });
    expect((await api().get('/api/v1/conversations/unread-count').set(bob.auth)).body).toEqual({ count: 0 });
    expect((await api().get(`/api/v1/conversations/${convId}`).set(bob.auth)).body.unreadCount).toBe(0);

    // typing relay
    const typing = waitFor(aliceSocket, 'typing');
    bobSocket.emit('typing', { conversationId: convId });
    expect(await typing).toMatchObject({ conversationId: convId, user: { id: bob.user.id } });
  });

  it('sends media messages and supports mute', async () => {
    const res = await api().post(`/api/v1/conversations/${convId}/messages`).set(bob.auth).field('text', 'Voilà').attach('media', fixture('image.png'));
    expect(res.status).toBe(201);
    expect(res.body.media).toMatchObject({ kind: 'image' });
    expectError(await api().post(`/api/v1/conversations/${convId}/messages`).set(bob.auth).send({ text: '' }), 400, 'VALIDATION_ERROR');
    const m = await api().patch(`/api/v1/conversations/${convId}`).set(bob.auth).send({ muted: true });
    expect(m.body.muted).toBe(true);
    expectError(await api().patch(`/api/v1/conversations/${convId}`).set(bob.auth).send({ title: 'x' }), 400, 'VALIDATION_ERROR');
  });

  it('only participants can read or post', async () => {
    expectError(await api().get(`/api/v1/conversations/${convId}`).set(carol.auth), 403, 'FORBIDDEN');
    expectError(await api().get(`/api/v1/conversations/${convId}/messages`).set(carol.auth), 403, 'FORBIDDEN');
    expectError(await api().post(`/api/v1/conversations/${convId}/messages`).set(carol.auth).send({ text: 'hi' }), 403, 'FORBIDDEN');
    expectError(await api().get('/api/v1/conversations/00000000-0000-4000-8000-000000000000').set(carol.auth), 404, 'NOT_FOUND');
  });

  it('blocks DMs after a block', async () => {
    await api().post(`/api/v1/users/${alice.user.id}/block`).set(bob.auth);
    expectError(await api().post(`/api/v1/conversations/${convId}/messages`).set(alice.auth).send({ text: 'still there?' }), 403, 'FORBIDDEN');
    expect((await api().get('/api/v1/conversations').set(alice.auth)).body.items).toEqual([]);
    await api().delete(`/api/v1/users/${alice.user.id}/block`).set(bob.auth);
  });
});

describe('groups', () => {
  it('creates a group and renames it', async () => {
    const res = await api().post('/api/v1/conversations').set(alice.auth).send({ title: 'Projet L3', memberIds: [bob.user.id, carol.user.id] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isGroup: true, title: 'Projet L3', avatarUrl: null });
    expect(res.body.participants).toHaveLength(2);
    const carolSocket = await connect(carol.accessToken);
    const got = waitFor(carolSocket, 'message:new');
    await api().post(`/api/v1/conversations/${res.body.id}/messages`).set(bob.auth).send({ text: 'Hello team' });
    expect((await got).message.text).toBe('Hello team');
    const r = await api().patch(`/api/v1/conversations/${res.body.id}`).set(carol.auth).send({ title: 'Projet final' });
    expect(r.body.title).toBe('Projet final');
    expectError(await api().post('/api/v1/conversations').set(alice.auth).send({ title: 'x', memberIds: [] }), 400, 'VALIDATION_ERROR');
  });
});

describe('realtime notifications', () => {
  it('emits notification:new on like', async () => {
    const post = await createTextPost(carol, 'realtime');
    const carolSocket = await connect(carol.accessToken);
    const got = waitFor(carolSocket, 'notification:new');
    await api().post(`/api/v1/posts/${post.id}/like`).set(alice.auth);
    const evt = await got;
    expect(evt.notification).toMatchObject({ type: 'like', text: 'liked your post', actor: { id: alice.user.id }, post: { id: post.id, type: 'post', thumbnailUrl: null } });
  });
});

describe('reports', () => {
  it('creates reports and validates targets', async () => {
    const post = await createTextPost(carol, 'report me');
    const r = await api().post('/api/v1/reports').set(alice.auth).send({ targetType: 'post', targetId: post.id, reason: 'spam', details: 'pub' });
    expect(r.status).toBe(201);
    expectError(await api().post('/api/v1/reports').set(alice.auth).send({ targetType: 'post', targetId: post.id, reason: 'boring' }), 400, 'VALIDATION_ERROR');
    expectError(await api().post('/api/v1/reports').set(alice.auth).send({ targetType: 'user', targetId: '00000000-0000-4000-8000-000000000000', reason: 'other' }), 404, 'NOT_FOUND');
  });
});
