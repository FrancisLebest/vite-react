import {ApiError, errorFromResponse, normalizeError} from './errors';
import type {TokenPair} from './types';

export interface TokenStorage {
  load(): Promise<TokenPair | null>;
  save(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  query?: Query;
  /** JSON body (serialized) */
  body?: unknown;
  /** Attach the access token and retry once after refresh on 401 (default true). */
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface UploadOptions {
  query?: Query;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Minimal XMLHttpRequest surface we use (eases testing). */
export type XHRFactory = () => XMLHttpRequest;

export interface ApiClientOptions {
  /** e.g. http://10.0.2.2:4000 (without /api/v1) */
  baseUrl: string;
  storage: TokenStorage;
  fetch?: typeof fetch;
  createXHR?: XHRFactory;
  timeoutMs?: number;
}

type Listener<T> = (value: T) => void;

export function buildQuery(query?: Query): string {
  if (!query) {
    return '';
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') {
      continue;
    }
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Typed HTTP client for the StudyHub API.
 *
 * - attaches `Authorization: Bearer <accessToken>`
 * - on 401: refreshes the token pair ONCE for all concurrent callers
 *   (single-flight, refresh-token rotation) and replays the request
 * - if the refresh is rejected by the server the session is cleared and
 *   `onSessionExpired` listeners are notified (→ logout)
 * - normalizes every failure into an `ApiError`
 */
export class ApiClient {
  readonly baseUrl: string;
  readonly apiUrl: string;
  private storage: TokenStorage;
  private fetchImpl: typeof fetch;
  private createXHR: XHRFactory;
  private timeoutMs: number;
  private tokens: TokenPair | null = null;
  private refreshing: Promise<string> | null = null;
  private tokenListeners = new Set<Listener<TokenPair | null>>();
  private expiredListeners = new Set<Listener<void>>();

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiUrl = `${this.baseUrl}/api/v1`;
    this.storage = opts.storage;
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args));
    this.createXHR = opts.createXHR ?? (() => new XMLHttpRequest());
    this.timeoutMs = opts.timeoutMs ?? 20000;
  }

  /* ----------------------------- tokens ----------------------------- */

  get accessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.tokens?.refreshToken ?? null;
  }

  /** Restore tokens from secure storage. Returns true if a session exists. */
  async restore(): Promise<boolean> {
    try {
      this.tokens = await this.storage.load();
    } catch {
      this.tokens = null;
    }
    return !!this.tokens;
  }

  async setTokens(tokens: TokenPair | null): Promise<void> {
    this.tokens = tokens;
    this.tokenListeners.forEach(l => l(tokens));
    try {
      if (tokens) {
        await this.storage.save(tokens);
      } else {
        await this.storage.clear();
      }
    } catch {
      // Secure storage failures must not break the in-memory session.
    }
  }

  onTokensChanged(l: Listener<TokenPair | null>): () => void {
    this.tokenListeners.add(l);
    return () => this.tokenListeners.delete(l);
  }

  onSessionExpired(l: Listener<void>): () => void {
    this.expiredListeners.add(l);
    return () => this.expiredListeners.delete(l);
  }

