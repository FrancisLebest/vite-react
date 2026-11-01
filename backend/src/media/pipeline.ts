import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { deleteKeys, storage } from '../storage/index.js';
import { emitToUser } from '../realtime/socket.js';
import { loadPosts } from '../services/hydrate.js';
import { tmpDir, transcodeAndStore } from './process.js';

/** Transcodes the source video of a `processing` post and marks it ready (or throws). */
export async function processVideoPost(postId: string): Promise<'ready' | 'skipped'> {
  const r = await pool.query(`SELECT id, author_id, source_key, media_key, thumbnail_key FROM posts WHERE id = $1 AND status = 'processing'`, [postId]);
  const post = r.rows[0];
  if (!post) return 'skipped'; // deleted or already processed
  const sourceKey: string = post.source_key ?? post.media_key;
  await fsp.mkdir(tmpDir, { recursive: true });
  const input = path.join(tmpDir, `${crypto.randomUUID()}${path.extname(sourceKey) || '.mp4'}`);
  try {
    await storage.download(sourceKey, input);
    const media = await transcodeAndStore(input);
    const upd = await pool.query(
      `UPDATE posts SET media_key = $2, thumbnail_key = $3, duration_sec = $4, width = $5, height = $6,
              status = 'ready', source_key = NULL, processing_error = NULL
        WHERE id = $1 AND status = 'processing' RETURNING id`,
      [postId, media.key, media.thumbnailKey, media.durationSec, media.width, media.height],
    );
    if (!upd.rowCount) {
      deleteKeys([media.key, media.thumbnailKey]); // post deleted meanwhile
      return 'skipped';
    }
    deleteKeys([sourceKey, post.thumbnail_key !== media.thumbnailKey ? post.thumbnail_key : null]);
    const [full] = await loadPosts(pool, [postId], post.author_id);
    emitToUser(post.author_id, 'post:ready', { post: full });
    logger.info({ postId }, 'Video post ready');
    return 'ready';
  } finally {
    await fsp.rm(input, { force: true });
  }
}

export async function markVideoFailed(postId: string, err: unknown): Promise<void> {
  const reason = 'Video processing failed';
  logger.error({ err, postId }, reason);
  const r = await pool.query(
    `UPDATE posts SET status = 'failed', processing_error = $2 WHERE id = $1 AND status = 'processing' RETURNING author_id`,
    [postId, String((err as Error)?.message ?? err).slice(0, 500)],
  );
  if (r.rows[0]) emitToUser(r.rows[0].author_id, 'post:failed', { postId, reason });
}
