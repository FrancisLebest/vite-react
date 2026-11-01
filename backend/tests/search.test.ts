import { beforeAll, describe, expect, it } from 'vitest';
import { api, createTextPost, expectError, registerUser, resetDb, type TestUser } from './helpers.js';

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  await resetDb();
  a = await registerUser({ name: 'Léa Algèbre', username: 'lea_math', university: 'Université de Bordeaux' });
  b = await registerUser({ name: 'Hugo Physique', username: 'hugo', university: 'Université de Lille' });
  await createTextPost(a, 'Fiche de révision algèbre linéaire #algebre', { category: 'math' });
  await createTextPost(b, 'Les bases de la mécanique quantique #physique', { category: 'science' });
  const p = await createTextPost(b, 'Exercices corrigés en algèbre', { category: 'math' });
  await api().post(`/api/v1/posts/${p.id}/like`).set(a.auth);
  await api().post('/api/v1/communities').set(a.auth).send({ name: 'Algèbre & Co', description: 'Groupe de maths', kind: 'topic', icon: 'calculator-outline', color: '#123456' });
});

describe('search', () => {
  it('type=all returns grouped results', async () => {
    const res = await api().get('/api/v1/search?q=algèbre').set(b.auth);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.users.map((u: any) => u.username)).toEqual(['lea_math']);
    expect(res.body.communities.map((c: any) => c.name)).toEqual(['Algèbre & Co']);
    expect(res.body.total).toBe(4);
  });

  it('filters and sorts posts, paginates with total', async () => {
    const tag = await api().get('/api/v1/search?q=%23physique&type=posts').set(a.auth);
    expect(tag.body.items).toHaveLength(1);
    expect(tag.body.total).toBe(1);
    const cat = await api().get('/api/v1/search?q=&type=posts&category=math&sort=popular').set(a.auth);
    expect(cat.body.items).toHaveLength(2);
    expect(cat.body.items[0].text).toBe('Exercices corrigés en algèbre');
    const uni = await api().get('/api/v1/search?type=posts&university=bordeaux').set(a.auth);
    expect(uni.body.items.map((p: any) => p.author.username)).toEqual(['lea_math']);
    const p1 = await api().get('/api/v1/search?q=e&type=posts&sort=recent&limit=1').set(a.auth);
    expect(p1.body).toMatchObject({ total: 3, items: [expect.any(Object)] });
    const p2 = await api().get(`/api/v1/search?q=e&type=posts&sort=recent&limit=1&cursor=${p1.body.nextCursor}`).set(a.auth);
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);
  });

  it('searches users and communities, treats wildcards literally', async () => {
    const users = await api().get('/api/v1/search?q=hugo&type=users').set(a.auth);
    expect(users.body).toMatchObject({ total: 1, nextCursor: null });
    expect(users.body.items[0]).toMatchObject({ username: 'hugo', isFollowing: false });
    const lille = await api().get('/api/v1/search?type=users&university=lille').set(a.auth);
    expect(lille.body.items.map((u: any) => u.username)).toEqual(['hugo']);
    const comm = await api().get('/api/v1/search?q=maths&type=communities').set(a.auth);
    expect(comm.body.items[0]).toMatchObject({ name: 'Algèbre & Co', isOwner: true, isMember: true });
    const wild = await api().get('/api/v1/search?q=%25&type=posts').set(a.auth);
    expect(wild.body.total).toBe(0);
    expectError(await api().get('/api/v1/search?q=x&type=everything').set(a.auth), 400, 'VALIDATION_ERROR');
  });
});
