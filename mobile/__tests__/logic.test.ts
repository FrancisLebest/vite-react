import {dmId, initialState, reducer} from '../src/context/AppContext';
import {users} from '../src/data/mock';
import {formatCount} from '../src/utils/responsive';
import {inboxTime, timeAgo} from '../src/utils/time';

describe('formatCount', () => {
  it('formats like the mockups', () => {
    expect(formatCount(842)).toBe('842');
    expect(formatCount(12500)).toBe('12.5K');
    expect(formatCount(3100)).toBe('3.1K');
    expect(formatCount(124000)).toBe('124K');
    expect(formatCount(1000)).toBe('1K');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });
});

describe('time helpers', () => {
  const now = new Date(2026, 9, 31, 12, 0).getTime();
  it('timeAgo', () => {
    expect(timeAgo(now - 10_000, now)).toBe('now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m');
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3h');
    expect(timeAgo(now - 2 * 86400_000, now)).toBe('2d');
  });
  it('inboxTime', () => {
    expect(inboxTime(new Date(2026, 9, 31, 9, 32).getTime(), now)).toBe(
      '9:32 AM',
    );
    expect(inboxTime(new Date(2026, 9, 30, 20, 0).getTime(), now)).toBe(
      'Yesterday',
    );
    expect(inboxTime(new Date(2026, 9, 28, 8, 0).getTime(), now)).toBe(
      'Wed, Oct 28',
    );
  });
});

describe('reducer', () => {
  it('toggles follow / like / bookmark / join', () => {
    let s = reducer(initialState, {type: 'toggleFollow', userId: 'u1'});
    expect(s.following.u1).toBe(true);
    s = reducer(s, {type: 'toggleFollow', userId: 'u1'});
    expect(s.following.u1).toBe(false);
    s = reducer(s, {type: 'toggleLike', id: 'p1'});
    expect(s.liked.p1).toBe(true);
    s = reducer(s, {type: 'toggleBookmark', id: 'c1'});
    expect(s.bookmarked.c1).toBe(true);
    s = reducer(s, {type: 'toggleJoin', communityId: 'k2'});
    expect(s.joined.k2).toBe(true);
  });

  it('adds comments to any target', () => {
    const s = reducer(initialState, {
      type: 'addComment',
      targetId: 'v3',
      text: 'Nice!',
    });
    expect(s.comments.v3).toHaveLength(1);
    expect(s.comments.v3[0].text).toBe('Nice!');
  });

  it('sends a message and moves the conversation to the top', () => {
    const last =
      initialState.conversations[initialState.conversations.length - 1];
    const s = reducer(initialState, {
      type: 'sendMessage',
      conversationId: last.id,
      text: 'Hello',
    });
    expect(s.conversations[0].id).toBe(last.id);
    expect(s.conversations[0].messages.at(-1)?.text).toBe('Hello');
  });

  it('creates a DM conversation only once', () => {
    const user = users.find(u => u.id === 'u5')!;
    let s = reducer(initialState, {type: 'ensureConversation', user});
    s = reducer(s, {type: 'ensureConversation', user});
    expect(s.conversations.filter(c => c.id === dmId('u5'))).toHaveLength(1);
  });

  it('marks notifications and conversations read', () => {
    let s = reducer(initialState, {type: 'markNotificationsRead'});
    expect(s.notifications.every(n => n.read)).toBe(true);
    s = reducer(s, {type: 'markConversationRead', conversationId: 'cv1'});
    expect(s.conversations.find(c => c.id === 'cv1')?.unread).toBe(0);
  });

  it('creates a community and joins it', () => {
    const s = reducer(initialState, {
      type: 'createCommunity',
      community: {
        id: 'kx',
        name: 'Bio',
        members: 0,
        icon: 'leaf',
        color: '#000',
        description: '',
        kind: 'topic',
      },
    });
    expect(s.communities[0].id).toBe('kx');
    expect(s.joined.kx).toBe(true);
  });
});
