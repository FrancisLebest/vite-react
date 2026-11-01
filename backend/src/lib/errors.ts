export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class ApiError extends Error {
  status: number;
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
    status?: number,
  ) {
    super(message);
    this.status = status ?? STATUS[code];
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError('VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Authentication required') => new ApiError('UNAUTHORIZED', message);
export const forbidden = (message = 'You are not allowed to do this') => new ApiError('FORBIDDEN', message);
export const notFound = (what = 'Resource') => new ApiError('NOT_FOUND', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new ApiError('CONFLICT', message, details);

export function errorBody(code: ErrorCode, message: string, details?: unknown) {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}
