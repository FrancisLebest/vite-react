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

// In a separate worker process there is no Socket.IO server: events are relayed through Redis.
let emitter: { to(room: string): { emit(event: string, payload: unknown): unknown } } | null = null;
let emitterClient: { quit(): Promise<unknown> } | null = null;

export async function initRedisEmitter(): Promise<void> {
  if (io || emitter || !config.REDIS_URL) return;
  const { createClient } = await import('redis');
  const { Emitter } = await import('@socket.io/redis-emitter');
  const client = createClient({ url: config.REDIS_URL });
  await client.connect();
  emitterClient = client;
  emitter = new Emitter(client);
}

export async function closeRedisEmitter(): Promise<void> {
  await emitterClient?.quit().catch(() => undefined);
  emitter = null;
  emitterClient = null;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (io) io.to(room(userId)).emit(event, payload);
  else emitter?.to(room(userId)).emit(event, payload);
}

/** Disconnects every socket of a user (e.g. after a suspension). */
export function disconnectUser(userId: string): void {
  io?.in(room(userId)).disconnectSockets(true);
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
      .catch((err) => next(new Error(err?.code === 'ACCOUNT_SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'UNAUTHORIZED')));
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
