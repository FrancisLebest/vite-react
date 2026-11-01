import type {ErrorCode} from './types';

/** Contract codes + client-side failures. */
export type ApiErrorCode =
  | ErrorCode
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'UNKNOWN';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION_ERROR',
  415: 'VALIDATION_ERROR',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Some fields are invalid.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: 'This content is no longer available.',
  CONFLICT: 'This already exists.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
  NETWORK_ERROR: "Can't reach StudyHub. Check your connection and try again.",
  TIMEOUT: 'The server took too long to answer. Please try again.',
  ABORTED: 'Request cancelled.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message?: string, details?: unknown) {
    super(message || DEFAULT_MESSAGES[code]);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Per-field messages for VALIDATION_ERROR (best effort, see fieldErrors()). */
  get fields(): Record<string, string> {
    return fieldErrors(this.details);
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

function codeForStatus(status: number): ApiErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL' : 'UNKNOWN');
}

/**
 * Build an ApiError from an HTTP response status + (possibly non-JSON) body text.
 * Contract: `{ error: { code, message, details? } }`.
 */
export function errorFromResponse(status: number, bodyText: string): ApiError {
  let parsed: unknown;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    parsed = undefined;
  }
  const err =
    parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as {error: unknown}).error
      : undefined;
  if (err && typeof err === 'object') {
    const e = err as {code?: unknown; message?: unknown; details?: unknown};
    const code =
      typeof e.code === 'string' && e.code in DEFAULT_MESSAGES
        ? (e.code as ApiErrorCode)
        : codeForStatus(status);
    const message =
      typeof e.message === 'string' && e.message ? e.message : undefined;
    return new ApiError(status, code, message, e.details);
  }
  return new ApiError(status, codeForStatus(status));
}

/** Normalize anything thrown (fetch TypeError, AbortError, ApiError…) into an ApiError. */
export function normalizeError(e: unknown): ApiError {
  if (e instanceof ApiError) {
    return e;
  }
  if (e && typeof e === 'object' && (e as {name?: string}).name === 'AbortError') {
    return new ApiError(0, 'ABORTED');
  }
  if (e instanceof TypeError) {
    // fetch() rejects with TypeError("Network request failed") on RN.
    return new ApiError(0, 'NETWORK_ERROR');
  }
  return new ApiError(0, 'UNKNOWN', e instanceof Error ? e.message : undefined);
}

/**
 * Extract `{field: message}` from VALIDATION_ERROR details. The contract leaves
 * `details` open, so we accept the common shapes:
 *  - zod flatten: `{ fieldErrors: { email: ['Invalid email'] } }`
 *  - issue list:  `[{ path: ['email'] | 'email', message }]` (or `field`)
 *  - plain map:   `{ email: 'Invalid email' | ['Invalid email'] }`
 */
export function fieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!details || typeof details !== 'object') {
    return out;
  }
  const first = (v: unknown) =>
    Array.isArray(v) ? (typeof v[0] === 'string' ? v[0] : undefined) : typeof v === 'string' ? v : undefined;

  if (Array.isArray(details)) {
    for (const issue of details) {
      if (!issue || typeof issue !== 'object') {
        continue;
      }
      const i = issue as {path?: unknown; field?: unknown; message?: unknown};
      const path = Array.isArray(i.path) ? i.path.join('.') : (i.path ?? i.field);
      if (typeof path === 'string' && path && typeof i.message === 'string' && !out[path]) {
        out[path] = i.message;
      }
    }
    return out;
  }
  const d = details as Record<string, unknown>;
  const map =
    d.fieldErrors && typeof d.fieldErrors === 'object'
      ? (d.fieldErrors as Record<string, unknown>)
      : d;
  for (const [k, v] of Object.entries(map)) {
    const msg = first(v);
    if (msg) {
      out[k] = msg;
    }
  }
  return out;
}

/** User-facing message for any error. */
export function errorMessage(e: unknown): string {
  return normalizeError(e).message;
}
