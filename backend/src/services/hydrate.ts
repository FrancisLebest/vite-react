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
  followStatus: FollowStatus;
  isPrivate: boolean;
};

export type FollowStatus = 'none' | 'requested' | 'following';

export type User = UserSummary & {
  bio: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  mutualCount: number;
  isMe: boolean;
  isBlocked: boolean;
  isAdmin: boolean;
  canMessage: boolean;
  pinnedPostIds: string[];
  createdAt: string;
};

export type Me = User & { email: string; emailVerified: boolean; interests: string[] };

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

/**
 * SQL predicate: post `p` is visible to viewer `v`: own post, or a ready post whose author is not
 * blocked (either way), not suspended, and either public or followed by the viewer.
 */
export function postVisibleSql(p: string, v: string): string {
  return `(${p}.author_id = ${v} OR (${p}.status = 'ready' AND ${notBlockedSql(`${p}.author_id`, v)}
    AND NOT EXISTS (SELECT 1 FROM users pvu WHERE pvu.id = ${p}.author_id AND (pvu.suspended_at IS NOT NULL OR (pvu.is_private
      AND NOT EXISTS (SELECT 1 FROM follows pvf WHERE pvf.follower_id = ${v} AND pvf.following_id = ${p}.author_id))))))`;
}

/** SQL predicate: viewer `v` may see the content (posts, lists) of user in column `col`. */
export function canSeeUserContentSql(col: string, v: string): string {
  return `(${col} = ${v} OR (${notBlockedSql(col, v)} AND NOT EXISTS (SELECT 1 FROM users cvu WHERE cvu.id = ${col} AND (cvu.suspended_at IS NOT NULL OR (cvu.is_private
      AND NOT EXISTS (SELECT 1 FROM follows cvf WHERE cvf.follower_id = ${v} AND cvf.following_id = ${col}))))))`;
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
    followStatus: r.is_following ? 'following' : r.is_requested ? 'requested' : 'none',
    isPrivate: !!r.is_private,
  };
}

const FOLLOW_FLAGS = `($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id)) AS is_following,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM follow_requests fr WHERE fr.requester_id = $2 AND fr.target_id = u.id)) AS is_requested`;

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
    `SELECT u.id, u.username, u.name, u.avatar_key, u.university, u.role, u.verified, u.is_private,
            ${FOLLOW_FLAGS}
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
    `SELECT u.id, u.username, u.name, u.avatar_key, u.university, u.role, u.verified, u.bio, u.email, u.is_private,
            u.follower_count, u.following_count, u.post_count, u.created_at, u.is_admin, u.pinned_post_ids,
            u.email_verified_at, u.interests,
            ${FOLLOW_FLAGS},
            ($2::uuid IS NOT NULL AND $2::uuid <> u.id
              AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $2))
              AND (u.dm_policy = 'everyone'
                OR (u.dm_policy = 'followers' AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id))
                OR EXISTS (SELECT 1 FROM conversations dc JOIN messages dm ON dm.conversation_id = dc.id AND dm.sender_id = u.id
                            WHERE dc.dm_key = LEAST($2::text, u.id::text) || ':' || GREATEST($2::text, u.id::text)))) AS can_message,
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
        isAdmin: r.is_admin,
        canMessage: !!r.can_message,
        pinnedPostIds: r.pinned_post_ids ?? [],
        createdAt: iso(r.created_at),
        ...(viewerId === r.id ? { email: r.email, emailVerified: r.email_verified_at !== null, interests: r.interests ?? [] } : {}),
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
  status: 'processing' | 'ready' | 'failed';
  editedAt: string | null;
  poll: Poll | null;
  series: SeriesRef | null;
  repostCount: number;
  repostedByMe: boolean;
  repostedBy: UserSummary | null;
  isPinned: boolean;
  pinnedCommentId: string | null;
};

export type Poll = {
  id: string;
  kind: 'poll' | 'quiz';
  question: string | null;
  options: { id: string; text: string; voteCount: number | null }[];
  totalVotes: number | null;
  myVoteOptionId: string | null;
  correctOptionId: string | null;
  isCorrect: boolean | null;
};

export type SeriesRef = { id: string; title: string; position: number; total: number; prevPostId: string | null; nextPostId: string | null };

