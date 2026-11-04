import { beforeAll, describe, expect, it } from 'vitest';
import { sentMails } from '../src/lib/mailer.js';
import { api, createTextPost, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let a: TestUser;
let b: TestUser;
let c: TestUser;

beforeAll(async () => {
  await resetDb();
  a = await registerUser({ name: 'Amel Ben', username: 'amel' });
  b = await registerUser({ name: 'Bruno Lima', username: 'bruno' });
  c = await registerUser({ name: 'Chloé Amar', username: 'chloe' });
});

describe('private accounts & follow requests', () => {
  it('requires approval and hides posts from non-followers', async () => {
    const s = await api().put('/api/v1/users/me/settings').set(a.auth).send({ isPrivate: true });
    expect(s.body).toMatchObject({ isPrivate: true, dmPolicy: 'everyone', notifications: { likes: true, push: true } });
    const secret = await createTextPost(a, 'secret #privé');

    const profile = await api().get(`/api/v1/users/${a.user.id}`).set(b.auth);
    expect(profile.body).toMatchObject({ isPrivate: true, followStatus: 'none', isAdmin: false });
    expectError(await api().get(`/api/v1/posts/${secret.id}`).set(b.auth), 404, 'NOT_FOUND');
    expect((await api().get(`/api/v1/users/${a.user.id}/posts`).set(b.auth)).body.items).toEqual([]);
    expect((await api().get('/api/v1/hashtags/privé').set(b.auth)).body.postCount).toBe(0);

    const req1 = await api().post(`/api/v1/users/${a.user.id}/follow`).set(b.auth);
    expect(req1.body).toEqual({ isFollowing: false, followStatus: 'requested', followerCount: 0 });
    const req2 = await api().post(`/api/v1/users/${a.user.id}/follow`).set(c.auth);
    expect(req2.body.followStatus).toBe('requested');
    expect((await api().get(`/api/v1/users/${a.user.id}`).set(b.auth)).body.followStatus).toBe('requested');
    expect((await api().get('/api/v1/me/follow-requests/count').set(a.auth)).body).toEqual({ count: 2 });
    const list = await api().get('/api/v1/me/follow-requests').set(a.auth);
    expect(list.body.items.map((r: any) => r.user.username).sort()).toEqual(['bruno', 'chloe']);
    expect((await api().get('/api/v1/notifications').set(a.auth)).body.items[0].type).toBe('follow_request');

    expect((await api().post(`/api/v1/me/follow-requests/${b.user.id}/accept`).set(a.auth)).status).toBe(204);
    expect((await api().post(`/api/v1/me/follow-requests/${c.user.id}/decline`).set(a.auth)).status).toBe(204);
    expectError(await api().post(`/api/v1/me/follow-requests/${c.user.id}/accept`).set(a.auth), 404, 'NOT_FOUND');
    expect((await api().get('/api/v1/notifications').set(b.auth)).body.items[0]).toMatchObject({ type: 'follow_accepted', actor: { id: a.user.id } });

    expect((await api().get(`/api/v1/posts/${secret.id}`).set(b.auth)).status).toBe(200);
    expectError(await api().get(`/api/v1/posts/${secret.id}`).set(c.auth), 404, 'NOT_FOUND');
    expect((await api().get(`/api/v1/users/${a.user.id}`).set(b.auth)).body).toMatchObject({ followStatus: 'following', isFollowing: true, followerCount: 1 });

    // cancel a pending request
    await api().post(`/api/v1/users/${a.user.id}/follow`).set(c.auth);
    expect((await api().delete(`/api/v1/users/${a.user.id}/follow`).set(c.auth)).body).toMatchObject({ followStatus: 'none' });
    expect((await api().get('/api/v1/me/follow-requests/count').set(a.auth)).body.count).toBe(0);

    // going public auto-accepts pending requests
    await api().post(`/api/v1/users/${a.user.id}/follow`).set(c.auth);
    await api().put('/api/v1/users/me/settings').set(a.auth).send({ isPrivate: false });
    expect((await api().get(`/api/v1/users/${a.user.id}`).set(c.auth)).body.followStatus).toBe('following');

    // remove a follower
    expect((await api().delete(`/api/v1/users/${c.user.id}/follower`).set(a.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/users/${a.user.id}`).set(c.auth)).body.followStatus).toBe('none');
  });

  it('enforces the DM policy', async () => {
    await api().put('/api/v1/users/me/settings').set(c.auth).send({ dmPolicy: 'nobody' });
    expect((await api().get(`/api/v1/users/${c.user.id}`).set(a.auth)).body.canMessage).toBe(false);
    expectError(await api().post('/api/v1/conversations').set(a.auth).send({ userId: c.user.id }), 403, 'FORBIDDEN');
    await api().put('/api/v1/users/me/settings').set(c.auth).send({ dmPolicy: 'followers' });
    expectError(await api().post('/api/v1/conversations').set(a.auth).send({ userId: c.user.id }), 403, 'FORBIDDEN');
    await api().post(`/api/v1/users/${c.user.id}/follow`).set(a.auth);
    expect((await api().get(`/api/v1/users/${c.user.id}`).set(a.auth)).body.canMessage).toBe(true);
    const dm = await api().post('/api/v1/conversations').set(a.auth).send({ userId: c.user.id });
    expect(dm.status).toBe(201);
    expect((await api().post(`/api/v1/conversations/${dm.body.id}/messages`).set(a.auth).send({ text: 'hello' })).status).toBe(201);
    expectError(await api().put('/api/v1/users/me/settings').set(c.auth).send({ dmPolicy: 'friends' }), 400, 'VALIDATION_ERROR');
    expectError(await api().put('/api/v1/users/me/settings').set(c.auth).send({ notifications: { unknown: true } }), 400, 'VALIDATION_ERROR');
    await api().put('/api/v1/users/me/settings').set(c.auth).send({ dmPolicy: 'everyone' });
  });
});

describe('discovery & social', () => {
  it('reposts appear in followers feed with repostedBy', async () => {
    const original = await createTextPost(c, 'À partager #partage');
    expectError(await api().post(`/api/v1/posts/${original.id}/repost`).set(c.auth), 400, 'VALIDATION_ERROR');
    expect((await api().post(`/api/v1/posts/${original.id}/repost`).set(b.auth)).body).toEqual({ reposted: true, repostCount: 1 });
    // a follows b (not c)
    await api().post(`/api/v1/users/${b.user.id}/follow`).set(a.auth);
    const feed = await api().get('/api/v1/feed?tab=following').set(a.auth);
    const item = feed.body.items.find((p: any) => p.id === original.id);
    expect(item).toMatchObject({ repostedBy: { id: b.user.id }, repostCount: 1, repostedByMe: false });
    expect((await api().get(`/api/v1/users/${b.user.id}/reposts`).set(a.auth)).body.items.map((p: any) => p.id)).toEqual([original.id]);
    expect((await api().get('/api/v1/notifications').set(c.auth)).body.items[0].type).toBe('repost');
    expect((await api().delete(`/api/v1/posts/${original.id}/repost`).set(b.auth)).body).toEqual({ reposted: false, repostCount: 0 });
  });

  it('hashtag pages, edits and profile pins', async () => {
    const p = await createTextPost(b, 'Astuce #Revisions');
    await createTextPost(c, 'Encore #revisions');
    const tag = await api().get('/api/v1/hashtags/%23Revisions').set(a.auth);
    expect(tag.body).toMatchObject({ tag: 'revisions', postCount: 2 });
    expect(tag.body.items).toHaveLength(2);
    const pop = await api().get('/api/v1/hashtags/revisions?sort=popular&limit=1').set(a.auth);
    expect(pop.body.items).toHaveLength(1);
    expect(pop.body.nextCursor).toBeTypeOf('string');

    expectError(await api().patch(`/api/v1/posts/${p.id}`).set(a.auth).send({ text: 'hack' }), 403, 'FORBIDDEN');
    const edited = await api().patch(`/api/v1/posts/${p.id}`).set(b.auth).send({ text: 'Astuce corrigée #memo', category: 'notes' });
    expect(edited.body).toMatchObject({ text: 'Astuce corrigée #memo', category: 'notes', hashtags: ['memo'] });
    expect(Date.parse(edited.body.editedAt)).not.toBeNaN();

    const pins = [p, await createTextPost(b, 'pin 2'), await createTextPost(b, 'pin 3')];
    for (const x of pins) expect((await api().post(`/api/v1/posts/${x.id}/pin`).set(b.auth)).body.isPinned).toBe(true);
    const extra = await createTextPost(b, 'pin 4');
    expectError(await api().post(`/api/v1/posts/${extra.id}/pin`).set(b.auth), 409, 'CONFLICT');
    expectError(await api().post(`/api/v1/posts/${extra.id}/pin`).set(a.auth), 403, 'FORBIDDEN');
    const pinned = await api().get(`/api/v1/users/${b.user.id}/pinned`).set(a.auth);
    expect(pinned.body.map((x: any) => x.id)).toEqual(pins.map((x) => x.id));
    expect(pinned.body[0].isPinned).toBe(true);
    expect((await api().get(`/api/v1/users/${b.user.id}`).set(a.auth)).body.pinnedPostIds).toHaveLength(3);
    const un = await api().delete(`/api/v1/posts/${pins[1]!.id}/pin`).set(b.auth);
    expect(un.body.pinnedPostIds).toEqual([pins[0]!.id, pins[2]!.id]);
    await api().delete(`/api/v1/posts/${pins[2]!.id}`).set(b.auth); // deletion removes the pin
    expect((await api().get('/api/v1/auth/me').set(b.auth)).body.pinnedPostIds).toEqual([pins[0]!.id]);
  });

  it('records watch history and supports clearing it', async () => {
    const p1 = await createTextPost(c, 'watch 1');
    const p2 = await createTextPost(c, 'watch 2');
    await api().post(`/api/v1/posts/${p1.id}/view`).set(a.auth);
    await api().post(`/api/v1/posts/${p2.id}/view`).set(a.auth);
    await api().post(`/api/v1/posts/${p1.id}/view`).set(a.auth); // moves to top, counted once
    const h = await api().get('/api/v1/me/history').set(a.auth);
    expect(h.body.items.map((i: any) => i.post.id)).toEqual([p1.id, p2.id]);
    expect(Date.parse(h.body.items[0].viewedAt)).not.toBeNaN();
    expect(h.body.items[0].post.viewCount).toBe(1);
    expect((await api().delete(`/api/v1/me/history/${p2.id}`).set(a.auth)).status).toBe(204);
    expect((await api().get('/api/v1/me/history').set(a.auth)).body.items.map((i: any) => i.post.id)).toEqual([p1.id]);
    expect((await api().delete('/api/v1/me/history').set(a.auth)).status).toBe(204);
    expect((await api().get('/api/v1/me/history').set(a.auth)).body.items).toEqual([]);
    expect((await api().get(`/api/v1/posts/${p1.id}`).set(a.auth)).body.viewCount).toBe(1);
  });

  it('shares a post into a DM', async () => {
    const post = await createTextPost(c, 'Fiche à partager');
    const dm = await api().post('/api/v1/conversations').set(a.auth).send({ userId: b.user.id });
    const msg = await api().post(`/api/v1/conversations/${dm.body.id}/messages`).set(a.auth).send({ postId: post.id });
    expect(msg.status).toBe(201);
    expect(msg.body.post).toMatchObject({ id: post.id, type: 'post', text: 'Fiche à partager', author: { id: c.user.id } });
    const asB = await api().get(`/api/v1/conversations/${dm.body.id}/messages`).set(b.auth);
    expect(asB.body.items[0].post.id).toBe(post.id);
    expect((await api().get(`/api/v1/posts/${post.id}`).set(a.auth)).body.shareCount).toBe(1);
    expectError(await api().post(`/api/v1/conversations/${dm.body.id}/messages`).set(a.auth).send({ postId: '00000000-0000-4000-8000-000000000000' }), 404, 'NOT_FOUND');
  });

  it('autocompletes mentions with followed users first', async () => {
    const res = await api().get('/api/v1/users/mentions?q=@b').set(a.auth);
    expect(res.body.map((u: any) => u.username)).toEqual(['bruno']);
    const am = await api().get('/api/v1/users/mentions?q=am').set(b.auth);
    // "Amel" (username amel) and "Chloé Amar" (last name) both match
    expect(am.body.map((u: any) => u.username).sort()).toEqual(['amel', 'chloe']);
  });

  it('boosts interests in For You and moves watched videos last', async () => {
    const u = await registerUser({ username: 'interest_user' });
    const me = await api().put('/api/v1/users/me/interests').set(u.auth).send({ categories: ['languages'] });
    expect(me.body.interests).toEqual(['languages']);
    expectError(await api().put('/api/v1/users/me/interests').set(u.auth).send({ categories: ['cooking'] }), 400, 'VALIDATION_ERROR');
    const lang = await createTextPost(c, 'Vocabulaire espagnol', { category: 'languages' });
    const control = await createTextPost(c, 'Contrôle', { category: 'other' }); // newer, same engagement
    let ids = (await api().get('/api/v1/feed?limit=50').set(u.auth)).body.items.map((p: any) => p.id);
    expect(ids.indexOf(lang.id)).toBeLessThan(ids.indexOf(control.id));

    const video = await api().post('/api/v1/posts').set(c.auth).field('type', 'video').field('category', 'other').attach('media', fixture('tiny.mp4'));
    ids = (await api().get('/api/v1/feed?limit=50').set(u.auth)).body.items.map((p: any) => p.id);
    expect(ids.indexOf(video.body.id)).toBeLessThan(ids.indexOf(control.id));
    await api().post(`/api/v1/posts/${video.body.id}/view`).set(u.auth);
    ids = (await api().get('/api/v1/feed?limit=50').set(u.auth)).body.items.map((p: any) => p.id);
    expect(ids[ids.length - 1]).toBe(video.body.id);
  });
});

describe('email verification', () => {
  it('sends a code at sign-up and verifies it', async () => {
    sentMails.length = 0;
    const u = await registerUser({ username: 'verify_me' });
    expect(u.user.emailVerified).toBe(false);
    const code = sentMails.find((m) => m.to === u.user.email)!.text.match(/\b(\d{6})\b/)![1]!;
    expectError(await api().post('/api/v1/auth/verify-email').set(u.auth).send({ code: code === '000000' ? '111111' : '000000' }), 400, 'VALIDATION_ERROR');
    // resend invalidates the first code
    expect((await api().post('/api/v1/auth/resend-verification').set(u.auth)).status).toBe(204);
    expectError(await api().post('/api/v1/auth/verify-email').set(u.auth).send({ code }), 400, 'VALIDATION_ERROR');
    const fresh = sentMails.filter((m) => m.to === u.user.email).at(-1)!.text.match(/\b(\d{6})\b/)![1]!;
    const ok = await api().post('/api/v1/auth/verify-email').set(u.auth).send({ code: fresh });
    expect(ok.status).toBe(200);
    expect(ok.body.emailVerified).toBe(true);
    expectError(await api().post('/api/v1/auth/resend-verification').set(u.auth), 409, 'CONFLICT');
  });
});
