import { beforeAll, describe, expect, it } from 'vitest';
import { api, expectError, fixture, registerUser, resetDb, type TestUser } from './helpers.js';

let owner: TestUser;
let member: TestUser;

beforeAll(async () => {
  await resetDb();
  owner = await registerUser({ username: 'owner' });
  member = await registerUser({ username: 'member' });
});

describe('communities', () => {
  let id: string;

  it('creates a community (owner auto-joins) and enforces unique names', async () => {
    const res = await api()
      .post('/api/v1/communities')
      .set(owner.auth)
      .send({ name: 'Informatique L3', description: 'Entraide en info', kind: 'faculty', icon: 'laptop-outline', color: '#3366FF' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Informatique L3', kind: 'faculty', icon: 'laptop-outline', color: '#3366FF', memberCount: 1, postCount: 0, isMember: true, isOwner: true, avatarUrl: null });
    id = res.body.id;
    expectError(await api().post('/api/v1/communities').set(member.auth).send({ name: 'informatique l3', kind: 'topic', icon: 'apps-outline', color: '#000000' }), 409, 'CONFLICT');
    expectError(await api().post('/api/v1/communities').set(member.auth).send({ name: 'ok name', kind: 'club', icon: 'x', color: 'red' }), 400, 'VALIDATION_ERROR');

    // multipart with avatar
    const mp = await api().post('/api/v1/communities').set(member.auth).field('name', 'Sorbonne Université').field('kind', 'university').field('icon', 'school-outline').field('color', '#aa0000').attach('avatar', fixture('image.png'));
    expect(mp.status).toBe(201);
    expect(mp.body.avatarUrl).toMatch(/avatars\//);
  });

  it('joins and leaves; owner cannot leave; join notifies owner', async () => {
    const j = await api().post(`/api/v1/communities/${id}/join`).set(member.auth);
    expect(j.body).toEqual({ isMember: true, memberCount: 2 });
    const n = await api().get('/api/v1/notifications').set(owner.auth);
    expect(n.body.items[0]).toMatchObject({ type: 'community_join', community: { id, name: 'Informatique L3' }, actor: { username: 'member' } });
    expect((await api().get(`/api/v1/communities/${id}`).set(member.auth)).body).toMatchObject({ isMember: true, isOwner: false, memberCount: 2 });

    const members = await api().get(`/api/v1/communities/${id}/members`).set(member.auth);
    expect(members.body.items.map((u: any) => u.username).sort()).toEqual(['member', 'owner']);
    const mine = await api().get('/api/v1/communities?mine=true').set(member.auth);
    expect(mine.body.items.map((c: any) => c.id)).toContain(id);

    expectError(await api().delete(`/api/v1/communities/${id}/join`).set(owner.auth), 403, 'FORBIDDEN');
    const l = await api().delete(`/api/v1/communities/${id}/join`).set(member.auth);
    expect(l.body).toEqual({ isMember: false, memberCount: 1 });
  });

  it('requires membership to post, lists community posts', async () => {
    expectError(await api().post('/api/v1/posts').set(member.auth).send({ type: 'post', text: 'hello', category: 'programming', communityId: id }), 403, 'FORBIDDEN');
    await api().post(`/api/v1/communities/${id}/join`).set(member.auth);
    const p = await api().post('/api/v1/posts').set(member.auth).send({ type: 'post', text: 'hello community', category: 'programming', communityId: id });
    expect(p.status).toBe(201);
    expect(p.body.community).toEqual({ id, name: 'Informatique L3' });
    const posts = await api().get(`/api/v1/communities/${id}/posts`).set(owner.auth);
    expect(posts.body.items.map((x: any) => x.id)).toEqual([p.body.id]);
    expect((await api().get(`/api/v1/communities/${id}`).set(owner.auth)).body.postCount).toBe(1);
  });

  it('only the owner can edit or delete', async () => {
    expectError(await api().patch(`/api/v1/communities/${id}`).set(member.auth).send({ description: 'hacked' }), 403, 'FORBIDDEN');
    const ok = await api().patch(`/api/v1/communities/${id}`).set(owner.auth).send({ description: 'Nouvelle description', color: '#00ff00' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ description: 'Nouvelle description', color: '#00ff00' });

    const list = await api().get('/api/v1/communities?q=nouvelle&kind=faculty').set(member.auth);
    expect(list.body.items.map((c: any) => c.id)).toEqual([id]);
    const recent = await api().get('/api/v1/communities?sort=recent&limit=1').set(member.auth);
    expect(recent.body.items).toHaveLength(1);
    expect(recent.body.nextCursor).toBeTypeOf('string');

    expectError(await api().delete(`/api/v1/communities/${id}`).set(member.auth), 403, 'FORBIDDEN');
    expect((await api().delete(`/api/v1/communities/${id}`).set(owner.auth)).status).toBe(204);
    expectError(await api().get(`/api/v1/communities/${id}`).set(owner.auth), 404, 'NOT_FOUND');
  });
});
