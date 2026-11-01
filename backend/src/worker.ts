/**
 * Standalone video worker: `npm run worker` (requires REDIS_URL).
 * Consumes the BullMQ queue and emits post:ready / post:failed through the Socket.IO Redis emitter.
 */
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { closeRedisEmitter, initRedisEmitter } from './realtime/socket.js';
import { startBullWorker } from './media/queue.js';

async function main() {
  if (!config.REDIS_URL) {
    logger.fatal('REDIS_URL is required for the standalone worker (without Redis, videos are processed inside the API process)');
    process.exit(1);
  }
  await initRedisEmitter();
  const worker = await startBullWorker();
  const shutdown = async () => {
    logger.info('Worker shutting down');
    await worker.close();
    await closeRedisEmitter();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
