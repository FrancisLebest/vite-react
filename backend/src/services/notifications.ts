import { pool, type Db } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { emitToUser } from '../realtime/socket.js';
import { loadNotifications, loadUserSummaryMap } from './hydrate.js';
import { sendPush } from './push.js';
import { normalizePrefs, PREF_FOR_TYPE, prefEnabledSql, type NotificationType } from './settings.js';

type NotifyInput = {
  userId: string;
  actorId: string;
  type: NotificationType;
  text: string;
  postId?: string | null;
  commentId?: string | null;
  communityId?: string | null;
  eventId?: string | null;
};

function pushData(type: string, ids: { id?: string; postId?: string | null; commentId?: string | null; communityId?: string | null; eventId?: string | null; actorId?: string }) {
  return {
    type,
    notificationId: ids.id,
    postId: ids.postId ?? undefined,
    commentId: ids.commentId ?? undefined,
    communityId: ids.communityId ?? undefined,
    eventId: ids.eventId ?? undefined,
    actorId: ids.actorId,
  };
}

/**
 * Creates a notification (never for self-actions, between users with a block, or when the
 * recipient disabled that type), pushes it on the socket room and sends a push notification.
 */
export async function notify(input: NotifyInput, db: Db = pool): Promise<string | null> {
  if (input.userId === input.actorId) return null;
  try {
    const pref = PREF_FOR_TYPE[input.type];
    const r = await db.query(
      `INSERT INTO notifications (user_id, actor_id, type, text, post_id, comment_id, community_id, event_id)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8 FROM users u
        WHERE u.id = $1 AND u.suspended_at IS NULL
          ${pref ? `AND ${prefEnabledSql('u', pref)}` : ''}
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = $1))
       RETURNING id, (SELECT notification_prefs FROM users WHERE id = $1) AS prefs`,
      [input.userId, input.actorId, input.type, input.text, input.postId ?? null, input.commentId ?? null, input.communityId ?? null, input.eventId ?? null],
    );
    const row = r.rows[0];
    if (!row) return null;
    const [notification] = await loadNotifications(db, [row.id], input.userId);
    if (notification) {
      emitToUser(input.userId, 'notification:new', { notification });
      if (normalizePrefs(row.prefs).push) {
        sendPush(input.userId, {
          title: notification.actor.name,
          body: input.text,
          data: pushData(input.type, { id: row.id, ...input }),
        });
      }
    }
    return row.id;
  } catch (err) {
    logger.error({ err }, 'Failed to create notification');
    return null;
  }
}

/** Fan-out notification (e.g. community events) with a single INSERT. */
export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<number> {
  const ids = userIds.filter((id) => id !== input.actorId);
  if (!ids.length) return 0;
  const pref = PREF_FOR_TYPE[input.type];
  try {
    const { rows } = await pool.query(
      `WITH ins AS (
         INSERT INTO notifications (user_id, actor_id, type, text, post_id, comment_id, community_id, event_id)
         SELECT u.id, $2, $3, $4, $5, $6, $7, $8 FROM users u
          WHERE u.id = ANY($1::uuid[]) AND u.suspended_at IS NULL
            ${pref ? `AND ${prefEnabledSql('u', pref)}` : ''}
            AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = u.id))
         RETURNING id, user_id
       )
       SELECT ins.id, ins.user_id, ${prefEnabledSql('u', 'push')} AS push FROM ins JOIN users u ON u.id = ins.user_id`,
      [ids, input.actorId, input.type, input.text, input.postId ?? null, input.commentId ?? null, input.communityId ?? null, input.eventId ?? null],
    );
    const actor = (await loadUserSummaryMap(pool, [input.actorId], null)).get(input.actorId);
    for (const row of rows) {
      const [notification] = await loadNotifications(pool, [row.id], row.user_id);
      if (notification) emitToUser(row.user_id, 'notification:new', { notification });
      if (row.push) {
        sendPush(row.user_id, { title: actor?.name ?? 'StudyHub', body: input.text, data: pushData(input.type, { id: row.id, ...input }) });
      }
    }
    return rows.length;
  } catch (err) {
    logger.error({ err }, 'Failed to fan out notifications');
    return 0;
  }
}

/** Notifies users mentioned with @username (excluding `excludeIds`). */
export async function notifyMentions(
  usernames: string[],
  actorId: string,
  ref: { postId?: string; commentId?: string },
  text: string,
  excludeIds: string[] = [],
): Promise<void> {
  if (!usernames.length) return;
  const { rows } = await pool.query('SELECT id FROM users WHERE username = ANY($1::citext[])', [usernames]);
  for (const { id } of rows) {
    if (id === actorId || excludeIds.includes(id)) continue;
    await notify({ userId: id, actorId, type: 'mention', text, postId: ref.postId, commentId: ref.commentId });
  }
}
