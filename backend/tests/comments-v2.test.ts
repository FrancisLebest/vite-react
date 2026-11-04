import { beforeAll, describe, expect, it } from 'vitest';
import { api, createTextPost, expectError, registerUser, resetDb, type TestUser } from './helpers.js';

let author: TestUser;
let ann: TestUser;
let ben: TestUser;

beforeAll(async () => {
  await resetDb();
  author = await registerUser({ username: 'c_author' });
  ann = await registerUser({ username: 'c_ann' });
  ben = await registerUser({ username: 'c_ben' });
});

describe('comments v2', () => {
  it('threads replies one level deep, counts and notifies', async () => {
    const post = await createTextPost(author, 'Thread me');
    const root = (await api().post(`/api/v1/posts/${post.id}/comments`).set(ann.auth).send({ text: 'Question ?' })).body;
    expect(root).toMatchObject({ parentId: null, replyCount: 0, likeCount: 0, likedByMe: false, isPinned: false });
    const reply = await api().post(`/api/v1/posts/${post.id}/comments`).set(ben.auth).send({ text: 'Réponse @c_author', parentId: root.id });
    expect(reply.status).toBe(201);
    expect(reply.body.parentId).toBe(root.id);
    // reply to a reply is attached to the root
    const nested = await api().post(`/api/v1/posts/${post.id}/comments`).set(ann.auth).send({ text: 'Merci', parentId: reply.body.id });
    expect(nested.body.parentId).toBe(root.id);
    expectError(await api().post(`/api/v1/posts/${post.id}/comments`).set(ann.auth).send({ text: 'x', parentId: '00000000-0000-4000-8000-000000000000' }), 400, 'VALIDATION_ERROR');

    const top = await api().get(`/api/v1/posts/${post.id}/comments`).set(author.auth);
    expect(top.body.items.map((c: any) => c.id)).toEqual([root.id]);
    expect(top.body.items[0].replyCount).toBe(2);
    const replies = await api().get(`/api/v1/comments/${root.id}/replies`).set(author.auth);
    expect(replies.body.items.map((c: any) => c.id)).toEqual([reply.body.id, nested.body.id]);
    expect((await api().get(`/api/v1/posts/${post.id}`).set(author.auth)).body.commentCount).toBe(3);

    const annN = (await api().get('/api/v1/notifications').set(ann.auth)).body.items;
    expect(annN.find((n: any) => n.type === 'reply')).toMatchObject({ actor: { username: 'c_ben' }, comment: { id: reply.body.id }, post: { id: post.id } });
    const benN = (await api().get('/api/v1/notifications').set(ben.auth)).body.items;
    expect(benN.some((n: any) => n.type === 'reply' && n.actor.username === 'c_ann')).toBe(true);
    const authorN = (await api().get('/api/v1/notifications').set(author.auth)).body.items;
    expect(authorN.filter((n: any) => n.type === 'comment')).toHaveLength(3);
    expect(authorN.some((n: any) => n.type === 'mention')).toBe(false); // already notified as post author

    // likes
    expect((await api().post(`/api/v1/comments/${root.id}/like`).set(ben.auth)).body).toEqual({ liked: true, likeCount: 1 });
    expect((await api().post(`/api/v1/comments/${root.id}/like`).set(ben.auth)).body).toEqual({ liked: true, likeCount: 1 });
    const liked = (await api().get(`/api/v1/posts/${post.id}/comments`).set(ben.auth)).body.items[0];
    expect(liked).toMatchObject({ likeCount: 1, likedByMe: true });
    expect((await api().get('/api/v1/notifications').set(ann.auth)).body.items[0]).toMatchObject({ type: 'comment_like', comment: { id: root.id } });
    expect((await api().delete(`/api/v1/comments/${root.id}/like`).set(ben.auth)).body).toEqual({ liked: false, likeCount: 0 });

    // deleting the root removes its replies
    expect((await api().delete(`/api/v1/comments/${root.id}`).set(ann.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/posts/${post.id}`).set(author.auth)).body.commentCount).toBe(0);
  });

  it('lets only the post author pin a top-level comment, shown first', async () => {
    const post = await createTextPost(author, 'Pin me');
    const c1 = (await api().post(`/api/v1/posts/${post.id}/comments`).set(ann.auth).send({ text: 'first' })).body;
    const c2 = (await api().post(`/api/v1/posts/${post.id}/comments`).set(ben.auth).send({ text: 'second' })).body;
    const r = (await api().post(`/api/v1/posts/${post.id}/comments`).set(ben.auth).send({ text: 'reply', parentId: c1.id })).body;
    expectError(await api().post(`/api/v1/comments/${c2.id}/pin`).set(ann.auth), 403, 'FORBIDDEN');
    expectError(await api().post(`/api/v1/comments/${r.id}/pin`).set(author.auth), 400, 'VALIDATION_ERROR');
    const pinned = await api().post(`/api/v1/comments/${c2.id}/pin`).set(author.auth);
    expect(pinned.body).toMatchObject({ id: c2.id, isPinned: true });
    const list = await api().get(`/api/v1/posts/${post.id}/comments`).set(ann.auth);
    expect(list.body.items.map((c: any) => c.id)).toEqual([c2.id, c1.id]);
    expect((await api().get(`/api/v1/posts/${post.id}`).set(ann.auth)).body.pinnedCommentId).toBe(c2.id);
    // pinning another replaces it
    await api().post(`/api/v1/comments/${c1.id}/pin`).set(author.auth);
    expect((await api().get(`/api/v1/posts/${post.id}/comments`).set(ann.auth)).body.items.map((c: any) => c.id)).toEqual([c1.id, c2.id]);
    expect((await api().delete(`/api/v1/comments/${c1.id}/pin`).set(author.auth)).status).toBe(204);
    expect((await api().get(`/api/v1/posts/${post.id}`).set(ann.auth)).body.pinnedCommentId).toBeNull();
  });
});
