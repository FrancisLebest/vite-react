import type http from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { viewerFromToken } from '../middleware/auth.js';
import { loadUserSummaryMap } from '../services/hydrate.js';

let io: Server | null = null;

export function getIO(): Server | null {
  return io;
}

export const room = (userId: string) => `user:${userId}`;

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(room(userId)).emit(event, payload);
}

const typingSchema = z.object({ conversationId: z.string().uuid() });

export async function attachSocket(server: http.Server): Promise<Server> {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: config.corsOrigins === '*' ? true : config.corsOrigins, credentials: true },
    maxHttpBufferSize: 1e5,
  });

  if (config.REDIS_URL) {
    // Optional: share rooms between several API instances.
    const { createClient } = await import('redis');
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const pub = createClient({ url: config.REDIS_URL });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO Redis adapter enabled');
  }

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token ?? socket.handshake.headers.authorization?.replace(/^Bearer /i, '');
    if (!token) return next(new Error('UNAUTHORIZED'));
    viewerFromToken(token)
      .then((viewer) => {
        socket.data.userId = viewer.id;
        next();
      })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(room(userId));

    socket.on('typing', async (payload: unknown) => {
      const parsed = typingSchema.safeParse(payload);
      if (!parsed.success) return;
      try {
        const { rows } = await pool.query(
          `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
          [parsed.data.conversationId],
        );
        const ids = rows.map((r) => r.user_id as string);
        if (!ids.includes(userId)) return;
        for (const other of ids) {
          if (other === userId) continue;
          const user = (await loadUserSummaryMap(pool, [userId], other)).get(userId);
          emitToUser(other, 'typing', { conversationId: parsed.data.conversationId, user });
        }
      } catch (err) {
        logger.warn({ err }, 'typing relay failed');
      }
    });
  });

  return io;
}

export async function closeSocket(): Promise<void> {
  if (io) {
    await new Promise<void>((resolve) => io!.close(() => resolve()));
    io = null;
  }
}
