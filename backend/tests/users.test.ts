import { beforeAll, describe, expect, it } from 'vitest';
import { api, createTextPost, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

beforeAll(async () => {
  await resetDb();
  alice = await registerUser({ name: 'Alice Durand', username: 'alice', university: 'Sorbonne Université', role: 'professor' });
  bob = await registerUser({ name: 'Bob Leroy', username: 'bob', university: 'Sorbonne Université' });
  carol = await registerUser({ name: 'Carol Petit', username: 'carol', university: 'Université de Lyon' });
});

describe('users & follows', () => {
  it('follows with notification, counts, lists and mutuals', async () => {
    expectError(await api().post(`/api/v1/users/${alice.user.id}/follow`).set(alice.auth), 400, 'VALIDATION_ERROR');
    const f = await api().post(`/api/v1/users/${alice.user.id}/follow`).set(bob.auth);
    expect(f.body).toMatchObject({ isFollowing: true, followerCount: 1 });
    // idempotent
    expect((await api().post(`/api/v1/users/${alice.user.id}/follow`).set(bob.auth)).body.followerCount).toBe(1);

    const n = await api().get('/api/v1/notifications').set(alice.auth);
    expect(n.body.items).toHaveLength(1);
    expect(n.body.items[0]).toMatchObject({ type: 'follow', text: 'started following you', actor: { id: bob.user.id, isFollowing: false }, post: null, community: null, read: false });
    expect((await api().get('/api/v1/notifications/unread-count').set(alice.auth)).body).toEqual({ count: 1 });

    // carol follows bob; carol's view of alice: mutualCount = 1 (bob)
    await api().post(`/api/v1/users/${bob.user.id}/follow`).set(carol.auth);
    const profile = await api().get('/api/v1/users/alice').set(carol.auth);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({ id: alice.user.id, followerCount: 1, mutualCount: 1, isMe: false, isFollowing: false, isBlocked: false, role: 'professor' });
    expect(profile.body.email).toBeUndefined();
    const byId = await api().get(`/api/v1/users/${alice.user.id}`).set(bob.auth);
    expect(byId.body.isFollowing).toBe(true);
    expectError(await api().get('/api/v1/users/ghost_user').set(bob.auth), 404, 'NOT_FOUND');

    const followers = await api().get(`/api/v1/users/${alice.user.id}/followers`).set(carol.auth);
    expect(followers.body).toEqual({ items: [expect.objectContaining({ id: bob.user.id, isFollowing: true })], nextCursor: null });
    const following = await api().get(`/api/v1/users/${carol.user.id}/following`).set(carol.auth);
    expect(following.body.items.map((u: any) => u.id)).toEqual([bob.user.id]);

    const un = await api().delete(`/api/v1/users/${alice.user.id}/follow`).set(bob.auth);
    expect(un.body).toMatchObject({ isFollowing: false, followerCount: 0 });
    expect((await api().get('/api/v1/notifications/unread-count').set(alice.auth)).body).toEqual({ count: 0 });
  });

  it('lists directory, suggestions and universities', async () => {
    const dir = await api().get('/api/v1/users?q=dur').set(bob.auth);
    expect(dir.body.items.map((u: any) => u.username)).toEqual(['alice']);
    expect(dir.body.items[0]).toHaveProperty('followerCount');
    const profs = await api().get('/api/v1/users?role=professor').set(bob.auth);
    expect(profs.body.items.map((u: any) => u.username)).toEqual(['alice']);
    const lyon = await api().get('/api/v1/users?university=lyon&sort=recent').set(bob.auth);
    expect(lyon.body.items.map((u: any) => u.username)).toEqual(['carol']);
    const page = await api().get('/api/v1/users?limit=1').set(bob.auth);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toBeTypeOf('string');

    const sugg = await api().get('/api/v1/users/suggested?limit=5').set(bob.auth);
    expect(Array.isArray(sugg.body)).toBe(true);
    expect(sugg.body.map((u: any) => u.username)).not.toContain('bob');
    expect(sugg.body[0].username).toBe('alice'); // same university first

    const unis = await api().get('/api/v1/universities?q=sorb');
    expect(unis.body).toEqual(['Sorbonne Université']);
  });

  it('updates profile and avatar', async () => {
    const patch = await api().patch('/api/v1/users/me').set(carol.auth).send({ bio: 'Étudiante en bio', name: 'Carol P.', username: 'carol.p' });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ bio: 'Étudiante en bio', name: 'Carol P.', username: 'carol.p', isMe: true, email: carol.user.email });
    expectError(await api().patch('/api/v1/users/me').set(carol.auth).send({ username: 'alice' }), 409, 'CONFLICT');
    expectError(await api().patch('/api/v1/users/me').set(carol.auth).send({ role: 'admin' }), 400, 'VALIDATION_ERROR');
    expectError(await api().patch('/api/v1/users/me').set(carol.auth).send({ email: 'x@y.z' }), 400, 'VALIDATION_ERROR');

    const av = await api().post('/api/v1/users/me/avatar').set(carol.auth).attach('avatar', fixture('image.png'));
    expect(av.status).toBe(200);
    expect(av.body.avatarUrl).toMatch(/^http:\/\/test\.local\/uploads\/avatars\/.+\.jpg$/);
    expect((await api().get(new URL(av.body.avatarUrl).pathname)).status).toBe(200);
    expectError(await api().post('/api/v1/users/me/avatar').set(carol.auth).attach('avatar', fixture('voice.m4a')), 400, 'VALIDATION_ERROR');
    expect((await api().post('/api/v1/users/me/push-token').set(carol.auth).send({ token: 'ExponentPushToken[abc]', platform: 'ios' })).status).toBe(204);
    expectError(await api().post('/api/v1/users/me/push-token').set(carol.auth).send({ token: 'x', platform: 'web' }), 400, 'VALIDATION_ERROR');
  });
});

