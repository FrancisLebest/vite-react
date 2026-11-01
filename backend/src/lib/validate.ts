import { z } from 'zod';
import { ApiError } from './errors.js';

export function formatZodError(err: z.ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = formatZodError(r.error);
    const first = details[0];
    throw new ApiError('VALIDATION_ERROR', first ? `${first.path || 'body'}: ${first.message}` : 'Invalid input', details);
  }
  return r.data;
}

export const uuid = z.string().uuid({ message: 'Invalid id' });

/** Empty strings in query/multipart fields are treated as "not provided". */
export const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

export const optionalTrimmed = (max: number) =>
  z.preprocess(emptyToUndef, z.string().trim().max(max).optional());

export const nullableTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

export const boolish = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return v;
}, z.boolean());
