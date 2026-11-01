import {QueryClient} from '@tanstack/react-query';
import type {Conversation, Message} from '../src/api/types';
import {isPost, isUser, patchEntities, restore} from '../src/query/cache';
import {qk} from '../src/query/keys';
import {
  applyIncomingMessage,
  applyIncomingNotification,
  setActiveConversation,
} from '../src/query/messaging';
import {page} from './helpers/fetchMock';
import {summary, videoPost} from './helpers/fixtures';

const conv = (id: string, unreadCount = 0): Conversation => ({
  id,
  isGroup: false,
  title: id,
  avatarUrl: null,
  participants: [summary()],
  lastMessage: null,
  unreadCount,
  muted: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const msg = (id: string, conversationId: string, senderId = 'u2'): Message => ({
  id,
  conversationId,
  sender: summary({id: senderId}),
  text: `hello ${id}`,
  media: null,
  createdAt: new Date().toISOString(),
});

describe('patchEntities', () => {
  it('patches a post in every cached list and restores on rollback', () => {
    const qc = new QueryClient();
    const p = videoPost();
    qc.setQueryData(qk.feed({tab: 'forYou'}), {
      pages: [page([p])],
      pageParams: [undefined],
    });
    qc.setQueryData(qk.post(p.id), p);
    qc.setQueryData(qk.search({q: 'x', type: 'all'}), {
      posts: [p],
      users: [],
      communities: [],
      total: 1,
    });
    const untouched = {
      pages: [page([videoPost({id: 'other'})])],
      pageParams: [undefined],
    };
    qc.setQueryData(qk.bookmarks(), untouched);

    const snap = patchEntities(qc, isPost(p.id), o => ({
      ...o,
      likedByMe: true,
      likeCount: 11,
    }));
    expect(snap).toHaveLength(3);
    expect(qc.getQueryData<typeof p>(qk.post(p.id))?.likeCount).toBe(11);
    expect(
      (qc.getQueryData(qk.feed({tab: 'forYou'})) as any).pages[0].items[0]
        .likedByMe,
    ).toBe(true);
    expect(
      (qc.getQueryData(qk.search({q: 'x', type: 'all'})) as any).posts[0]
        .likeCount,
    ).toBe(11);
    expect(qc.getQueryData(qk.bookmarks())).toBe(untouched); // same reference

    restore(qc, snap);
    expect(qc.getQueryData<typeof p>(qk.post(p.id))?.likeCount).toBe(10);
  });

  it('updates nested authors when following', () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.post('p1'), videoPost());
    patchEntities(qc, isUser('u2'), o => ({...o, isFollowing: true}));
    expect(qc.getQueryData<any>(qk.post('p1')).author.isFollowing).toBe(true);
  });
});

describe('realtime cache updates', () => {
  afterEach(() => setActiveConversation(null));

  it('message:new prepends to the thread, moves the conversation to top, bumps unread', () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.conversations(), {
      pages: [page([conv('a'), conv('b')])],
      pageParams: [undefined],
    });
    qc.setQueryData(qk.messages('b'), {
      pages: [page([msg('m1', 'b')])],
      pageParams: [undefined],
    });
    applyIncomingMessage(qc, msg('m2', 'b'), 'me');
    const convs = (qc.getQueryData(qk.conversations()) as any).pages[0].items;
    expect(convs.map((c: Conversation) => c.id)).toEqual(['b', 'a']);
    expect(convs[0].unreadCount).toBe(1);
    expect(convs[0].lastMessage.id).toBe('m2');
    const thread = (qc.getQueryData(qk.messages('b')) as any).pages[0].items;
    expect(thread.map((m: Message) => m.id)).toEqual(['m2', 'm1']);
    // duplicate delivery is ignored
    applyIncomingMessage(qc, msg('m2', 'b'), 'me');
    expect(
      (qc.getQueryData(qk.messages('b')) as any).pages[0].items,
    ).toHaveLength(2);
  });

  it('does not count messages of the open chat as unread', () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.conversations(), {
      pages: [page([conv('a')])],
      pageParams: [undefined],
    });
    setActiveConversation('a');
    applyIncomingMessage(qc, msg('m1', 'a'), 'me');
    expect(
      (qc.getQueryData(qk.conversations()) as any).pages[0].items[0]
        .unreadCount,
    ).toBe(0);
  });

  it('notification:new prepends and increments the badge', () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.notifications(), {
      pages: [page([])],
      pageParams: [undefined],
    });
    qc.setQueryData(qk.unreadNotifications(), {count: 1});
    applyIncomingNotification(qc, {
      id: 'n1',
      type: 'like',
      actor: summary(),
      post: null,
      community: null,
      text: 'liked your video',
      read: false,
      createdAt: new Date().toISOString(),
    });
    expect(qc.getQueryData(qk.unreadNotifications())).toEqual({count: 2});
    expect(
      (qc.getQueryData(qk.notifications()) as any).pages[0].items[0].id,
    ).toBe('n1');
  });
});
