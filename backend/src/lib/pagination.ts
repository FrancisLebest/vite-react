import { z } from 'zod';
import { badRequest } from './errors.js';

export const limitSchema = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : Number(v)),
  z.number().int().min(1).max(50).default(20),
);

export type Page<T> = { items: T[]; nextCursor: string | null };

export function encodeCursor(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor<T = any>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw badRequest('Invalid cursor');
  }
}

/** Keyset cursor on (timestamp text, id). */
export type KeyCursor = { t: string; id: string };
export function decodeKeyCursor(cursor: string | undefined): KeyCursor | null {
  const c = decodeCursor<KeyCursor>(cursor);
  if (c && (typeof c.t !== 'string' || typeof c.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(c.id))) {
    throw badRequest('Invalid cursor');
  }
  return c;
}

/** Offset cursor for ranked lists. */
export function decodeOffsetCursor(cursor: string | undefined): number {
  const c = decodeCursor<{ o: number }>(cursor);
  if (!c) return 0;
  if (!Number.isInteger(c.o) || c.o < 0 || c.o > 100_000) throw badRequest('Invalid cursor');
  return c.o;
}

/**
 * Given rows fetched with `limit + 1`, returns the page rows and next cursor.
 */
export function keysetPage<R extends { _ct: string; id: string }>(rows: R[], limit: number) {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return { rows: pageRows, nextCursor: hasMore && last ? encodeCursor({ t: last._ct, id: last.id }) : null };
}

export function offsetPage<R>(rows: R[], limit: number, offset: number) {
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, nextCursor: hasMore ? encodeCursor({ o: offset + limit }) : null };
}

/** Adds a keyset condition `(tsCol, idCol) < (cursor)` (or `>` for ascending lists). */
export function keysetCond(
  q: { p(v: unknown): string; and(c: string): unknown },
  tsCol: string,
  idCol: string,
  cursor: KeyCursor | null,
  dir: '<' | '>' = '<',
): void {
  if (cursor) q.and(`(${tsCol}, ${idCol}) ${dir} (${q.p(cursor.t)}::timestamptz, ${q.p(cursor.id)}::uuid)`);
}