export async function loadPolls(db: Db, postIds: string[], viewerId: string | null): Promise<Map<string, Poll>> {
  const map = new Map<string, Poll>();
  if (!postIds.length) return map;
  const polls = await many(
    db,
    `SELECT pl.*, p.author_id,
            (SELECT v.option_id FROM poll_votes v WHERE v.poll_id = pl.id AND v.user_id = $2) AS my_vote
       FROM polls pl JOIN posts p ON p.id = pl.post_id WHERE pl.post_id = ANY($1::uuid[])`,
    [postIds, viewerId],
  );
  if (!polls.length) return map;
  const options = await many(db, 'SELECT * FROM poll_options WHERE poll_id = ANY($1::uuid[]) ORDER BY position', [polls.map((p) => p.id)]);
  for (const pl of polls) {
    const reveal = pl.my_vote !== null || (viewerId !== null && pl.author_id === viewerId);
    const opts = options.filter((o) => o.poll_id === pl.id);
    const total = opts.reduce((n, o) => n + o.vote_count, 0);
    map.set(pl.post_id, {
      id: pl.id,
      kind: pl.kind,
      question: pl.question,
      options: opts.map((o) => ({ id: o.id, text: o.text, voteCount: reveal ? o.vote_count : null })),
      totalVotes: reveal ? total : null,
      myVoteOptionId: pl.my_vote,
      correctOptionId: pl.kind === 'quiz' && reveal ? pl.correct_option_id : null,
      isCorrect: pl.kind === 'quiz' && pl.my_vote ? pl.my_vote === pl.correct_option_id : null,
    });
  }
  return map;
}

export async function loadSeriesRefs(db: Db, postIds: string[], viewerId: string | null): Promise<Map<string, SeriesRef>> {
  const map = new Map<string, SeriesRef>();
  if (!postIds.length) return map;
  const rows = await many(
    db,
    `SELECT x.post_id, s.id, s.title, x.pos, x.total, x.prev, x.next FROM (
       SELECT si.series_id, si.post_id,
              row_number() OVER w AS pos, count(*) OVER (PARTITION BY si.series_id) AS total,
              lag(si.post_id) OVER w AS prev, lead(si.post_id) OVER w AS next
         FROM series_items si JOIN posts p ON p.id = si.post_id
        WHERE si.series_id IN (SELECT series_id FROM series_items WHERE post_id = ANY($1::uuid[]))
          AND (p.status = 'ready' OR p.author_id = $2)
       WINDOW w AS (PARTITION BY si.series_id ORDER BY si.position)
     ) x JOIN series s ON s.id = x.series_id WHERE x.post_id = ANY($1::uuid[])`,
    [postIds, viewerId],
  );
  for (const r of rows) {
    map.set(r.post_id, { id: r.id, title: r.title, position: Number(r.pos), total: Number(r.total), prevPostId: r.prev, nextPostId: r.next });
  }
  return map;
}

export async function loadPosts(db: Db, ids: string[], viewerId: string | null): Promise<Post[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT p.*, c.name AS community_name,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $2)) AS liked,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = $2)) AS bookmarked,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM reposts r WHERE r.post_id = p.id AND r.user_id = $2)) AS reposted,
            (p.id = ANY(au.pinned_post_ids)) AS is_pinned
       FROM posts p JOIN users au ON au.id = p.author_id LEFT JOIN communities c ON c.id = p.community_id
      WHERE p.id = ANY($1::uuid[])`,
    [[...new Set(ids)], viewerId],
  );
  const postIds = rows.map((r) => r.id);
  const [authors, polls, seriesRefs] = await Promise.all([
    loadUserSummaryMap(db, rows.map((r) => r.author_id), viewerId),
    loadPolls(db, postIds, viewerId),
    loadSeriesRefs(db, postIds, viewerId),
  ]);
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
      status: r.status,
      editedAt: r.edited_at ? iso(r.edited_at) : null,
      poll: polls.get(r.id) ?? null,
      series: seriesRefs.get(r.id) ?? null,
      repostCount: r.repost_count,
      repostedByMe: !!r.reposted,
      repostedBy: null,
      isPinned: !!r.is_pinned,
      pinnedCommentId: r.pinned_comment_id ?? null,
    });
  }
  return ordered(ids, map);
}

export type PostSummary = { id: string; type: 'video' | 'post'; text: string; thumbnailUrl: string | null; author: UserSummary };

/** Compact post previews (only posts visible to the viewer are returned). */
export async function loadPostSummaryMap(db: Db, ids: string[], viewerId: string): Promise<Map<string, PostSummary>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await many(
    db,
    `SELECT p.id, p.type, p.text, p.author_id, p.media_kind, p.media_key, p.thumbnail_key
       FROM posts p WHERE p.id = ANY($1::uuid[]) AND ${postVisibleSql('p', '$2')}`,
    [unique, viewerId],
  );
  const authors = await loadUserSummaryMap(db, rows.map((r) => r.author_id), viewerId);
  const map = new Map<string, PostSummary>();
  for (const r of rows) {
    const author = authors.get(r.author_id);
    if (!author) continue;
    map.set(r.id, {
      id: r.id,
      type: r.type,
      text: r.text.length > 200 ? `${r.text.slice(0, 199)}…` : r.text,
      thumbnailUrl: mediaUrl(r.thumbnail_key) ?? (r.media_kind === 'image' ? mediaUrl(r.media_key) : null),
      author,
    });
  }
  return map;
}

// ------------------------------------------------------------------ comments

export type Comment = {
  id: string;
  text: string;
  author: UserSummary;
  createdAt: string;
  postId: string;
  parentId: string | null;
  replyCount: number;
  likeCount: number;
  likedByMe: boolean;
  isPinned: boolean;
};

export async function loadComments(db: Db, ids: string[], viewerId: string | null): Promise<Comment[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT c.*, (p.pinned_comment_id = c.id) AS is_pinned,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $2)) AS liked
       FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ANY($1::uuid[])`,
    [ids, viewerId],
  );
  const authors = await loadUserSummaryMap(db, rows.map((r) => r.author_id), viewerId);
  const map = new Map<string, Comment>();
  for (const r of rows) {
    const author = authors.get(r.author_id);
    if (author) {
      map.set(r.id, {
        id: r.id,
        text: r.text,
        author,
        createdAt: iso(r.created_at),
        postId: r.post_id,
        parentId: r.parent_id ?? null,
        replyCount: r.reply_count,
        likeCount: r.like_count,
        likedByMe: !!r.liked,
        isPinned: !!r.is_pinned,
      });
    }
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
  post: PostSummary | null;
  createdAt: string;
};

