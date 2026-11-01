/* Minimal fetch router for tests. */
export interface MockReq {
  method: string;
  path: string; // without /api/v1 prefix and query
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}
export type MockRes = {status?: number; body?: unknown; raw?: string};
export type Handler = (req: MockReq) => MockRes | Promise<MockRes>;

export function response({status = 200, body, raw}: MockRes) {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

export function createFetchMock(routes: Record<string, Handler>) {
  const calls: MockReq[] = [];
  const fn = jest.fn(async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    const req: MockReq = {
      method,
      path,
      query: u.searchParams,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    };
    calls.push(req);
    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return response({status: 404, body: {error: {code: 'NOT_FOUND', message: `No mock for ${method} ${path}`}}});
    }
    return response(await handler(req));
  });
  return {fetch: fn as unknown as typeof fetch, calls};
}

export const page = <T,>(items: T[], nextCursor: string | null = null) => ({items, nextCursor});
