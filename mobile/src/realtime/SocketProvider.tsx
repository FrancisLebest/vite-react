import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {io, Socket} from 'socket.io-client';
import {client} from '../api';
import type {ClientToServerEvents, ServerToClientEvents, UserSummary} from '../api/types';
import {API_ORIGIN} from '../config';
import {
  applyConversationRead,
  applyIncomingMessage,
  applyIncomingNotification,
} from '../query/messaging';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type TypingListener = (conversationId: string, user: UserSummary) => void;

interface SocketCtx {
  connected: boolean;
  emitTyping: (conversationId: string) => void;
  onTyping: (l: TypingListener) => () => void;
}

const Ctx = createContext<SocketCtx>({
  connected: false,
  emitTyping: () => undefined,
  onTyping: () => () => undefined,
});

export const useSocket = () => useContext(Ctx);

/**
 * Socket.IO connection, alive while the user is signed in.
 * - `auth` is a callback, so every (re)connection uses the latest access token
 * - `connect_error: UNAUTHORIZED` → refresh the token pair, then reconnect
 * - server events are written straight into the React Query cache
 */
export function SocketProvider({meId, children}: {meId: string; children: React.ReactNode}) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<AppSocket | null>(null);
  const typingListeners = useRef(new Set<TypingListener>());
  const meRef = useRef(meId);
  meRef.current = meId;

  useEffect(() => {
    const socket: AppSocket = io(API_ORIGIN, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: cb => cb({token: client.accessToken}),
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;
    let refreshing = false;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', err => {
      setConnected(false);
      if (err.message === 'UNAUTHORIZED' && !refreshing) {
        refreshing = true;
        client
          .refresh()
          .then(() => socket.connect())
          .catch(() => undefined) // session expired → AuthProvider logs out
          .finally(() => {
            refreshing = false;
          });
      }
    });

    socket.on('message:new', ({message}) => applyIncomingMessage(qc, message, meRef.current));
    socket.on('notification:new', ({notification}) =>
      applyIncomingNotification(qc, notification),
    );
    socket.on('conversation:read', ({conversationId, userId}) =>
      applyConversationRead(qc, conversationId, userId, meRef.current),
    );
    socket.on('typing', ({conversationId, user}) => {
      if (user.id !== meRef.current) {
        typingListeners.current.forEach(l => l(conversationId, user));
      }
    });

    // Reconnect with the new token after a rotation if we were kicked out.
    const offTokens = client.onTokensChanged(tokens => {
      if (!tokens) {
        socket.disconnect();
      } else if (!socket.connected) {
        socket.connect();
      }
    });

    // Save battery: drop the socket in background, catch up on foreground.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') {
        if (!socket.connected) {
          socket.connect();
        }
        qc.invalidateQueries(['unread']);
        qc.invalidateQueries(['conversations']);
      } else if (s === 'background') {
        socket.disconnect();
      }
    });

    return () => {
      offTokens();
      sub.remove();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [qc]);

  const value = useMemo<SocketCtx>(
    () => ({
      connected,
      emitTyping: conversationId => socketRef.current?.emit('typing', {conversationId}),
      onTyping: l => {
        typingListeners.current.add(l);
        return () => typingListeners.current.delete(l);
      },
    }),
    [connected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
