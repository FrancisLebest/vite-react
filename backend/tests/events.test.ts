import { beforeAll, describe, expect, it } from 'vitest';
import { api, expectError, registerUser, resetDb, type TestUser } from './helpers.js';

let owner: TestUser;
let member: TestUser;
let quiet: TestUser;
let outsider: TestUser;
let communityId: string;

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

beforeAll(async () => {
  await resetDb();
  owner = await registerUser({ username: 'ev_owner' });
  member = await registerUser({ username: 'ev_member' });
  quiet = await registerUser({ username: 'ev_quiet' });
  outsider = await registerUser({ username: 'ev_out' });
  communityId = (await api().post('/api/v1/communities').set(owner.auth).send({ name: 'Groupe de révision', kind: 'topic' })).body.id;
  await api().post(`/api/v1/communities/${communityId}/join`).set(member.auth);
  await api().post(`/api/v1/communities/${communityId}/join`).set(quiet.auth);
  await api().put('/api/v1/users/me/settings').set(quiet.auth).send({ notifications: { events: false } });
});

describe('community events', () => {
  let eventId: string;

  it('lets members create events and notifies other members (respecting preferences)', async () => {
    expectError(await api().post(`/api/v1/communities/${communityId}/events`).set(outsider.auth).send({ title: 'Nope', startsAt: inDays(1) }), 403, 'FORBIDDEN');
    expectError(await api().post(`/api/v1/communities/${communityId}/events`).set(member.auth).send({ title: 'Passé', startsAt: inDays(-1) }), 400, 'VALIDATION_ERROR');
    expectError(await api().post(`/api/v1/communities/${communityId}/events`).set(member.auth).send({ title: 'Bad', startsAt: inDays(2), endsAt: inDays(1) }), 400, 'VALIDATION_ERROR');
    expectError(await api().post(`/api/v1/communities/${communityId}/events`).set(member.auth).send({ title: 'Bad url', startsAt: inDays(2), onlineUrl: 'javascript:alert(1)' }), 400, 'VALIDATION_ERROR');

    const res = await api()
      .post(`/api/v1/communities/${communityId}/events`)
      .set(member.auth)
      .send({ title: 'Session révision partiels', description: 'Chapitres 1 à 4', startsAt: inDays(2), endsAt: inDays(2.1), location: 'BU salle 3', onlineUrl: 'https://meet.example.com/abc' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      community: { id: communityId, name: 'Groupe de révision' },
      title: 'Session révision partiels',
      location: 'BU salle 3',
      onlineUrl: 'https://meet.example.com/abc',
      creator: { username: 'ev_member' },
      goingCount: 1,
      myRsvp: 'going',
      canEdit: true,
    });
    eventId = res.body.id;
    const n = (await api().get('/api/v1/notifications').set(owner.auth)).body.items[0];
    expect(n).toMatchObject({ type: 'event', event: { id: eventId, title: 'Session révision partiels' }, community: { id: communityId } });
    expect((await api().get('/api/v1/notifications').set(quiet.auth)).body.items.some((x: any) => x.type === 'event')).toBe(false);
  });

  it('handles RSVPs, listings and permissions', async () => {
    expect((await api().put(`/api/v1/events/${eventId}/rsvp`).set(owner.auth).send({ status: 'going' })).body).toEqual({ myRsvp: 'going', goingCount: 2 });
    expect((await api().put(`/api/v1/events/${eventId}/rsvp`).set(quiet.auth).send({ status: 'not_going' })).body).toEqual({ myRsvp: 'not_going', goingCount: 2 });
    expect((await api().put(`/api/v1/events/${eventId}/rsvp`).set(owner.auth).send({ status: 'not_going' })).body.goingCount).toBe(1);
    expect((await api().delete(`/api/v1/events/${eventId}/rsvp`).set(owner.auth)).body).toEqual({ myRsvp: null, goingCount: 1 });
    expectError(await api().put(`/api/v1/events/${eventId}/rsvp`).set(outsider.auth).send({ status: 'going' }), 403, 'FORBIDDEN');
    expectError(await api().put(`/api/v1/events/${eventId}/rsvp`).set(owner.auth).send({ status: 'maybe' }), 400, 'VALIDATION_ERROR');

    const later = (await api().post(`/api/v1/communities/${communityId}/events`).set(owner.auth).send({ title: 'Plus tard', startsAt: inDays(10) })).body;
    const upcoming = await api().get(`/api/v1/communities/${communityId}/events`).set(member.auth);
    expect(upcoming.body.items.map((e: any) => e.id)).toEqual([eventId, later.id]);
    expect((await api().get(`/api/v1/communities/${communityId}/events?when=past`).set(member.auth)).body.items).toEqual([]);
    const mine = await api().get('/api/v1/me/events').set(quiet.auth);
    expect(mine.body.items.map((e: any) => e.id)).toEqual([eventId, later.id]);
    const going = await api().get('/api/v1/me/events?rsvp=going').set(member.auth);
    expect(going.body.items.map((e: any) => e.id)).toEqual([eventId]);
    expect((await api().get('/api/v1/me/events').set(outsider.auth)).body.items).toEqual([]);

    expectError(await api().patch(`/api/v1/events/${eventId}`).set(quiet.auth).send({ title: 'Hack' }), 403, 'FORBIDDEN');
    const edited = await api().patch(`/api/v1/events/${eventId}`).set(owner.auth).send({ title: 'Session déplacée', location: null });
    expect(edited.body).toMatchObject({ title: 'Session déplacée', location: null, canEdit: true });
    expect((await api().get(`/api/v1/events/${eventId}`).set(quiet.auth)).body.canEdit).toBe(false);
    expectError(await api().delete(`/api/v1/events/${later.id}`).set(member.auth), 403, 'FORBIDDEN');
    expect((await api().delete(`/api/v1/events/${later.id}`).set(owner.auth)).status).toBe(204);
    expectError(await api().get(`/api/v1/events/${later.id}`).set(owner.auth), 404, 'NOT_FOUND');
  });
});
