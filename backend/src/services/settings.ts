import { z } from 'zod';
import type { Db } from '../db/pool.js';

export const NOTIFICATION_PREF_KEYS = [
  'push', 'likes', 'comments', 'replies', 'follows', 'followRequests', 'mentions', 'messages', 'communityJoins', 'events',
] as const;
export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];
export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export type NotificationType =
  | 'like' | 'comment' | 'follow' | 'mention' | 'community_join' | 'message'
  | 'reply' | 'comment_like' | 'follow_request' | 'follow_accepted' | 'repost' | 'event' | 'verification';

/** Which preference controls a notification type (null = always on). */
export const PREF_FOR_TYPE: Record<NotificationType, NotificationPrefKey | null> = {
  like: 'likes',
  comment_like: 'likes',
  repost: 'likes',
  comment: 'comments',
  reply: 'replies',
  follow: 'follows',
  follow_accepted: 'follows',
  follow_request: 'followRequests',
  mention: 'mentions',
  community_join: 'communityJoins',
  event: 'events',
  message: 'messages',
  verification: null,
};

export function normalizePrefs(raw: unknown): NotificationPrefs {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = {} as NotificationPrefs;
  for (const k of NOTIFICATION_PREF_KEYS) out[k] = obj[k] === false ? false : true;
  return out;
}

export type Settings = {
  isPrivate: boolean;
  dmPolicy: 'everyone' | 'followers' | 'nobody';
  notifications: NotificationPrefs;
};

export const settingsPatchSchema = z
  .object({
    isPrivate: z.boolean().optional(),
    dmPolicy: z.enum(['everyone', 'followers', 'nobody']).optional(),
    notifications: z
      .object(Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, z.boolean().optional()])) as Record<NotificationPrefKey, z.ZodOptional<z.ZodBoolean>>)
      .strict()
      .optional(),
  })
  .strict();

export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const { rows } = await db.query('SELECT is_private, dm_policy, notification_prefs FROM users WHERE id = $1', [userId]);
  const r = rows[0];
  return { isPrivate: r.is_private, dmPolicy: r.dm_policy, notifications: normalizePrefs(r.notification_prefs) };
}

/** SQL boolean expression: preference `key` enabled for users alias `u`. */
export function prefEnabledSql(alias: string, key: NotificationPrefKey): string {
  return `COALESCE((${alias}.notification_prefs->>'${key}')::boolean, true)`;
}
