import { beforeAll, describe, expect, it } from 'vitest';
import { api, createTextPost, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let prof: TestUser;
let stud: TestUser;
let other: TestUser;

beforeAll(async () => {
  await resetDb();
  prof = await registerUser({ username: 'prof_x', role: 'professor' });
  stud = await registerUser({ username: 'stud_x' });
  other = await registerUser({ username: 'other_x' });
});

describe('polls & quizzes', () => {
  it('hides results until the viewer votes; one vote per user', async () => {
    const post = await createTextPost(prof, 'Quel chapitre réviser ?', { poll: { question: 'Chapitre ?', options: ['Algèbre', 'Analyse', 'Probas'] } });
    expect(post.poll).toMatchObject({ kind: 'poll', question: 'Chapitre ?', totalVotes: 0, myVoteOptionId: null, correctOptionId: null });
    expect(post.poll.options.map((o: any) => o.voteCount)).toEqual([0, 0, 0]); // author sees counts
    const asStud = (await api().get(`/api/v1/posts/${post.id}`).set(stud.auth)).body.poll;
    expect(asStud.totalVotes).toBeNull();
    expect(asStud.options.every((o: any) => o.voteCount === null)).toBe(true);

    const opt = asStud.options[1].id;
    const voted = await api().post(`/api/v1/posts/${post.id}/poll/vote`).set(stud.auth).send({ optionId: opt });
    expect(voted.status).toBe(200);
    expect(voted.body).toMatchObject({ totalVotes: 1, myVoteOptionId: opt, isCorrect: null, correctOptionId: null });
    expect(voted.body.options.map((o: any) => o.voteCount)).toEqual([0, 1, 0]);
    expectError(await api().post(`/api/v1/posts/${post.id}/poll/vote`).set(stud.auth).send({ optionId: opt }), 409, 'CONFLICT');
    expectError(await api().post(`/api/v1/posts/${post.id}/poll/vote`).set(prof.auth).send({ optionId: opt }), 403, 'FORBIDDEN');
    expectError(await api().post(`/api/v1/posts/${post.id}/poll/vote`).set(other.auth).send({ optionId: '00000000-0000-4000-8000-000000000000' }), 400, 'VALIDATION_ERROR');
  });

  it('quiz reveals the correct answer after voting (multipart poll JSON string)', async () => {
    const res = await api()
      .post('/api/v1/posts')
      .set(prof.auth)
      .field('type', 'post')
      .field('text', 'Quiz: dérivée de x² ?')
      .field('category', 'math')
      .field('poll', JSON.stringify({ options: ['x', '2x', 'x²/2'], correctOptionIndex: 1 }));
    expect(res.status).toBe(201);
    expect(res.body.poll.kind).toBe('quiz');
    const correct = res.body.poll.correctOptionId;
    expect(correct).toBe(res.body.poll.options[1].id);
    const before = (await api().get(`/api/v1/posts/${res.body.id}`).set(stud.auth)).body.poll;
    expect(before.correctOptionId).toBeNull();
    const wrong = await api().post(`/api/v1/posts/${res.body.id}/poll/vote`).set(stud.auth).send({ optionId: before.options[0].id });
    expect(wrong.body).toMatchObject({ correctOptionId: correct, isCorrect: false });
    const right = await api().post(`/api/v1/posts/${res.body.id}/poll/vote`).set(other.auth).send({ optionId: correct });
    expect(right.body).toMatchObject({ isCorrect: true, totalVotes: 2 });

    expectError(await api().post('/api/v1/posts').set(prof.auth).send({ type: 'post', text: 'x', poll: { options: ['only one'] } }), 400, 'VALIDATION_ERROR');
    expectError(await api().post('/api/v1/posts').set(prof.auth).send({ type: 'post', text: 'x', poll: { options: ['a', 'b'], correctOptionIndex: 3 } }), 400, 'VALIDATION_ERROR');
  });
});

describe('series', () => {
  it('creates a course, orders items, exposes prev/next and follow', async () => {
    const s = await api().post('/api/v1/series').set(prof.auth).field('title', 'Algèbre linéaire').field('description', 'Cours complet').field('category', 'math').attach('cover', fixture('image.png'));
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ title: 'Algèbre linéaire', category: 'math', itemCount: 0, followerCount: 0, isOwner: true, isFollowing: false });
    expect(s.body.coverUrl).toMatch(/\/uploads\/images\//);
    const id = s.body.id;
    const p1 = await createTextPost(prof, 'Ep 1');
    const p2 = await createTextPost(prof, 'Ep 2');
    const p3 = await createTextPost(prof, 'Ep 3');
    await api().post(`/api/v1/series/${id}/items`).set(prof.auth).send({ postId: p1.id });
    await api().post(`/api/v1/series/${id}/items`).set(prof.auth).send({ postId: p3.id });
    const ins = await api().post(`/api/v1/series/${id}/items`).set(prof.auth).send({ postId: p2.id, position: 2 });
    expect(ins.body.items.map((p: any) => p.id)).toEqual([p1.id, p2.id, p3.id]);
    expect(ins.body.itemCount).toBe(3);
    expectError(await api().post(`/api/v1/series/${id}/items`).set(prof.auth).send({ postId: p2.id }), 409, 'CONFLICT');
    const foreign = await createTextPost(stud, 'not yours');
    expectError(await api().post(`/api/v1/series/${id}/items`).set(prof.auth).send({ postId: foreign.id }), 403, 'FORBIDDEN');
    expectError(await api().post(`/api/v1/series/${id}/items`).set(stud.auth).send({ postId: foreign.id }), 403, 'FORBIDDEN');

    const mid = (await api().get(`/api/v1/posts/${p2.id}`).set(stud.auth)).body.series;
    expect(mid).toEqual({ id, title: 'Algèbre linéaire', position: 2, total: 3, prevPostId: p1.id, nextPostId: p3.id });

    const reordered = await api().put(`/api/v1/series/${id}/items`).set(prof.auth).send({ postIds: [p3.id, p1.id, p2.id] });
    expect(reordered.body.items.map((p: any) => p.id)).toEqual([p3.id, p1.id, p2.id]);
    expectError(await api().put(`/api/v1/series/${id}/items`).set(prof.auth).send({ postIds: [p3.id, p1.id] }), 400, 'VALIDATION_ERROR');
    const removed = await api().delete(`/api/v1/series/${id}/items/${p1.id}`).set(prof.auth);
    expect(removed.body.items.map((p: any) => p.id)).toEqual([p3.id, p2.id]);
    expect((await api().get(`/api/v1/posts/${p2.id}`).set(stud.auth)).body.series).toMatchObject({ position: 2, total: 2, prevPostId: p3.id, nextPostId: null });
    expect((await api().get(`/api/v1/posts/${p1.id}`).set(stud.auth)).body.series).toBeNull();

    expect((await api().post(`/api/v1/series/${id}/follow`).set(stud.auth)).body).toEqual({ isFollowing: true, followerCount: 1 });
    expectError(await api().post(`/api/v1/series/${id}/follow`).set(prof.auth), 400, 'VALIDATION_ERROR');
    const following = await api().get('/api/v1/me/series/following').set(stud.auth);
    expect(following.body.items.map((x: any) => x.id)).toEqual([id]);
    const list = await api().get(`/api/v1/users/${prof.user.id}/series`).set(stud.auth);
    expect(list.body.items[0]).toMatchObject({ id, isFollowing: true, isOwner: false, itemCount: 2 });

    expectError(await api().patch(`/api/v1/series/${id}`).set(stud.auth).send({ title: 'hack' }), 403, 'FORBIDDEN');
    expect((await api().patch(`/api/v1/series/${id}`).set(prof.auth).send({ title: 'Algèbre L1' })).body.title).toBe('Algèbre L1');
    expect((await api().delete(`/api/v1/series/${id}`).set(prof.auth)).status).toBe(204);
    expectError(await api().get(`/api/v1/series/${id}`).set(stud.auth), 404, 'NOT_FOUND');
    expect((await api().get(`/api/v1/posts/${p2.id}`).set(stud.auth)).status).toBe(200); // posts kept
  });
});
