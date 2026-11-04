import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { filterText, setBlockedWords } from '../src/lib/contentFilter.js';
import { api, createTextPost, expectError, registerUser, resetDb, type TestUser } from './helpers.js';

let admin: TestUser;
let user: TestUser;
let troll: TestUser;

beforeAll(async () => {
  await resetDb();
  admin = await registerUser({ username: 'the_admin', email: 'admin@example.com' });
  user = await registerUser({ username: 'reporter' });
  troll = await registerUser({ username: 'troll' });
  // real CLI
  const out = execFileSync('npx', ['tsx', 'src/scripts/make-admin.ts', 'ADMIN@example.com'], { env: process.env }).toString();
  expect(out).toContain('@the_admin is now an administrator');
});

describe('admin & moderation', () => {
  it('exposes isAdmin and protects admin routes', async () => {
    expect((await api().get('/api/v1/auth/me').set(admin.auth)).body.isAdmin).toBe(true);
    expectError(await api().get('/api/v1/admin/reports').set(user.auth), 403, 'FORBIDDEN');
  });

  it('works through the reports queue (resolve with removal, dismiss)', async () => {
    const bad = await createTextPost(troll, 'contenu douteux');
    const other = await createTextPost(troll, 'contenu ok');
    const r1 = (await api().post('/api/v1/reports').set(user.auth).send({ targetType: 'post', targetId: bad.id, reason: 'inappropriate', details: 'voir' })).body;
    const r2 = (await api().post('/api/v1/reports').set(user.auth).send({ targetType: 'post', targetId: other.id, reason: 'spam' })).body;
    const queue = await api().get('/api/v1/admin/reports?status=open').set(admin.auth);
    expect(queue.body.items.map((r: any) => r.id)).toEqual([r1.id, r2.id]);
    expect(queue.body.items[0]).toMatchObject({ targetType: 'post', targetPreview: 'contenu douteux', targetAuthor: { username: 'troll' }, reporter: { username: 'reporter' }, status: 'open' });

    const resolved = await api().post(`/api/v1/admin/reports/${r1.id}/resolve`).set(admin.auth).send({ action: 'remove_content', note: 'retiré' });
    expect(resolved.body).toMatchObject({ status: 'reviewed', resolution: 'content_removed', note: 'retiré', resolvedBy: { username: 'the_admin' } });
    expectError(await api().get(`/api/v1/posts/${bad.id}`).set(user.auth), 404, 'NOT_FOUND');
    const dismissed = await api().post(`/api/v1/admin/reports/${r2.id}/dismiss`).set(admin.auth).send({});
    expect(dismissed.body.status).toBe('dismissed');
    expect((await api().get('/api/v1/admin/reports').set(admin.auth)).body.items).toEqual([]);
    expect((await api().get('/api/v1/admin/reports?status=reviewed').set(admin.auth)).body.items).toHaveLength(1);

    // direct removals
    const c = (await api().post(`/api/v1/posts/${other.id}/comments`).set(troll.auth).send({ text: 'spam' })).body;
    expect((await api().delete(`/api/v1/admin/comments/${c.id}`).set(admin.auth)).status).toBe(204);
    const comm = (await api().post('/api/v1/communities').set(troll.auth).send({ name: 'Spam club', kind: 'topic' })).body;
    expect((await api().delete(`/api/v1/admin/communities/${comm.id}`).set(admin.auth)).status).toBe(204);
    expect((await api().delete(`/api/v1/admin/posts/${other.id}`).set(admin.auth)).status).toBe(204);
  });

  it('suspends and unsuspends users (403 ACCOUNT_SUSPENDED)', async () => {
    expectError(await api().post(`/api/v1/admin/users/${admin.user.id}/suspend`).set(admin.auth).send({}), 400, 'VALIDATION_ERROR');
    expect((await api().post(`/api/v1/admin/users/${troll.user.id}/suspend`).set(admin.auth).send({ reason: 'harcèlement' })).status).toBe(204);
    const r = await api().get('/api/v1/auth/me').set(troll.auth);
    expectError(r, 403, 'ACCOUNT_SUSPENDED');
    expect(r.body.error.details).toEqual({ reason: 'harcèlement' });
    expectError(await api().post('/api/v1/auth/login').send({ identifier: 'troll', password: troll.password }), 403, 'ACCOUNT_SUSPENDED');
    expectError(await api().post('/api/v1/auth/refresh').send({ refreshToken: troll.refreshToken }), 403, 'ACCOUNT_SUSPENDED');
    expectError(await api().get(`/api/v1/users/${troll.user.id}`).set(user.auth), 404, 'NOT_FOUND');

    expect((await api().delete(`/api/v1/admin/users/${troll.user.id}/suspend`).set(admin.auth)).status).toBe(204);
    const login = await api().post('/api/v1/auth/login').send({ identifier: 'troll', password: troll.password });
    expect(login.status).toBe(200);
    // refresh tokens were revoked by the suspension
    expectError(await api().post('/api/v1/auth/refresh').send({ refreshToken: troll.refreshToken }), 401, 'UNAUTHORIZED');
  });

  it('handles verification requests', async () => {
    const req1 = await api().post('/api/v1/me/verification-request').set(user.auth).send({ message: 'Je suis enseignant' });
    expect(req1.status).toBe(201);
    expect(req1.body).toMatchObject({ status: 'pending', message: 'Je suis enseignant', user: { username: 'reporter' } });
    expectError(await api().post('/api/v1/me/verification-request').set(user.auth).send({}), 409, 'CONFLICT');
    expect((await api().get('/api/v1/me/verification-request').set(user.auth)).body.id).toBe(req1.body.id);
    const pending = await api().get('/api/v1/admin/verification-requests').set(admin.auth);
    expect(pending.body.items.map((v: any) => v.id)).toEqual([req1.body.id]);
    const ok = await api().post(`/api/v1/admin/verification-requests/${req1.body.id}/approve`).set(admin.auth);
    expect(ok.body.status).toBe('approved');
    expectError(await api().post(`/api/v1/admin/verification-requests/${req1.body.id}/reject`).set(admin.auth), 409, 'CONFLICT');
    expect((await api().get('/api/v1/auth/me').set(user.auth)).body.verified).toBe(true);
    expect((await api().get('/api/v1/notifications').set(user.auth)).body.items[0]).toMatchObject({ type: 'verification' });
    expectError(await api().post('/api/v1/me/verification-request').set(user.auth).send({}), 409, 'CONFLICT');
    expect((await api().get('/api/v1/me/verification-request').set(troll.auth)).body).toBeNull();
  });
});

describe('content filter', () => {
  it('masks blocked words by default (accent/case-insensitive, prefixes)', async () => {
    const p = await createTextPost(user, 'Quel PUTAIN de partiel, fucking hard. Bonne chance !');
    expect(p.text).toBe('Quel ****** de partiel, ******* hard. Bonne chance !');
    const c = await api().post(`/api/v1/posts/${p.id}/comments`).set(admin.auth).send({ text: 'Espèce de connard' });
    expect(c.body.text).toBe('Espèce de *******');
    expect(filterText('classic assessment', 'text')).toBe('classic assessment');
  });

  it('rejects in reject mode and supports custom words', () => {
    setBlockedWords(['tricherie']);
    expect(filterText('pas de Tricherie', 'text')).toBe('pas de *********');
    expect(() => filterText('pas de tricherie', 'text', 'reject')).toThrowError(/blocked words/);
    expect(filterText('pas de tricherie', 'text', 'off')).toBe('pas de tricherie');
  });
});