describe('blocking', () => {
  it('hides content both ways and forbids DMs', async () => {
    const mallory = await registerUser({ username: 'mallory' });
    const victim = await registerUser({ username: 'victim' });
    const mPost = await createTextPost(mallory, 'spam spam #blocked');
    const vPost = await createTextPost(victim, 'my post');
    await api().post(`/api/v1/users/${victim.user.id}/follow`).set(mallory.auth);
    await api().post(`/api/v1/users/${mallory.user.id}/follow`).set(victim.auth);

    expect((await api().post(`/api/v1/users/${mallory.user.id}/block`).set(victim.auth)).status).toBe(204);
    // follows removed both ways
    const vMe = await api().get('/api/v1/auth/me').set(victim.auth);
    expect(vMe.body).toMatchObject({ followerCount: 0, followingCount: 0 });

    // blocker sees the profile flagged, blocked user gets 404
    expect((await api().get(`/api/v1/users/${mallory.user.id}`).set(victim.auth)).body.isBlocked).toBe(true);
    expectError(await api().get(`/api/v1/users/${victim.user.id}`).set(mallory.auth), 404, 'NOT_FOUND');
    expect((await api().get(`/api/v1/users/${mallory.user.id}/posts`).set(victim.auth)).body.items).toEqual([]);

    // posts hidden both ways
    expectError(await api().get(`/api/v1/posts/${mPost.id}`).set(victim.auth), 404, 'NOT_FOUND');
    expectError(await api().get(`/api/v1/posts/${vPost.id}`).set(mallory.auth), 404, 'NOT_FOUND');
    expectError(await api().post(`/api/v1/posts/${vPost.id}/like`).set(mallory.auth), 404, 'NOT_FOUND');
    const feed = await api().get('/api/v1/feed?limit=50').set(victim.auth);
    expect(feed.body.items.map((p: any) => p.id)).not.toContain(mPost.id);
    const search = await api().get('/api/v1/search?q=spam&type=posts').set(victim.auth);
    expect(search.body.items).toEqual([]);
    const users = await api().get('/api/v1/search?q=mallory&type=users').set(victim.auth);
    expect(users.body.items).toEqual([]);

    // no follow, no DM either way
    expectError(await api().post(`/api/v1/users/${victim.user.id}/follow`).set(mallory.auth), 404, 'NOT_FOUND');
    expectError(await api().post('/api/v1/conversations').set(mallory.auth).send({ userId: victim.user.id }), 403, 'FORBIDDEN');
    expectError(await api().post('/api/v1/conversations').set(victim.auth).send({ userId: mallory.user.id }), 403, 'FORBIDDEN');

    const blocked = await api().get('/api/v1/users/me/blocked').set(victim.auth);
    expect(blocked.body.map((u: any) => u.id)).toEqual([mallory.user.id]);

    expect((await api().delete(`/api/v1/users/${mallory.user.id}/block`).set(victim.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/posts/${mPost.id}`).set(victim.auth)).status).toBe(200);
    expect((await api().get('/api/v1/users/me/blocked').set(victim.auth)).body).toEqual([]);
  });
});