export async function loadMessages(db: Db, ids: string[], viewerId: string | null): Promise<Message[]> {
  if (!ids.length) return [];
  const rows = await many(db, 'SELECT * FROM messages WHERE id = ANY($1::uuid[])', [ids]);
  const senders = await loadUserSummaryMap(db, rows.map((r) => r.sender_id), viewerId);
  const shared = viewerId ? await loadPostSummaryMap(db, rows.map((r) => r.shared_post_id), viewerId) : new Map<string, PostSummary>();
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
      post: r.shared_post_id ? shared.get(r.shared_post_id) ?? null : null,
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
  type: string;
  comment: { id: string; text: string } | null;
  event: { id: string; title: string; startsAt: string } | null;
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
    `SELECT n.*, p.type AS post_type, p.media_kind, p.media_key, p.thumbnail_key, c.name AS community_name,
            cm.text AS comment_text, e.title AS event_title, e.starts_at AS event_starts_at
       FROM notifications n
       LEFT JOIN posts p ON p.id = n.post_id
       LEFT JOIN communities c ON c.id = n.community_id
       LEFT JOIN comments cm ON cm.id = n.comment_id
       LEFT JOIN events e ON e.id = n.event_id
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
      comment: r.comment_id ? { id: r.comment_id, text: r.comment_text } : null,
      event: r.event_id ? { id: r.event_id, title: r.event_title, startsAt: iso(r.event_starts_at) } : null,
      text: r.text,
      read: r.read,
      createdAt: iso(r.created_at),
    });
  }
  return ordered(ids, map);
}

// ------------------------------------------------------------------ series

export type Series = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  category: string;
  author: UserSummary;
  itemCount: number;
  followerCount: number;
  isFollowing: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function loadSeries(db: Db, ids: string[], viewerId: string | null): Promise<Series[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT s.*,
            ($2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM series_follows f WHERE f.series_id = s.id AND f.user_id = $2)) AS is_following,
            CASE WHEN s.author_id = $2 THEN s.item_count ELSE
              (SELECT count(*)::int FROM series_items si JOIN posts p ON p.id = si.post_id WHERE si.series_id = s.id AND p.status = 'ready') END AS visible_count
       FROM series s WHERE s.id = ANY($1::uuid[])`,
    [[...new Set(ids)], viewerId],
  );
  const authors = await loadUserSummaryMap(db, rows.map((r) => r.author_id), viewerId);
  const map = new Map<string, Series>();
  for (const r of rows) {
    const author = authors.get(r.author_id);
    if (!author) continue;
    map.set(r.id, {
      id: r.id,
      title: r.title,
      description: r.description,
      coverUrl: mediaUrl(r.cover_key),
      category: r.category,
      author,
      itemCount: r.visible_count,
      followerCount: r.follower_count,
      isFollowing: !!r.is_following,
      isOwner: viewerId !== null && r.author_id === viewerId,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    });
  }
  return ordered(ids, map);
}

