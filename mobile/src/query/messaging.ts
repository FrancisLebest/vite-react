import {useMemo} from 'react';
import {
  InfiniteData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {api} from '../api';
import type {
  AppNotification,
  Conversation,
  Me,
  Message,
  Page,
  UploadFile,
} from '../api/types';
import {isConversation, patchEntities, prependToPages} from './cache';
import {useCursorList} from './hooks';
import {qk} from './keys';

/* ------------------------- active conversation ------------------------- */

let activeConversationId: string | null = null;
/** The chat currently on screen (incoming messages there are not "unread"). */
export function setActiveConversation(id: string | null) {
  activeConversationId = id;
}
export function getActiveConversation() {
  return activeConversationId;
}

/* -------------------------------- queries ------------------------------- */

export function useConversations() {
  return useCursorList<Conversation>(qk.conversations(), api.messaging.list);
}

export function useConversation(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => api.messaging.get(id),
    initialData: () => findConversation(qc, id),
    initialDataUpdatedAt: 0,
  });
}

function findConversation(
  qc: QueryClient,
  id: string,
): Conversation | undefined {
  const data = qc.getQueryData<InfiniteData<Page<Conversation>>>(
    qk.conversations(),
  );
  for (const p of data?.pages ?? []) {
    const c = p.items.find(i => i.id === id);
    if (c) {
      return c;
    }
  }
  return undefined;
}

export function useMessages(conversationId: string) {
  return useCursorList<Message>(qk.messages(conversationId), cursor =>
    api.messaging.messages(conversationId, cursor),
  );
}

export function useNotifications(enabled = true) {
  return useCursorList<AppNotification>(
    qk.notifications(),
    api.notifications.list,
    {enabled},
  );
}

export function useUnreadCounts(enabled = true) {
  const conversations = useQuery({
    queryKey: qk.unreadConversations(),
    queryFn: api.messaging.unreadCount,
    enabled,
    refetchInterval: 120_000,
  });
  const notifications = useQuery({
    queryKey: qk.unreadNotifications(),
    queryFn: api.notifications.unreadCount,
    enabled,
    refetchInterval: 120_000,
  });
  return useMemo(
    () => ({
      conversations: conversations.data?.count ?? 0,
      notifications: notifications.data?.count ?? 0,
    }),
    [conversations.data, notifications.data],
  );
}

/* ------------------------------- mutations ------------------------------ */

let tmpSeq = 0;

export function useSendMessage(conversationId: string, me: Me | null) {
  const qc = useQueryClient();
  return useMutation<
    Message,
    unknown,
    {text: string; media?: UploadFile; onProgress?: (f: number) => void},
    {tmpId: string}
  >({
    mutationFn: ({text, media, onProgress}) =>
      media
        ? api.messaging.sendMedia(conversationId, text, media, {onProgress})
        : api.messaging.send(conversationId, text),
    onMutate: ({text, media}) => {
      const tmpId = `tmp-${Date.now()}-${tmpSeq++}`;
      if (me) {
        const optimistic: Message = {
          id: tmpId,
          conversationId,
          sender: {
            id: me.id,
            username: me.username,
            name: me.name,
            avatarUrl: me.avatarUrl,
            university: me.university,
            role: me.role,
            verified: me.verified,
            isFollowing: false,
          },
          text,
          media: media
            ? {
                kind: 'image',
                url: media.uri,
                thumbnailUrl: null,
                durationSec: null,
                width: null,
                height: null,
              }
            : null,
          createdAt: new Date().toISOString(),
        };
        prependToPages(qc, qk.messages(conversationId), optimistic);
      }
      return {tmpId};
    },
    onSuccess: (msg, _v, ctx) => {
      replaceMessage(qc, conversationId, ctx?.tmpId, msg);
      applyIncomingMessage(qc, msg, me?.id ?? null);
    },
    onError: (_e, _v, ctx) => {
      removeMessage(qc, conversationId, ctx?.tmpId);
    },
  });
}

function replaceMessage(
  qc: QueryClient,
  convId: string,
  tmpId: string | undefined,
  msg: Message,
) {
  qc.setQueryData<InfiniteData<Page<Message>>>(qk.messages(convId), data => {
    if (!data) {
      return data;
    }
    const alreadyThere = data.pages.some(p =>
      p.items.some(m => m.id === msg.id),
    );
    return {
      ...data,
      pages: data.pages.map(p => ({
        ...p,
        items: alreadyThere
          ? p.items.filter(m => m.id !== tmpId)
          : p.items.map(m => (m.id === tmpId ? msg : m)),
      })),
    };
  });
}

