import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, createTextPost, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

beforeAll(async () => {
  await resetDb();
  alice = await registerUser({ name: 'Alice', username: 'alice' });
  bob = await registerUser({ name: 'Bob', username: 'bob' });
  carol = await registerUser({ name: 'Carol', username: 'carol' });
});

const localFile = (url: string) => path.resolve('tmp/test-uploads', url.replace('http://test.local/uploads/', ''));

describe('posts', () => {
  it('creates a text post with hashtags and mention notifications', async () => {
    const post = await createTextPost(alice, 'Révisions #Maths et #exam2026 avec @bob ! #maths', { category: 'math' });
    expect(post).toMatchObject({
      type: 'post',
      category: 'math',
      media: null,
      community: null,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      bookmarkCount: 0,
      viewCount: 0,
      likedByMe: false,
      bookmarkedByMe: false,
    });
    expect(post.hashtags).toEqual(['maths', 'exam2026']);
    expect(post.author).toMatchObject({ username: 'alice', isFollowing: false });
    const notifs = await api().get('/api/v1/notifications').set(bob.auth);
    expect(notifs.body.items[0]).toMatchObject({ type: 'mention', actor: { username: 'alice' }, post: { id: post.id, type: 'post' }, read: false });
  });

  it('validates post input', async () => {
    expectError(await api().post('/api/v1/posts').set(alice.auth).send({ type: 'post', text: '' }), 400, 'VALIDATION_ERROR');
    expectError(await api().post('/api/v1/posts').set(alice.auth).send({ type: 'story', text: 'x' }), 400, 'VALIDATION_ERROR');
    expectError(await api().post('/api/v1/posts').set(alice.auth).send({ type: 'post', text: 'x', category: 'cooking' }), 400, 'VALIDATION_ERROR');
    // type=video needs a video file
    expectError(await api().post('/api/v1/posts').set(alice.auth).field('type', 'video').field('text', 'no file'), 400, 'VALIDATION_ERROR');
    expectError(
      await api().post('/api/v1/posts').set(alice.auth).field('type', 'video').attach('media', fixture('image.png')),
      400,
      'VALIDATION_ERROR',
    );
    // fake mp4 rejected by ffprobe
    expectError(
      await api().post('/api/v1/posts').set(alice.auth).field('type', 'video').attach('media', fixture('fake.mp4'), { contentType: 'video/mp4' }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('creates a video post with ffmpeg thumbnail, duration and dimensions', async () => {
    const res = await api()
      .post('/api/v1/posts')
      .set(alice.auth)
      .field('type', 'video')
      .field('text', 'Mon premier cours vidéo #programming')
      .field('category', 'programming')
      .attach('media', fixture('tiny.mp4'), { contentType: 'video/mp4' });
    expect(res.status).toBe(201);
    const m = res.body.media;
    expect(m.kind).toBe('video');
    expect(m.url).toMatch(/^http:\/\/test\.local\/uploads\/videos\/.+\.mp4$/);
    expect(m.thumbnailUrl).toMatch(/^http:\/\/test\.local\/uploads\/thumbnails\/.+\.jpg$/);
    expect(m.durationSec).toBeGreaterThan(2.5);
    expect(m.durationSec).toBeLessThan(3.5);
    expect(m.width).toBe(320);
    expect(m.height).toBe(240);
    expect(fs.statSync(localFile(m.url)).size).toBeGreaterThan(1000);
    expect(fs.statSync(localFile(m.thumbnailUrl)).size).toBeGreaterThan(500);
    // served statically with range support
    const file = await api().get(new URL(m.url).pathname).set('Range', 'bytes=0-99');
    expect(file.status).toBe(206);
    const thumb = await api().get(new URL(m.thumbnailUrl).pathname);
    expect(thumb.status).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/jpeg');
  });

  it('creates image and audio posts', async () => {
    const img = await api().post('/api/v1/posts').set(bob.auth).field('type', 'post').field('text', 'Mes notes').field('category', 'notes').attach('media', fixture('image.png'));
    expect(img.status).toBe(201);
    expect(img.body.media).toMatchObject({ kind: 'image', width: 640, height: 480, durationSec: null });
    const audio = await api().post('/api/v1/posts').set(bob.auth).field('type', 'post').field('category', 'languages').attach('media', fixture('voice.m4a'), { contentType: 'audio/mp4' });
    expect(audio.status).toBe(201);
    expect(audio.body.media.kind).toBe('audio');
    expect(audio.body.media.durationSec).toBeGreaterThan(1.5);
  });

  it('likes, bookmarks, shares, views and comments keep counters consistent', async () => {
    const post = await createTextPost(alice, 'Counter test');
    const like = await api().post(`/api/v1/posts/${post.id}/like`).set(bob.auth);
    expect(like.body).toEqual({ liked: true, likeCount: 1 });
    expect((await api().post(`/api/v1/posts/${post.id}/like`).set(bob.auth)).body).toEqual({ liked: true, likeCount: 1 });
    expect((await api().post(`/api/v1/posts/${post.id}/like`).set(carol.auth)).body.likeCount).toBe(2);
    expect((await api().delete(`/api/v1/posts/${post.id}/like`).set(carol.auth)).body).toEqual({ liked: false, likeCount: 1 });

    expect((await api().post(`/api/v1/posts/${post.id}/bookmark`).set(bob.auth)).body).toEqual({ bookmarked: true, bookmarkCount: 1 });
    expect((await api().post(`/api/v1/posts/${post.id}/share`).set(bob.auth)).body).toEqual({ shareCount: 1 });
    expect((await api().post(`/api/v1/posts/${post.id}/share`).set(carol.auth)).body).toEqual({ shareCount: 2 });
    expect((await api().post(`/api/v1/posts/${post.id}/view`).set(bob.auth)).status).toBe(204);
    expect((await api().post(`/api/v1/posts/${post.id}/view`).set(bob.auth)).status).toBe(204);
    expect((await api().post(`/api/v1/posts/${post.id}/view`).set(carol.auth)).status).toBe(204);

    const c1 = await api().post(`/api/v1/posts/${post.id}/comments`).set(bob.auth).send({ text: 'Super utile @carol' });
    expect(c1.status).toBe(201);
    expect(c1.body).toMatchObject({ text: 'Super utile @carol', postId: post.id, author: { username: 'bob' } });
    const mention = await api().get('/api/v1/notifications').set(carol.auth);
    expect(mention.body.items.some((x: any) => x.type === 'mention' && x.actor.username === 'bob' && x.text === 'mentioned you in a comment')).toBe(true);
    const c2 = await api().post(`/api/v1/posts/${post.id}/comments`).set(carol.auth).send({ text: 'Merci !' });
    expectError(await api().post(`/api/v1/posts/${post.id}/comments`).set(carol.auth).send({ text: '   ' }), 400, 'VALIDATION_ERROR');

    const asBob = await api().get(`/api/v1/posts/${post.id}`).set(bob.auth);
    expect(asBob.body).toMatchObject({ likeCount: 1, bookmarkCount: 1, shareCount: 2, viewCount: 2, commentCount: 2, likedByMe: true, bookmarkedByMe: true });
    const asCarol = await api().get(`/api/v1/posts/${post.id}`).set(carol.auth);
    expect(asCarol.body).toMatchObject({ likedByMe: false, bookmarkedByMe: false });

    const comments = await api().get(`/api/v1/posts/${post.id}/comments?limit=1`).set(alice.auth);
    expect(comments.body.items).toHaveLength(1);
    expect(comments.body.items[0].id).toBe(c1.body.id); // oldest first
    const page2 = await api().get(`/api/v1/posts/${post.id}/comments?limit=1&cursor=${comments.body.nextCursor}`).set(alice.auth);
    expect(page2.body.items[0].id).toBe(c2.body.id);
    expect(page2.body.nextCursor).toBeNull();

    // comment deletion: only comment author or post author
    expectError(await api().delete(`/api/v1/comments/${c1.body.id}`).set(carol.auth), 403, 'FORBIDDEN');
    expect((await api().delete(`/api/v1/comments/${c1.body.id}`).set(alice.auth)).status).toBe(204);
    expect((await api().delete(`/api/v1/comments/${c2.body.id}`).set(carol.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/posts/${post.id}`).set(bob.auth)).body.commentCount).toBe(0);

    // notifications for alice: like (bob) + comments; none for carol's unlike (removed)
    const n = await api().get('/api/v1/notifications').set(alice.auth);
    const types = n.body.items.map((x: any) => `${x.type}:${x.actor.username}`);
    expect(types).toContain('like:bob');
    expect(types).not.toContain('like:carol');
    expect(n.body.items.find((x: any) => x.type === 'like').text).toBe('liked your post');
    // notifications attached to a deleted comment are removed with it
    const nc = await api().get('/api/v1/notifications').set(carol.auth);
    expect(nc.body.items.some((x: any) => x.type === 'mention' && x.actor.username === 'bob')).toBe(false);

    // bookmarks list
    const bm = await api().get('/api/v1/me/bookmarks').set(bob.auth);
    expect(bm.body.items.map((p: any) => p.id)).toContain(post.id);
  });

  it('does not notify on self-actions', async () => {
    const post = await createTextPost(carol, 'Self test');
    const before = (await api().get('/api/v1/notifications/unread-count').set(carol.auth)).body.count;
    await api().post(`/api/v1/posts/${post.id}/like`).set(carol.auth);
    await api().post(`/api/v1/posts/${post.id}/comments`).set(carol.auth).send({ text: 'me @carol' });
    expect((await api().get('/api/v1/notifications/unread-count').set(carol.auth)).body.count).toBe(before);
    expect((await api().post('/api/v1/notifications/read-all').set(carol.auth)).status).toBe(204);
    expect((await api().get('/api/v1/notifications/unread-count').set(carol.auth)).body.count).toBe(0);
  });

  it('only the author can delete a post', async () => {
    const post = await createTextPost(alice, 'To delete');
    expectError(await api().delete(`/api/v1/posts/${post.id}`).set(bob.auth), 403, 'FORBIDDEN');
    expect((await api().delete(`/api/v1/posts/${post.id}`).set(alice.auth)).status).toBe(204);
    expectError(await api().get(`/api/v1/posts/${post.id}`).set(alice.auth), 404, 'NOT_FOUND');
    expectError(await api().get('/api/v1/posts/not-a-uuid').set(alice.auth), 400, 'VALIDATION_ERROR');
  });
});

describe('feed', () => {
  it('forYou ranks engaged posts, following shows followed authors only', async () => {
    const dave = await registerUser({ username: 'dave' });
    const eve = await registerUser({ username: 'eve' });
    const quiet = await createTextPost(dave, 'quiet post');
    const hot = await createTextPost(eve, 'hot post');
    for (const u of [alice, bob, carol]) {
      await api().post(`/api/v1/posts/${hot.id}/like`).set(u.auth);
      await api().post(`/api/v1/posts/${hot.id}/share`).set(u.auth);
    }
    const forYou = await api().get('/api/v1/feed?tab=forYou&limit=50').set(dave.auth);
    expect(forYou.status).toBe(200);
    const ids = forYou.body.items.map((p: any) => p.id);
    expect(ids.indexOf(hot.id)).toBeLessThan(ids.indexOf(quiet.id));
    expect(forYou.body.nextCursor).toBeNull();

    // pagination of ranked feed has no duplicates
    const p1 = await api().get('/api/v1/feed?limit=3').set(dave.auth);
    const p2 = await api().get(`/api/v1/feed?limit=3&cursor=${p1.body.nextCursor}`).set(dave.auth);
    const all = [...p1.body.items, ...p2.body.items].map((p: any) => p.id);
    expect(new Set(all).size).toBe(all.length);

    // following
    expect((await api().get('/api/v1/feed?tab=following').set(dave.auth)).body.items).toEqual([]);
    const f = await api().post(`/api/v1/users/${eve.user.id}/follow`).set(dave.auth);
    expect(f.body).toMatchObject({ isFollowing: true, followerCount: 1 });
    const following = await api().get('/api/v1/feed?tab=following').set(dave.auth);
    expect(following.body.items.map((p: any) => p.id)).toEqual([hot.id]);
    expect(following.body.items[0].author.isFollowing).toBe(true);

    // filters
    const videos = await api().get('/api/v1/feed?type=video').set(dave.auth);
    expect(videos.body.items.length).toBeGreaterThan(0);
    expect(videos.body.items.every((p: any) => p.type === 'video')).toBe(true);
    const math = await api().get('/api/v1/feed?category=math&sort=latest').set(dave.auth);
    expect(math.body.items.every((p: any) => p.category === 'math')).toBe(true);
    const popular = await api().get('/api/v1/feed?sort=popular').set(dave.auth);
    expect(popular.body.items[0].id).toBe(hot.id);
    const latest = await api().get('/api/v1/feed?sort=latest&limit=2').set(dave.auth);
    expect(latest.body.items[0].id).toBe(hot.id);
    const latest2 = await api().get(`/api/v1/feed?sort=latest&limit=2&cursor=${latest.body.nextCursor}`).set(dave.auth);
    expect(latest2.body.items[0].id).not.toBe(hot.id);
    expectError(await api().get('/api/v1/feed?tab=nope').set(dave.auth), 400, 'VALIDATION_ERROR');
    expectError(await api().get('/api/v1/feed?cursor=%%%').set(dave.auth), 400, 'VALIDATION_ERROR');
  });

  it('exposes categories and trending', async () => {
    const cats = await api().get('/api/v1/categories');
    expect(cats.body).toHaveLength(10);
    expect(cats.body[0]).toEqual({ id: 'study-tips', label: 'Study Tips', icon: 'school-outline' });
    const topics = await api().get('/api/v1/trending/topics').set(alice.auth);
    expect(topics.body).toHaveLength(10);
    expect(topics.body[0].postCount).toBeGreaterThanOrEqual(topics.body[1].postCount);
    const tags = await api().get('/api/v1/trending/hashtags?limit=5').set(alice.auth);
    expect(tags.body.find((t: any) => t.tag === 'maths')).toEqual({ tag: 'maths', postCount: 1 });
  });
});
