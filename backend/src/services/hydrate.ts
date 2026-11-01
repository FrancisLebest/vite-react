/**
 * Batch loaders turning ids into API objects (with viewer-dependent flags).
 * List endpoints compute the ordered ids, then hydrate them with a constant number of queries.
 */
import type { Db } from '../db/pool.js';
import { many } from '../db/pool.js';
import { mediaUrl } from '../storage/index.js';

export type Role = 'student' | 'professor' | 'creator';

export type UserSummary = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  university: string | null;
  role: Role;
  verified: boolean;
  isFollowing: boolean;
};

export type User = UserSummary & {
  bio: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  mutualCount: number;
  isMe: boolean;
  isBlocked: boolean;
  createdAt: string;
};

export type Me = User & { email: string };

export type Media = {
  kind: 'video' | 'image' | 'audio';
  url: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
};

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/** SQL predicate: no block between viewer and the user in `col` (either direction). */
export function notBlockedSql(col: string, viewerParam: string): string {
  return `NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id = ${viewerParam} AND bl.blocked_id = ${col}) OR (bl.blocker_id = ${col} AND bl.blocked_id = ${viewerParam}))`;
}

export function mediaFromRow(r: any): Media | null {
  if (!r.media_kind || !r.media_key) return null;
  const url = mediaUrl(r.media_key)!;
  return {
    kind: r.media_kind,
    url,
    thumbnailUrl: r.thumbnail_key ? mediaUrl(r.thumbnail_key) : r.media_kind === 'image' ? url : null,
    durationSec: r.duration_sec === null || r.duration_sec === undefined ? null : Number(r.duration_sec),
    width: r.width ?? null,
    height: r.height ?? null,
  };
}

function summaryFromRow(r: any): UserSummary {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    avatarUrl: mediaUrl(r.avatar_key),
    university: r.university ?? null,
    role: r.role,
    verified: r.verified,
    isFollowing: !!r.is_following,
  };
}

function ordered<T>(ids: string[], map: Map<string, T>): T[] {
  const out: T[] = [];
  for (const id of ids) {
    const v = map.get(id);
    if (v !== undefined) out.push(v);
  }
  return out;
}

export async function loadUserSummaryMap(db: Db, ids: string[], viewerId: string | null): Promise<Map<string, UserSummary>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await many(
    db,
    `SELECT u.id, u.username, u.name, u.avatar_key, u.university, u.role, u.verified,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id)) AS is_following
       FROM users u WHERE u.id = ANY($1::uuid[])`,
    [unique, viewerId],
  );
  return new Map(rows.map((r) => [r.id, summaryFromRow(r)]));
}

export async function loadUserSummaries(db: Db, ids: string[], viewerId: string | null): Promise<UserSummary[]> {
  return ordered(ids, await loadUserSummaryMap(db, ids, viewerId));
}

