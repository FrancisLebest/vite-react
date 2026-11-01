import {ApiClient, buildQuery, TokenStorage} from '../src/api/client';
import {ApiError, errorFromResponse, fieldErrors, normalizeError} from '../src/api/errors';
import {createEndpoints} from '../src/api/endpoints';
import type {TokenPair} from '../src/api/types';
import {createFetchMock, page} from './helpers/fetchMock';

function memoryStorage(initial: TokenPair | null = null) {
  let value = initial;
  const storage: TokenStorage & {value: () => TokenPair | null} = {
    load: jest.fn(async () => value),
    save: jest.fn(async t => {
      value = t;
    }),
    clear: jest.fn(async () => {
      value = null;
    }),
    value: () => value,
  };
  return storage;
}

const BASE = 'http://api.test';

describe('buildQuery', () => {
  it('skips empty values and encodes', () => {
    expect(buildQuery({q: 'a b', cursor: undefined, mine: true, x: '', n: 0})).toBe(
      '?q=a%20b&mine=true&n=0',
    );
    expect(buildQuery({})).toBe('');
  });
});

describe('ApiClient', () => {
  it('attaches the bearer token and parses JSON', async () => {
    const {fetch, calls} = createFetchMock({
      'GET /feed': () => ({body: page([{id: 'p1'}], 'c2')}),
    });
    const storage = memoryStorage({accessToken: 'A1', refreshToken: 'R1'});
    const client = new ApiClient({baseUrl: BASE, storage, fetch});
    await client.restore();
    const api = createEndpoints(client);
    const res = await api.posts.feed({tab: 'forYou', type: 'video'}, 'c1');
    expect(res).toEqual({items: [{id: 'p1'}], nextCursor: 'c2'});
    expect(calls[0].headers.Authorization).toBe('Bearer A1');
    expect(calls[0].query.get('tab')).toBe('forYou');
    expect(calls[0].query.get('type')).toBe('video');
    expect(calls[0].query.get('cursor')).toBe('c1');
  });

  it('refreshes once for concurrent 401s (single-flight) and replays requests', async () => {
    let refreshCount = 0;
    const {fetch, calls} = createFetchMock({
      'POST /auth/refresh': async req => {
        refreshCount++;
        expect(req.body).toEqual({refreshToken: 'R1'});
        await new Promise(r => setTimeout(r, 10));
        return {body: {accessToken: 'A2', refreshToken: 'R2'}};
      },
      'GET /auth/me': req =>
        req.headers.Authorization === 'Bearer A2'
          ? {body: {id: 'me'}}
          : {status: 401, body: {error: {code: 'UNAUTHORIZED', message: 'jwt expired'}}},
      'GET /notifications/unread-count': req =>
        req.headers.Authorization === 'Bearer A2'
          ? {body: {count: 3}}
          : {status: 401, body: {error: {code: 'UNAUTHORIZED', message: 'jwt expired'}}},
    });
    const storage = memoryStorage({accessToken: 'A1', refreshToken: 'R1'});
    const client = new ApiClient({baseUrl: BASE, storage, fetch});
    await client.restore();
    const onTokens = jest.fn();
    client.onTokensChanged(onTokens);

    const [a, b, c] = await Promise.all([
      client.get('/auth/me'),
      client.get('/notifications/unread-count'),
      client.get('/auth/me'),
    ]);
    expect(a).toEqual({id: 'me'});
    expect(b).toEqual({count: 3});
    expect(c).toEqual({id: 'me'});
    expect(refreshCount).toBe(1);
    expect(storage.value()).toEqual({accessToken: 'A2', refreshToken: 'R2'});
    expect(onTokens).toHaveBeenCalledWith({accessToken: 'A2', refreshToken: 'R2'});
    expect(calls.filter(r => r.path === '/auth/refresh')).toHaveLength(1);
  });

  it('clears the session and notifies when the refresh token is rejected', async () => {
    const {fetch} = createFetchMock({
      'GET /auth/me': () => ({status: 401, body: {error: {code: 'UNAUTHORIZED', message: 'expired'}}}),
      'POST /auth/refresh': () => ({
        status: 401,
        body: {error: {code: 'UNAUTHORIZED', message: 'Invalid refresh token'}},
      }),
    });
    const storage = memoryStorage({accessToken: 'A1', refreshToken: 'R1'});
    const client = new ApiClient({baseUrl: BASE, storage, fetch});
    await client.restore();
    const expired = jest.fn();
    client.onSessionExpired(expired);
    await expect(client.get('/auth/me')).rejects.toMatchObject({code: 'UNAUTHORIZED', status: 401});
    expect(expired).toHaveBeenCalledTimes(1);
    expect(storage.value()).toBeNull();
    expect(client.accessToken).toBeNull();
  });

  it('keeps the session when the refresh fails because of the network', async () => {
    const fetch = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        throw new TypeError('Network request failed');
      }
      return {ok: false, status: 401, text: async () => ''} as unknown as Response;
    }) as unknown as typeof globalThis.fetch;
    const storage = memoryStorage({accessToken: 'A1', refreshToken: 'R1'});
    const client = new ApiClient({baseUrl: BASE, storage, fetch});
    await client.restore();
    const expired = jest.fn();
    client.onSessionExpired(expired);
    await expect(client.get('/auth/me')).rejects.toMatchObject({code: 'NETWORK_ERROR'});
    expect(expired).not.toHaveBeenCalled();
    expect(storage.value()).toEqual({accessToken: 'A1', refreshToken: 'R1'});
  });

  it('does not try to refresh for unauthenticated endpoints (login)', async () => {
    const {fetch, calls} = createFetchMock({
      'POST /auth/login': () => ({
        status: 401,
        body: {error: {code: 'UNAUTHORIZED', message: 'Invalid credentials'}},
      }),
    });
    const client = new ApiClient({baseUrl: BASE, storage: memoryStorage(), fetch});
    const api = createEndpoints(client);
    await expect(api.auth.login('x', 'y')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
    expect(calls.map(c => c.path)).toEqual(['/auth/login']);
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('normalizes errors: contract body, non-JSON 5xx, network failure', async () => {
    const {fetch} = createFetchMock({
      'POST /auth/register': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid body',
            details: [{path: 'email', message: 'Invalid email', code: 'invalid_string'}],
          },
        },
      }),
      'GET /categories': () => ({status: 502, raw: '<html>Bad gateway</html>'}),
    });
    const client = new ApiClient({baseUrl: BASE, storage: memoryStorage(), fetch});
    const api = createEndpoints(client);

    const e1 = await api.auth
      .register({name: 'A', username: 'a', email: 'bad', password: 'x'})
      .catch(e => e);
    expect(e1).toBeInstanceOf(ApiError);
    expect(e1.code).toBe('VALIDATION_ERROR');
    expect(e1.fields).toEqual({email: 'Invalid email'});

    const e2 = await api.posts.categories().catch(e => e);
    expect(e2).toMatchObject({status: 502, code: 'INTERNAL'});

    const offline = new ApiClient({
      baseUrl: BASE,
      storage: memoryStorage(),
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    await expect(offline.get('/categories')).rejects.toMatchObject({code: 'NETWORK_ERROR', status: 0});
  });
});