  /**
   * Rotate the token pair. Concurrent callers share the same in-flight promise.
   * Resolves with the new access token.
   */
  refresh(): Promise<string> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<string> {
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) {
      await this.expire();
      throw new ApiError(401, 'UNAUTHORIZED');
    }
    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({refreshToken}),
      });
    } catch (e) {
      // Network failure: keep the session, the caller can retry later.
      throw normalizeError(e);
    }
    const text = await res.text();
    if (!res.ok) {
      const err = errorFromResponse(res.status, text);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        await this.expire();
        throw new ApiError(401, 'UNAUTHORIZED', undefined, err.details);
      }
      throw err;
    }
    const pair = JSON.parse(text) as TokenPair;
    await this.setTokens(pair);
    return pair.accessToken;
  }

  private async expire() {
    await this.setTokens(null);
    this.expiredListeners.forEach(l => l());
  }

  /* ----------------------------- requests ---------------------------- */

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = this.timeoutMs,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, timeoutMs);
    const onAbort = () => controller?.abort();
    signal?.addEventListener?.('abort', onAbort);
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller?.signal ?? signal,
      });
    } catch (e) {
      if (timedOut) {
        throw new ApiError(0, 'TIMEOUT');
      }
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }
  }

  async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const {auth = true} = opts;
    const url = `${this.apiUrl}${path}${buildQuery(opts.query)}`;

    const send = async (token: string | null) => {
      const headers: Record<string, string> = {Accept: 'application/json'};
      if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (auth && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return this.fetchWithTimeout(
        url,
        {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        },
        opts.timeoutMs,
        opts.signal,
      );
    };

    try {
      const usedToken = this.accessToken;
      let res = await send(usedToken);
      if (res.status === 401 && auth && this.tokens) {
        // Another request may already have rotated the token: reuse it.
        const fresh =
          this.accessToken && this.accessToken !== usedToken
            ? this.accessToken
            : await this.refresh();
        res = await send(fresh);
      }
      return await this.parse<T>(res);
    } catch (e) {
      throw normalizeError(e);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw errorFromResponse(res.status, text);
    }
    if (!text) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, 'UNKNOWN', 'Invalid server response.');
    }
  }

  get<T>(path: string, query?: Query, signal?: AbortSignal) {
    return this.request<T>('GET', path, {query, signal});
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, {body});
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, {body});
  }
  delete<T>(path: string, body?: unknown) {
    return this.request<T>('DELETE', path, {body});
  }

  /* ----------------------------- uploads ----------------------------- */

  /**
   * multipart/form-data request through XMLHttpRequest so we get upload
   * progress events (fetch has none). Retries once after a token refresh.
   */
  async upload<T>(
    method: 'POST' | 'PATCH',
    path: string,
    form: FormData,
    opts: UploadOptions = {},
  ): Promise<T> {
    const url = `${this.apiUrl}${path}${buildQuery(opts.query)}`;
    try {
      const usedToken = this.accessToken;
      let res = await this.xhr(method, url, form, usedToken, opts);
      if (res.status === 401 && this.tokens) {
        const fresh =
          this.accessToken && this.accessToken !== usedToken
            ? this.accessToken
            : await this.refresh();
        opts.onProgress?.(0);
        res = await this.xhr(method, url, form, fresh, opts);
      }
      if (res.status < 200 || res.status >= 300) {
        throw errorFromResponse(res.status, res.text);
      }
      return (res.text ? JSON.parse(res.text) : undefined) as T;
    } catch (e) {
      throw normalizeError(e);
    }
  }

  private xhr(
    method: string,
    url: string,
    form: FormData,
    token: string | null,
    opts: UploadOptions,
  ): Promise<{status: number; text: string}> {
    return new Promise((resolve, reject) => {
      const xhr = this.createXHR();
      xhr.open(method, url);
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      // Uploads of 100 MB videos on slow networks: generous timeout.
      xhr.timeout = opts.timeoutMs ?? 10 * 60 * 1000;
      if (xhr.upload && opts.onProgress) {
        const onProgress = opts.onProgress;
        xhr.upload.onprogress = (ev: ProgressEvent) => {
          if (ev.lengthComputable && ev.total > 0) {
            onProgress(Math.min(ev.loaded / ev.total, 1));
          }
        };
      }
      xhr.onload = () => {
        opts.onProgress?.(1);
        resolve({status: xhr.status, text: xhr.responseText ?? ''});
      };
      xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR'));
      xhr.ontimeout = () => reject(new ApiError(0, 'TIMEOUT'));
      xhr.onabort = () => reject(new ApiError(0, 'ABORTED'));
      opts.signal?.addEventListener?.('abort', () => xhr.abort());
      xhr.send(form);
    });
  }
}