export async function loadUsers(db: Db, ids: string[], viewerId: string | null): Promise<User[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT u.id, u.username, u.name, u.avatar_key, u.university, u.role, u.verified, u.bio, u.email,
            u.follower_count, u.following_count, u.post_count, u.created_at,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id)) AS is_following,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = $2 AND b.blocked_id = u.id)) AS is_blocked,
            CASE WHEN $2::uuid IS NULL OR $2::uuid = u.id THEN 0 ELSE (
              SELECT count(*)::int FROM follows f1
                JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = u.id
               WHERE f1.follower_id = $2
            ) END AS mutual_count
       FROM users u WHERE u.id = ANY($1::uuid[])`,
    [[...new Set(ids)], viewerId],
  );
  const map = new Map<string, User>(
    rows.map((r) => [
      r.id,
      {
        ...summaryFromRow(r),
        bio: r.bio ?? null,
        followerCount: r.follower_count,
        followingCount: r.following_count,
        postCount: r.post_count,
        mutualCount: r.mutual_count,
        isMe: viewerId === r.id,
        isBlocked: !!r.is_blocked,
        createdAt: iso(r.created_at),
        ...(viewerId === r.id ? { email: r.email } : {}),
      },
    ]),
  );
  return ordered(ids, map);
}

export async function loadUser(db: Db, id: string, viewerId: string | null): Promise<User | null> {
  return (await loadUsers(db, [id], viewerId))[0] ?? null;
}

export async function loadMe(db: Db, id: string): Promise<Me> {
  const u = await loadUser(db, id, id);
  if (!u) throw new Error('User not found');
  return u as Me;
}

// ------------------------------------------------------------------ posts

export type Post = {
  id: string;
  type: 'video' | 'post';
  text: string;
  hashtags: string[];
  category: string;
  media: Media | null;
  author: UserSummary;
  community: { id: string; name: string } | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  bookmarkCount: number;
  viewCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  createdAt: string;
};

export async function loadPosts(db: Db, ids: string[], viewerId: string | null): Promise<Post[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT p.*, c.name AS community_name,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $2)) AS liked,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = $2)) AS bookmarked
       FROM posts p LEFT JOIN communities c ON c.id = p.community_id
      WHERE p.id = ANY($1::uuid[])`,
    [[...new Set(ids)], viewerId],
  );
  const authors = await loadUserSummaryMap(db, rows.map((r) => r.author_id), viewerId);
  const map = new Map<string, Post>();
  for (const r of rows) {
    const author = authors.get(r.author_id);
    if (!author) continue;
    map.set(r.id, {
      id: r.id,
      type: r.type,
      text: r.text,
      hashtags: r.hashtags ?? [],
      category: r.category,
      media: mediaFromRow(r),
      author,
      community: r.community_id ? { id: r.community_id, name: r.community_name } : null,
      likeCount: r.like_count,
      commentCount: r.comment_count,
      shareCount: r.share_count,
      bookmarkCount: r.bookmark_count,
      viewCount: r.view_count,
      likedByMe: !!r.liked,
      bookmarkedByMe: !!r.bookmarked,
      createdAt: iso(r.created_at),
    });
  }
  return ordered(ids, map);
}

// ------------------------------------------------------------------ comments

export type Comment = { id: string; text: string; author: UserSummary; createdAt: string; postId: string };

export async function loadComments(db: Db, ids: string[], viewerId: string | null): Promise<Comment[]> {
  if (!ids.length) return [];
  const rows = await many(db, 'SELECT * FROM comments WHERE id = ANY($1::uuid[])', [ids]);
  const authors = await loadUserSummaryMap(db, rows.map((r) => r.author_id), viewerId);
  const map = new Map<string, Comment>();
  for (const r of rows) {
    const author = authors.get(r.author_id);
    if (author) map.set(r.id, { id: r.id, text: r.text, author, createdAt: iso(r.created_at), postId: r.post_id });
  }
  return ordered(ids, map);
}

// ------------------------------------------------------------------ communities

export type Community = {
  id: string;
  name: string;
  description: string;
  kind: 'university' | 'faculty' | 'topic';
  icon: string;
  color: string;
  avatarUrl: string | null;
  memberCount: number;
  postCount: number;
  isMember: boolean;
  isOwner: boolean;
  createdAt: string;
};