describe('error helpers', () => {
  it('maps statuses without a body', () => {
    expect(errorFromResponse(404, '').code).toBe('NOT_FOUND');
    expect(errorFromResponse(429, 'nope').code).toBe('RATE_LIMITED');
    expect(errorFromResponse(413, '').code).toBe('VALIDATION_ERROR');
  });

  it('reads CONFLICT {field} details as a field error', () => {
    const e = errorFromResponse(
      409,
      JSON.stringify({error: {code: 'CONFLICT', message: 'Taken', details: {field: 'username'}}}),
    );
    expect(e.fields).toEqual({username: 'This username is already taken.'});
  });

  it('extracts field errors from several shapes', () => {
    expect(fieldErrors({fieldErrors: {name: ['Too short']}})).toEqual({name: 'Too short'});
    expect(fieldErrors([{path: ['user', 'email'], message: 'Bad'}])).toEqual({'user.email': 'Bad'});
    expect(fieldErrors(null)).toEqual({});
  });

  it('normalizes unknown throwables', () => {
    expect(normalizeError(new TypeError('x')).code).toBe('NETWORK_ERROR');
    expect(normalizeError({name: 'AbortError'}).code).toBe('ABORTED');
    expect(normalizeError(new Error('boom')).code).toBe('UNKNOWN');
  });
});

describe('upload', () => {
  it('sends multipart through XHR with progress and auth header', async () => {
    const headers: Record<string, string> = {};
    let sent: unknown;
    const xhr: Record<string, unknown> & {upload: Record<string, unknown>} = {
      upload: {},
      status: 201,
      responseText: JSON.stringify({id: 'p9'}),
      open: jest.fn(),
      setRequestHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      send: (body: unknown) => {
        sent = body;
        (xhr.upload.onprogress as (e: unknown) => void)({lengthComputable: true, loaded: 50, total: 100});
        (xhr.onload as () => void)();
      },
    };
    const client = new ApiClient({
      baseUrl: BASE,
      storage: memoryStorage({accessToken: 'A1', refreshToken: 'R1'}),
      createXHR: () => xhr as unknown as XMLHttpRequest,
    });
    await client.restore();
    const progress: number[] = [];
    const api = createEndpoints(client);
    const post = await api.posts.create(
      {type: 'video', text: 'hi', category: 'math', media: {uri: 'file:///v.mp4', name: 'v.mp4', type: 'video/mp4'}},
      {onProgress: p => progress.push(p)},
    );
    expect(post).toEqual({id: 'p9'});
    expect(xhr.open).toHaveBeenCalledWith('POST', `${BASE}/api/v1/posts`);
    expect(headers.Authorization).toBe('Bearer A1');
    expect(sent).toBeInstanceOf(FormData);
    expect(progress).toEqual([0.5, 1]);
  });
});
