import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { logger } from './lib/logger.js';
import { attachSocket, closeSocket } from './realtime/socket.js';

async function main() {
  if (process.env.AUTO_MIGRATE === 'true') await migrate();
  const app = createApp();
  const server = http.createServer(app);
  await attachSocket(server);
  server.listen(config.PORT, config.HOST, () => {
    logger.info(`StudyHub API listening on http://${config.HOST}:${config.PORT} (public URL ${config.PUBLIC_URL})`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    await closeSocket();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
