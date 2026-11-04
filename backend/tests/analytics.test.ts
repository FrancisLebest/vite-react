import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { api, createTextPost, expectError, registerUser, resetDb, type TestUser } from './helpers.js';

let creator: TestUser;
let fans: TestUser[];

beforeAll(async () => {
  await resetDb();
  creator = await registerUser({ username: 'creator_a', role: 'creator' });
  fans = [await registerUser({ username: 'fan_1' }), await registerUser({ username: 'fan_2' }), await registerUser({ username: 'fan_3' })];
});

describe('creator analytics', () => {
  it('returns zero-filled daily series, totals and top posts', async () => {
    const hit = await createTextPost(creator, 'Mon meilleur post');
    const meh = await createTextPost(creator, 'Post moyen');
    for (const f of fans) {
      await api().post(`/api/v1/posts/${hit.id}/view`).set(f.auth);
      await api().post(`/api/v1/posts/${hit.id}/view`).set(f.auth); // same day: counted once
      await api().post(`/api/v1/posts/${hit.id}/like`).set(f.auth);
      await api().post(`/api/v1/users/${creator.user.id}/follow`).set(f.auth);
    }
    await api().post(`/api/v1/posts/${meh.id}/view`).set(fans[0]!.auth);
    await api().post(`/api/v1/posts/${hit.id}/comments`).set(fans[0]!.auth).send({ text: 'génial' });
    await api().post(`/api/v1/posts/${hit.id}/comments`).set(creator.auth).send({ text: 'merci' }); // own comment excluded
    await api().post(`/api/v1/posts/${hit.id}/share`).set(fans[1]!.auth);
    await api().post(`/api/v1/posts/${hit.id}/like`).set(creator.auth); // own like excluded

    // A view from 3 days ago (backfilled) lands on its own day.
    await pool.query(
      `INSERT INTO post_stats_daily (post_id, day, views) VALUES ($1, (now() AT TIME ZONE 'UTC')::date - 3, 5)`,
      [meh.id],
    );

    const res = await api().get('/api/v1/me/analytics?range=7d').set(creator.auth);
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.range).toBe('7d');
    expect(body.daily).toHaveLength(7);
    expect(body.daily[6].date).toBe(body.to);
    expect(body.daily[0].date).toBe(body.from);
    expect(body.totals).toEqual({ views: 9, likes: 3, comments: 1, shares: 1, newFollowers: 3 });
    expect(body.daily[6]).toMatchObject({ views: 4, likes: 3, comments: 1, shares: 1, newFollowers: 3 });
    expect(body.daily[3].views).toBe(5);
    expect(body.topPosts[0]).toMatchObject({ post: { id: meh.id }, views: 6 });
    expect(body.topPosts[1]).toMatchObject({ post: { id: hit.id }, views: 3, likes: 3, comments: 1, shares: 1 });
    expect(body).toMatchObject({ followerCount: 3, postCount: 2 });

    expect((await api().get('/api/v1/me/analytics').set(creator.auth)).body.daily).toHaveLength(28);
    expect((await api().get('/api/v1/me/analytics?range=90d').set(creator.auth)).body.daily).toHaveLength(90);
    expectError(await api().get('/api/v1/me/analytics?range=1y').set(creator.auth), 400, 'VALIDATION_ERROR');
  });
});
