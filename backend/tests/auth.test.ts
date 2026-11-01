import { beforeAll, describe, expect, it } from 'vitest';
import { sentMails } from '../src/lib/mailer.js';
import { api, expectError, registerUser, resetDb } from './helpers.js';

beforeAll(resetDb);

describe('auth', () => {
  it('registers a user and returns Me + tokens without secrets', async () => {
    const res = await api().post('/api/v1/auth/register').send({
      name: 'Alice Martin',
      username: 'Alice.M',
      email: 'Alice@Example.com',
      password: 'supersecret',
      university: 'Sorbonne',
      role: 'professor',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    const u = res.body.user;
    expect(u).toMatchObject({
      username: 'alice.m',
      email: 'alice@example.com',
      name: 'Alice Martin',
      university: 'Sorbonne',
      role: 'professor',
      verified: false,
      isFollowing: false,
      avatarUrl: null,
      bio: null,
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
      mutualCount: 0,
      isMe: true,
      isBlocked: false,
    });
    expect(u.id).toBeTypeOf('string');
    expect(Date.parse(u.createdAt)).not.toBeNaN();
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('rejects duplicates with CONFLICT', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'X', username: 'alice.m', email: 'other@example.com', password: 'supersecret' });
    expectError(res, 409, 'CONFLICT');
    expect(res.body.error.details).toEqual({ field: 'username' });
    const res2 = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'X', username: 'someone', email: 'ALICE@example.com', password: 'supersecret' });
    expectError(res2, 409, 'CONFLICT');
    expect(res2.body.error.details).toEqual({ field: 'email' });
  });

  it('returns VALIDATION_ERROR with details for invalid input', async () => {
    const res = await api().post('/api/v1/auth/register').send({ name: '', username: 'a!', email: 'nope', password: 'short' });
    expectError(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.message).toBeTypeOf('string');
    const paths = res.body.error.details.map((d: any) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'username', 'email', 'password']));

    const bad = await api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"identifier":');
    expectError(bad, 400, 'VALIDATION_ERROR');
  });

  it('logs in with email or username, rejects bad credentials', async () => {
    const byEmail = await api().post('/api/v1/auth/login').send({ identifier: 'alice@example.com', password: 'supersecret' });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.user.username).toBe('alice.m');
    const byUsername = await api().post('/api/v1/auth/login').send({ identifier: 'ALICE.M', password: 'supersecret' });
    expect(byUsername.status).toBe(200);
    const wrong = await api().post('/api/v1/auth/login').send({ identifier: 'alice.m', password: 'wrongpass' });
    expectError(wrong, 401, 'UNAUTHORIZED');
    const unknown = await api().post('/api/v1/auth/login').send({ identifier: 'ghost', password: 'wrongpass' });
    expectError(unknown, 401, 'UNAUTHORIZED');
  });

  it('requires auth on protected routes', async () => {
    expectError(await api().get('/api/v1/auth/me'), 401, 'UNAUTHORIZED');
    expectError(await api().get('/api/v1/feed'), 401, 'UNAUTHORIZED');
    expectError(await api().get('/api/v1/feed').set('Authorization', 'Bearer garbage'), 401, 'UNAUTHORIZED');
    // public
    expect((await api().get('/api/v1/categories')).status).toBe(200);
    expect((await api().get('/health')).body).toEqual({ status: 'ok' });
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const u = await registerUser();
    const me = await api().get('/api/v1/auth/me').set(u.auth);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(u.user.email);

    const r1 = await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(u.refreshToken);
    expect(r1.body.accessToken).toBeTypeOf('string');
    const meAgain = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${r1.body.accessToken}`);
    expect(meAgain.status).toBe(200);

    // Reusing the old token fails and revokes the family (the new token too).
    expectError(await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }), 401, 'UNAUTHORIZED');
    expectError(await api().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }), 401, 'UNAUTHORIZED');
  });

  it('logout revokes the refresh token', async () => {
    const u = await registerUser();
    expect((await api().post('/api/v1/auth/logout').send({ refreshToken: u.refreshToken })).status).toBe(204);
    expectError(await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }), 401, 'UNAUTHORIZED');
  });

  it('resets the password with an emailed 6-digit code', async () => {
    const u = await registerUser();
    sentMails.length = 0;
    expect((await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' })).status).toBe(204);
    expect(sentMails).toHaveLength(0);
    expect((await api().post('/api/v1/auth/forgot-password').send({ email: u.user.email })).status).toBe(204);
    expect(sentMails).toHaveLength(1);
    const code = sentMails[0]!.text.match(/\b(\d{6})\b/)![1]!;

    const wrongCode = code === '000000' ? '111111' : '000000';
    expectError(
      await api().post('/api/v1/auth/reset-password').send({ email: u.user.email, code: wrongCode, newPassword: 'brandnewpass' }),
      400,
      'VALIDATION_ERROR',
    );
    const ok = await api().post('/api/v1/auth/reset-password').send({ email: u.user.email, code, newPassword: 'brandnewpass' });
    expect(ok.status).toBe(204);
    // code is single-use, refresh tokens revoked
    expectError(
      await api().post('/api/v1/auth/reset-password').send({ email: u.user.email, code, newPassword: 'another-pass' }),
      400,
      'VALIDATION_ERROR',
    );
    expectError(await api().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }), 401, 'UNAUTHORIZED');
    expect((await api().post('/api/v1/auth/login').send({ identifier: u.user.email, password: 'brandnewpass' })).status).toBe(200);
  });

  it('changes the password', async () => {
    const u = await registerUser();
    expectError(
      await api().post('/api/v1/auth/change-password').set(u.auth).send({ currentPassword: 'nope-nope', newPassword: 'newpassword1' }),
      400,
      'VALIDATION_ERROR',
    );
    const ok = await api().post('/api/v1/auth/change-password').set(u.auth).send({ currentPassword: u.password, newPassword: 'newpassword1' });
    expect(ok.status).toBe(204);
    expectError(await api().post('/api/v1/auth/login').send({ identifier: u.user.username, password: u.password }), 401, 'UNAUTHORIZED');
    expect((await api().post('/api/v1/auth/login').send({ identifier: u.user.username, password: 'newpassword1' })).status).toBe(200);
  });

  it('returns NOT_FOUND for unknown routes', async () => {
    const u = await registerUser();
    expectError(await api().get('/api/v1/does-not-exist').set(u.auth), 404, 'NOT_FOUND');
  });
});
