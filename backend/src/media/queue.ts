/**
 * Video job queue: BullMQ (Redis) when REDIS_URL is set, otherwise an in-process FIFO queue.
 */
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { markVideoFailed, processVideoPost } from './pipeline.js';

const QUEUE_NAME = 'video-transcode';
const ATTEMPTS = 2;

// ----------------------------------------------------------------- in-process
const pending: string[] = [];
let running = 0;
const idleWaiters: (() => void)[] = [];

function pump(): void {
  while (running < config.VIDEO_CONCURRENCY && pending.length) {
    const postId = pending.shift()!;
    running += 1;
    void runWithRetry(postId).finally(() => {
      running -= 1;
      if (!running && !pending.length) idleWaiters.splice(0).forEach((fn) => fn());
      pump();
    });
  }
}

async function runWithRetry(postId: string): Promise<void> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await processVideoPost(postId);
      return;
    } catch (err) {
      if (attempt === ATTEMPTS) await markVideoFailed(postId, err);
      else logger.warn({ err, postId, attempt }, 'Video job failed, retrying');
    }
  }
}

/** Resolves when the in-process queue is empty (tests / shutdown). */
export function waitForVideoQueueIdle(): Promise<void> {
  if (!running && !pending.length) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

// ----------------------------------------------------------------- BullMQ
type BullQueue = { add(name: string, data: unknown, opts?: unknown): Promise<unknown>; close(): Promise<void> };
let bullQueue: BullQueue | null = null;

function redisConnection() {
  const url = new URL(config.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function getBullQueue(): Promise<BullQueue> {
  if (!bullQueue) {
    const { Queue } = await import('bullmq');
    bullQueue = new Queue(QUEUE_NAME, { connection: redisConnection() }) as unknown as BullQueue;
  }
  return bullQueue;
}

export async function enqueueVideo(postId: string): Promise<void> {
  if (config.REDIS_URL) {
    const q = await getBullQueue();
    await q.add('transcode', { postId }, { jobId: postId, attempts: ATTEMPTS, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 });
    return;
  }
  if (!pending.includes(postId)) pending.push(postId);
  pump();
}

/** Starts a BullMQ worker in this process. */
export async function startBullWorker(): Promise<{ close(): Promise<void> }> {
  const { Worker } = await import('bullmq');
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const postId = (job.data as { postId: string }).postId;
      try {
        return await processVideoPost(postId);
      } catch (err) {
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await markVideoFailed(postId, err);
          return 'failed';
        }
        throw err;
      }
    },
    { connection: redisConnection(), concurrency: config.VIDEO_CONCURRENCY },
  );
  worker.on('error', (err) => logger.error({ err }, 'Video worker error'));
  logger.info('BullMQ video worker started');
  return worker;
}

/** Re-enqueues posts left in `processing` (e.g. after a crash of the in-process worker). */
export async function recoverProcessingPosts(): Promise<number> {
  const { rows } = await pool.query(`SELECT id FROM posts WHERE status = 'processing' ORDER BY created_at`);
  for (const r of rows) await enqueueVideo(r.id);
  if (rows.length) logger.info({ count: rows.length }, 'Re-enqueued processing videos');
  return rows.length;
}

export async function closeQueue(): Promise<void> {
  await bullQueue?.close();
  bullQueue = null;
}