function removeMessage(
  qc: QueryClient,
  convId: string,
  tmpId: string | undefined,
) {
  qc.setQueryData<InfiniteData<Page<Message>>>(qk.messages(convId), data =>
    data
      ? {
          ...data,
          pages: data.pages.map(p => ({
            ...p,
            items: p.items.filter(m => m.id !== tmpId),
          })),
        }
      : data,
  );
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.messaging.markRead(id),
    onMutate: id => {
      patchEntities(qc, isConversation(id), o => ({...o, unreadCount: 0}));
    },
    onSettled: () => qc.invalidateQueries(qk.unreadConversations()),
  });
}

export function useMuteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({id, muted}: {id: string; muted: boolean}) =>
      api.messaging.update(id, {muted}),
    onMutate: ({id, muted}) =>
      patchEntities(qc, isConversation(id), o => ({...o, muted})),
    onError: (_e, _v, snap) => snap?.forEach(([k, d]) => qc.setQueryData(k, d)),
  });
}

/* ------------------------- realtime cache updates ------------------------ */

/** Apply a `message:new` (or our own sent message) to every relevant cache. */
export function applyIncomingMessage(
  qc: QueryClient,
  msg: Message,
  meId: string | null,
) {
  // Thread: prepend (newest first), dedupe by id.
  if (qc.getQueryData(qk.messages(msg.conversationId))) {
    const fromMe = msg.sender.id === meId;
    const data = qc.getQueryData<InfiniteData<Page<Message>>>(
      qk.messages(msg.conversationId),
    );
    const exists = data?.pages.some(p => p.items.some(m => m.id === msg.id));
    // Our own optimistic message is replaced by useSendMessage.onSuccess.
    const hasPendingTmp =
      fromMe &&
      data?.pages[0]?.items.some(
        m => m.id.startsWith('tmp-') && m.text === msg.text,
      );
    if (!exists && !hasPendingTmp) {
      prependToPages(qc, qk.messages(msg.conversationId), msg);
    }
  }

  // Conversation list: move to top with new preview / unread count.
  const viewing = activeConversationId === msg.conversationId;
  const fromMe = msg.sender.id === meId;
  let found = false;
  qc.setQueryData<InfiniteData<Page<Conversation>>>(
    qk.conversations(),
    data => {
      if (!data || !data.pages.length) {
        return data;
      }
      let conv: Conversation | undefined;
      const pages = data.pages.map(p => ({
        ...p,
        items: p.items.filter(c => {
          if (c.id === msg.conversationId) {
            conv = c;
            return false;
          }
          return true;
        }),
      }));
      if (!conv) {
        return data;
      }
      found = true;
      const updated: Conversation = {
        ...conv,
        lastMessage: msg,
        updatedAt: msg.createdAt,
        unreadCount:
          fromMe || viewing ? conv.unreadCount : conv.unreadCount + 1,
      };
      pages[0] = {...pages[0], items: [updated, ...pages[0].items]};
      return {...data, pages};
    },
  );
  qc.setQueryData<Conversation>(qk.conversation(msg.conversationId), c =>
    c ? {...c, lastMessage: msg, updatedAt: msg.createdAt} : c,
  );
  if (!found) {
    qc.invalidateQueries(qk.conversations());
  }
  if (!fromMe && !viewing) {
    qc.invalidateQueries(qk.unreadConversations());
  }
}

export function applyIncomingNotification(qc: QueryClient, n: AppNotification) {
  prependToPages(qc, qk.notifications(), n);
  qc.setQueryData<{count: number}>(qk.unreadNotifications(), d => ({
    count: (d?.count ?? 0) + 1,
  }));
}

/* ---------------------------- read receipts ----------------------------- */

type ReadMap = Record<string, string>; // userId -> ISO time of last read

const readKey = (conversationId: string) => ['reads', conversationId] as const;

export function applyConversationRead(
  qc: QueryClient,
  conversationId: string,
  userId: string,
  meId: string | null,
) {
  if (userId === meId) {
    patchEntities(qc, isConversation(conversationId), o => ({
      ...o,
      unreadCount: 0,
    }));
    qc.invalidateQueries(qk.unreadConversations());
    return;
  }
  qc.setQueryData<ReadMap>(readKey(conversationId), prev => ({
    ...(prev ?? {}),
    [userId]: new Date().toISOString(),
  }));
}

/** Live read receipts (only for reads that happened while the app was open). */
export function useReadReceipts(conversationId: string) {
  const {data} = useQuery<ReadMap>({
    queryKey: readKey(conversationId),
    queryFn: () => ({}),
    staleTime: Infinity,
    cacheTime: Infinity,
  });
  return data ?? {};
}