export async function loadCommunities(db: Db, ids: string[], viewerId: string | null): Promise<Community[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT c.*,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = $2)) AS is_member
       FROM communities c WHERE c.id = ANY($1::uuid[])`,
    [[...new Set(ids)], viewerId],
  );
  const map = new Map<string, Community>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        description: r.description,
        kind: r.kind,
        icon: r.icon,
        color: r.color,
        avatarUrl: mediaUrl(r.avatar_key),
        memberCount: r.member_count,
        postCount: r.post_count,
        isMember: !!r.is_member,
        isOwner: viewerId !== null && r.owner_id === viewerId,
        createdAt: iso(r.created_at),
      },
    ]),
  );
  return ordered(ids, map);
}

// ------------------------------------------------------------------ messaging

export type Message = {
  id: string;
  conversationId: string;
  sender: UserSummary;
  text: string;
  media: Media | null;
  createdAt: string;
};

export async function loadMessages(db: Db, ids: string[], viewerId: string | null): Promise<Message[]> {
  if (!ids.length) return [];
  const rows = await many(db, 'SELECT * FROM messages WHERE id = ANY($1::uuid[])', [ids]);
  const senders = await loadUserSummaryMap(db, rows.map((r) => r.sender_id), viewerId);
  const map = new Map<string, Message>();
  for (const r of rows) {
    const sender = senders.get(r.sender_id);
    if (!sender) continue;
    map.set(r.id, {
      id: r.id,
      conversationId: r.conversation_id,
      sender,
      text: r.text,
      media: mediaFromRow(r),
      createdAt: iso(r.created_at),
    });
  }
  return ordered(ids, map);
}

export type Conversation = {
  id: string;
  isGroup: boolean;
  title: string;
  avatarUrl: string | null;
  participants: UserSummary[];
  lastMessage: Message | null;
  unreadCount: number;
  muted: boolean;
  updatedAt: string;
};

export async function loadConversations(db: Db, ids: string[], viewerId: string): Promise<Conversation[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT c.id, c.is_group, c.title, c.updated_at, me.muted,
            (SELECT array_agg(cp.user_id ORDER BY cp.joined_at) FROM conversation_participants cp
              WHERE cp.conversation_id = c.id AND cp.user_id <> $2) AS other_ids,
            (SELECT m.id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_id,
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.created_at > me.last_read_at AND m.sender_id <> $2) AS unread_count
       FROM conversations c
       JOIN conversation_participants me ON me.conversation_id = c.id AND me.user_id = $2
      WHERE c.id = ANY($1::uuid[])`,
    [ids, viewerId],
  );
  const userIds = rows.flatMap((r) => r.other_ids ?? []);
  const users = await loadUserSummaryMap(db, userIds, viewerId);
  const lastIds = rows.map((r) => r.last_message_id).filter(Boolean);
  const lastMessages = new Map((await loadMessages(db, lastIds, viewerId)).map((m) => [m.id, m]));
  const map = new Map<string, Conversation>();
  for (const r of rows) {
    const participants = ((r.other_ids ?? []) as string[]).map((id) => users.get(id)).filter(Boolean) as UserSummary[];
    const other = !r.is_group ? participants[0] : undefined;
    map.set(r.id, {
      id: r.id,
      isGroup: r.is_group,
      title: r.is_group ? r.title ?? 'Group' : other?.name ?? 'Deleted user',
      avatarUrl: r.is_group ? null : other?.avatarUrl ?? null,
      participants,
      lastMessage: r.last_message_id ? lastMessages.get(r.last_message_id) ?? null : null,
      unreadCount: r.unread_count,
      muted: r.muted,
      updatedAt: iso(r.updated_at),
    });
  }
  return ordered(ids, map);
}

// ------------------------------------------------------------------ notifications

export type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'community_join' | 'message';
  actor: UserSummary;
  post: { id: string; type: 'video' | 'post'; thumbnailUrl: string | null } | null;
  community: { id: string; name: string } | null;
  text: string;
  read: boolean;
  createdAt: string;
};

export async function loadNotifications(db: Db, ids: string[], viewerId: string): Promise<Notification[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT n.*, p.type AS post_type, p.media_kind, p.media_key, p.thumbnail_key, c.name AS community_name
       FROM notifications n
       LEFT JOIN posts p ON p.id = n.post_id
       LEFT JOIN communities c ON c.id = n.community_id
      WHERE n.id = ANY($1::uuid[])`,
    [ids],
  );
  const actors = await loadUserSummaryMap(db, rows.map((r) => r.actor_id), viewerId);
  const map = new Map<string, Notification>();
  for (const r of rows) {
    const actor = actors.get(r.actor_id);
    if (!actor) continue;
    map.set(r.id, {
      id: r.id,
      type: r.type,
      actor,
      post: r.post_id
        ? {
            id: r.post_id,
            type: r.post_type,
            thumbnailUrl: mediaUrl(r.thumbnail_key) ?? (r.media_kind === 'image' ? mediaUrl(r.media_key) : null),
          }
        : null,
      community: r.community_id ? { id: r.community_id, name: r.community_name } : null,
      text: r.text,
      read: r.read,
      createdAt: iso(r.created_at),
    });
  }
  return ordered(ids, map);
}
