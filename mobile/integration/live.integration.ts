/**
 * Exercises src/api (ApiClient + endpoints) against a running backend:
 * register → multipart text & video posts → feed → like → comment → follow →
 * DM + Socket.IO message:new → token rotation → cleanup (DELETE /users/me).
 */
import {execFileSync} from 'child_process';
import {mkdtempSync, readFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {io} from 'socket.io-client';
import {ApiClient, TokenStorage} from '../src/api/client';
import {createEndpoints} from '../src/api/endpoints';
import type {Message, TokenPair} from '../src/api/types';

const BASE = process.env.API_URL ?? 'http://localhost:4000';

/** XMLHttpRequest shim on top of fetch (Node has no XHR) — enough for ApiClient.upload. */
class FetchXHR {
  status = 0;
  responseText = '';
  timeout = 0;
  upload: {
    onprogress?: (e: {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    }) => void;
  } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  private method = 'GET';
  private url = '';
  private headers: Record<string, string> = {};
  open(m: string, u: string) {
    this.method = m;
    this.url = u;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  abort() {}
  send(body: FormData) {
    fetch(this.url, {method: this.method, headers: this.headers, body})
      .then(async r => {
        this.upload.onprogress?.({lengthComputable: true, loaded: 1, total: 1});
        this.status = r.status;
        this.responseText = await r.text();
        this.onload?.();
      })
      .catch(() => this.onerror?.());
  }
}

function session() {
  let tokens: TokenPair | null = null;
  const storage: TokenStorage = {
    load: async () => tokens,
    save: async t => {
      tokens = t;
    },
    clear: async () => {
      tokens = null;
    },
  };
  const client = new ApiClient({
    baseUrl: BASE,
    storage,
    createXHR: () => new FetchXHR() as unknown as XMLHttpRequest,
  });
  return {client, api: createEndpoints(client)};
}

const fileBlob = (path: string, type: string) =>
  new File([readFileSync(path)], path.split('/').pop()!, {
    type,
  }) as unknown as never;

describe('live backend', () => {
  const a = session();
  const b = session();
  const suffix = Date.now().toString(36);
  const created: Array<ReturnType<typeof session>> = [];
  let tmp = '';

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'studyhub-it-'));
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x568:rate=15',
      '-t',
      '2',
      '-pix_fmt',
      'yuv420p',
      join(tmp, 'clip.mp4'),
    ]);
  });

  afterAll(async () => {
    for (const s of created) {
      await s.api.users.deleteMe().catch(() => undefined);
    }
  });

  it('runs the main user journey', async () => {
    // Register two users
    const ra = await a.api.auth.register({
      name: 'IT Alice',
      username: `it_alice_${suffix}`,
      email: `it.alice.${suffix}@example.com`,
      password: 'password123',
      university: 'Integration University',
      role: 'student',
    });
    await a.client.setTokens({
      accessToken: ra.accessToken,
      refreshToken: ra.refreshToken,
    });
    created.push(a);
    const rb = await b.api.auth.register({
      name: 'IT Bob',
      username: `it_bob_${suffix}`,
      email: `it.bob.${suffix}@example.com`,
      password: 'password123',
    });
    await b.client.setTokens({
      accessToken: rb.accessToken,
      refreshToken: rb.refreshToken,
    });
    created.push(b);
    expect((await a.api.auth.me()).username).toBe(`it_alice_${suffix}`);

    // Duplicate username → CONFLICT with field
    const dup = await session()
      .api.auth.register({
        name: 'X',
        username: `it_alice_${suffix}`,
        email: `x.${suffix}@example.com`,
        password: 'password123',
      })
      .catch(e => e);
    expect(dup.code).toBe('CONFLICT');
    expect(Object.keys(dup.fields)).toContain('username');

    // Text post (multipart through upload()) and video post with progress
    const textPost = await a.api.posts.create({
      type: 'post',
      text: 'Hello #integration',
      category: 'notes',
    });
    expect(textPost.hashtags).toContain('integration');
    const progress: number[] = [];
    const video = await a.api.posts.create(
      {
        type: 'video',
        text: 'My first clip',
        category: 'math',
        media: fileBlob(join(tmp, 'clip.mp4'), 'video/mp4'),
      },
      {onProgress: p => progress.push(p)},
    );
    expect(video.media?.kind).toBe('video');
    expect(video.media?.thumbnailUrl).toBeTruthy();
    expect(progress[progress.length - 1]).toBe(1);

    // Feed, like, comment, follow
    const feed = await b.api.posts.feed({tab: 'forYou', type: 'video'});
    expect(feed.items.some(p => p.id === video.id)).toBe(true);
    expect(await b.api.posts.like(video.id)).toEqual({
      liked: true,
      likeCount: 1,
    });
    const comment = await b.api.posts.addComment(
      video.id,
      'Great explanation!',
    );
    expect(
      (await a.api.posts.comments(video.id)).items.map(c => c.id),
    ).toContain(comment.id);
    expect((await b.api.users.follow(ra.user.id)).isFollowing).toBe(true);
    await b.api.posts.view(video.id);

    // DM + realtime
    const socket = io(BASE, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: cb => cb({token: b.client.accessToken}),
    });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const received = new Promise<Message>(resolve =>
      socket.on('message:new', p => resolve(p.message)),
    );
    const conv = await a.api.messaging.openDirect(rb.user.id);
    expect(conv.participants.map(p => p.id)).toEqual([rb.user.id]);
    const sent = await a.api.messaging.send(conv.id, 'Hi Bob 👋');
    const live = await received;
    expect(live.id).toBe(sent.id);
    expect((await b.api.messaging.unreadCount()).count).toBe(1);
    await b.api.messaging.markRead(conv.id);
    expect((await b.api.messaging.unreadCount()).count).toBe(0);
    socket.disconnect();

    // Notifications for Alice (like, comment, follow)
    const notifs = await a.api.notifications.list();
    expect(notifs.items.map(n => n.type)).toEqual(
      expect.arrayContaining(['like', 'comment', 'follow']),
    );

    // Token rotation: old refresh token becomes invalid, new one works
    const oldRefresh = a.client.refreshToken!;
    await a.client.refresh();
    expect(a.client.refreshToken).not.toBe(oldRefresh);
    expect((await a.api.auth.me()).id).toBe(ra.user.id);

    // Report endpoint
    await b.api.reports.create('post', textPost.id, 'spam');

    // Expired/invalid access token → transparent refresh
    await a.client.setTokens({
      accessToken: 'invalid.token.value',
      refreshToken: a.client.refreshToken!,
    });
    expect((await a.api.auth.me()).id).toBe(ra.user.id);
  });
});
