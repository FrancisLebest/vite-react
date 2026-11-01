import { pool, type Db } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { emitToUser } from '../realtime/socket.js';
import { loadNotifications } from './hydrate.js';

type NotifyInput = {
  userId: string;
  actorId: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'community_join' | 'message';
  text: string;
  postId?: string | null;
  commentId?: string | null;
  communityId?: string | null;
};

/**
 * Creates a notification (never for self-actions nor between users with a block)
 * and pushes it on the recipient's socket room.
 */
export async function notify(input: NotifyInput, db: Db = pool): Promise<string | null> {
  if (input.userId === input.actorId) return null;
  try {
    const r = await db.query(
      `INSERT INTO notifications (user_id, actor_id, type, text, post_id, comment_id, community_id)
       SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = $1))
       RETURNING id`,
      [input.userId, input.actorId, input.type, input.text, input.postId ?? null, input.commentId ?? null, input.communityId ?? null],
    );
    const id = r.rows[0]?.id as string | undefined;
    if (!id) return null;
    const [notification] = await loadNotifications(db, [id], input.userId);
    if (notification) emitToUser(input.userId, 'notification:new', { notification });
    return id;
  } catch (err) {
    logger.error({ err }, 'Failed to create notification');
    return null;
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