// ------------------------------------------------------------------ events

export type Event = {
  id: string;
  community: { id: string; name: string };
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  onlineUrl: string | null;
  creator: UserSummary;
  goingCount: number;
  myRsvp: 'going' | 'not_going' | null;
  canEdit: boolean;
  createdAt: string;
};

export async function loadEvents(db: Db, ids: string[], viewerId: string): Promise<Event[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT e.*, c.name AS community_name, c.owner_id,
            (SELECT r.status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = $2) AS my_rsvp
       FROM events e JOIN communities c ON c.id = e.community_id WHERE e.id = ANY($1::uuid[])`,
    [[...new Set(ids)], viewerId],
  );
  const creators = await loadUserSummaryMap(db, rows.map((r) => r.creator_id), viewerId);
  const map = new Map<string, Event>();
  for (const r of rows) {
    const creator = creators.get(r.creator_id);
    if (!creator) continue;
    map.set(r.id, {
      id: r.id,
      community: { id: r.community_id, name: r.community_name },
      title: r.title,
      description: r.description,
      startsAt: iso(r.starts_at),
      endsAt: r.ends_at ? iso(r.ends_at) : null,
      location: r.location,
      onlineUrl: r.online_url,
      creator,
      goingCount: r.going_count,
      myRsvp: r.my_rsvp ?? null,
      canEdit: r.creator_id === viewerId || r.owner_id === viewerId,
      createdAt: iso(r.created_at),
    });
  }
  return ordered(ids, map);
}

// ------------------------------------------------------------------ moderation

export type Report = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewed' | 'dismissed';
  reporter: UserSummary | null;
  targetPreview: string | null;
  targetAuthor: UserSummary | null;
  resolution: string | null;
  note: string | null;
  resolvedBy: UserSummary | null;
  resolvedAt: string | null;
  createdAt: string;
};

export async function loadReports(db: Db, ids: string[], viewerId: string): Promise<Report[]> {
  if (!ids.length) return [];
  const rows = await many(
    db,
    `SELECT r.*, t.preview, t.author_id FROM reports r
       LEFT JOIN LATERAL (
         SELECT left(p.text, 200) AS preview, p.author_id FROM posts p WHERE r.target_type = 'post' AND p.id = r.target_id
         UNION ALL SELECT left(c.text, 200), c.author_id FROM comments c WHERE r.target_type = 'comment' AND c.id = r.target_id
         UNION ALL SELECT left(m.text, 200), m.sender_id FROM messages m WHERE r.target_type = 'message' AND m.id = r.target_id
         UNION ALL SELECT u.name || ' (@' || u.username || ')', u.id FROM users u WHERE r.target_type = 'user' AND u.id = r.target_id
         UNION ALL SELECT cm.name::text, cm.owner_id FROM communities cm WHERE r.target_type = 'community' AND cm.id = r.target_id
       ) t ON true
      WHERE r.id = ANY($1::uuid[])`,
    [ids],
  );
  const users = await loadUserSummaryMap(db, rows.flatMap((r) => [r.reporter_id, r.author_id, r.resolved_by].filter(Boolean)), viewerId);
  const map = new Map<string, Report>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      reporter: users.get(r.reporter_id) ?? null,
      targetPreview: r.preview ?? null,
      targetAuthor: r.author_id ? users.get(r.author_id) ?? null : null,
      resolution: r.resolution,
      note: r.note,
      resolvedBy: r.resolved_by ? users.get(r.resolved_by) ?? null : null,
      resolvedAt: r.resolved_at ? iso(r.resolved_at) : null,
      createdAt: iso(r.created_at),
    });
  }
  return ordered(ids, map);
}

export type VerificationRequest = {
  id: string;
  user: UserSummary;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt: string | null;
};

export async function loadVerificationRequests(db: Db, ids: string[], viewerId: string): Promise<VerificationRequest[]> {
  if (!ids.length) return [];
  const rows = await many(db, 'SELECT * FROM verification_requests WHERE id = ANY($1::uuid[])', [ids]);
  const users = await loadUserSummaryMap(db, rows.map((r) => r.user_id), viewerId);
  const map = new Map<string, VerificationRequest>();
  for (const r of rows) {
    const user = users.get(r.user_id);
    if (!user) continue;
    map.set(r.id, {
      id: r.id,
      user,
      message: r.message,
      status: r.status,
      createdAt: iso(r.created_at),
      decidedAt: r.decided_at ? iso(r.decided_at) : null,
    });
  }
  return ordered(ids, map);
}
