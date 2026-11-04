# StudyHub API contract (v1)

Single source of truth shared by `backend/` and `mobile/`. Any change must be reflected here.

## Conventions

- Base URL: `${API_URL}/api/v1` (dev: `http://localhost:4000/api/v1`; Android emulator: `http://10.0.2.2:4000/api/v1`).
- JSON everywhere except uploads (`multipart/form-data`).
- Auth: `Authorization: Bearer <accessToken>` (JWT, 15 min). Refresh token: opaque, 30 days, rotated on every refresh, stored hashed server-side. Reusing an already-rotated refresh token revokes all of the user's refresh tokens.
- Every endpoint requires a Bearer token **except**: `POST /auth/register|login|refresh|logout|forgot-password|reset-password`, `GET /categories`, `GET /universities`, `GET /health`, `GET /uploads/*`.
- Errors: HTTP status + `{ "error": { "code": "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL", "message": string, "details"?: any } }`.
  - `VALIDATION_ERROR` (400, or 413 for files/bodies too large): `details` = `[{ path: string, message: string, code: string }]` for field errors.
  - `CONFLICT` on register / username change: `details` = `{ field: 'email' | 'username' }`; on community name: `{ field: 'name' }`.
- Pagination (cursor): query `?cursor=<opaque>&limit=<1..50, default 20>` → `{ "items": T[], "nextCursor": string | null }`.
- Dates: ISO 8601 strings. IDs: strings (cuid/uuid).
- Media URLs are absolute (`PUBLIC_URL` + `/uploads/...`).
- `GET /health` (outside `/api/v1`) → `{ "status": "ok" }`.

## Shared objects

```ts
type Role = 'student' | 'professor' | 'creator';
type CategoryId = 'study-tips' | 'exams' | 'assignments' | 'math' | 'science' | 'programming' | 'business' | 'notes' | 'languages' | 'other';

UserSummary = { id, username, name, avatarUrl: string|null, university: string|null, role: Role, verified: boolean, isFollowing: boolean }
User = UserSummary & { bio: string|null, followerCount, followingCount, postCount, mutualCount, isMe: boolean, isBlocked: boolean, createdAt }
Me = User & { email: string }

Media = { kind: 'video'|'image'|'audio', url, thumbnailUrl: string|null, durationSec: number|null, width: number|null, height: number|null }

Post = {
  id, type: 'video' | 'post', text: string, hashtags: string[], category: CategoryId,
  media: Media | null, author: UserSummary, community: { id, name } | null,
  likeCount, commentCount, shareCount, bookmarkCount, viewCount,
  likedByMe: boolean, bookmarkedByMe: boolean, createdAt
}
Comment = { id, text, author: UserSummary, createdAt, postId }

Community = {
  id, name, description: string, kind: 'university'|'faculty'|'topic', icon: string /* Ionicons name */, color: string /* #hex */,
  avatarUrl: string|null, memberCount, postCount, isMember: boolean, isOwner: boolean, createdAt
}

Message = { id, conversationId, sender: UserSummary, text: string, media: Media|null, createdAt }
Conversation = {
  id, isGroup: boolean, title: string /* group title, or other user's name for DMs */, avatarUrl: string|null,
  participants: UserSummary[], lastMessage: Message|null, unreadCount: number, muted: boolean, updatedAt
}

Notification = {
  id, type: 'like'|'comment'|'follow'|'mention'|'community_join'|'message',
  actor: UserSummary, post: { id, type, thumbnailUrl: string|null } | null, community: { id, name } | null,
  text: string /* e.g. "liked your video" */, read: boolean, createdAt
}

Category = { id: CategoryId, label: string, icon: string /* Ionicons */ }
```

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, username (3-30, [a-z0-9._]), email, password (>=8), university?, role? }` | `201 { user: Me, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ identifier /* email or username */, password }` | `{ user: Me, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |
| GET | `/auth/me` | – | `Me` |
| POST | `/auth/forgot-password` | `{ email }` | `204` (always; sends 6-digit code by email via SMTP, logged to console when SMTP not configured) |
| POST | `/auth/reset-password` | `{ email, code, newPassword }` | `204` |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` | `204` |

## Users

| Method | Path | Notes |
|---|---|---|
| GET | `/users?q=&role=&university=&sort=popular\|recent&cursor` | Directory → page of `User` |
| GET | `/users/suggested?limit=` | Users not yet followed, popular first → `UserSummary[]` |
| GET | `/users/:idOrUsername` | `User` |
| PATCH | `/users/me` | `{ name?, username?, bio?, university?, role? }` → `Me` |
| POST | `/users/me/avatar` | multipart `avatar` (image ≤ 5 MB) → `Me` |
| DELETE | `/users/me` | Deletes account and all content → `204` (App Store requirement) |
| POST / DELETE | `/users/:id/follow` | → `{ isFollowing, followerCount }` |
| GET | `/users/:id/followers`, `/users/:id/following` | page of `UserSummary` |
| GET | `/users/:id/posts?type=video\|post&cursor` | page of `Post` |
| POST / DELETE | `/users/:id/block` | → `204`. Blocked users' content is hidden from the blocker, no DMs either way |
| GET | `/users/me/blocked` | `UserSummary[]` |
| POST | `/users/me/push-token` | `{ token, platform: 'ios'\|'android' }` → `204` (stored for future push) |
| GET | `/universities?q=` | `string[]` distinct universities from users + communities of kind university |

## Posts & feed

| Method | Path | Notes |
|---|---|---|
| GET | `/feed?tab=forYou\|following&type=video\|post&sort=latest\|popular&category=&cursor` | `forYou` = ranked (recency + engagement), excludes blocked users. Without `sort`: `forYou` is ranked, `following` is latest-first |
| POST | `/posts` | multipart: `type`, `text`, `category`, `communityId?`, `media?` (video ≤ 100 MB mp4/mov, image ≤ 10 MB, audio ≤ 20 MB). `type=video` requires a video file. Server extracts `#hashtags` and `@mentions` (→ notifications), generates video thumbnail + duration with ffmpeg → `201 Post`. Text-only posts may also be sent as JSON. `category` defaults to `other`. `type=post` needs `text` or `media`. Posting with `communityId` requires membership (else 403) |
| GET | `/posts/:id` | `Post` |
| DELETE | `/posts/:id` | author only → `204` |
| POST / DELETE | `/posts/:id/like` | → `{ liked, likeCount }` |
| POST / DELETE | `/posts/:id/bookmark` | → `{ bookmarked, bookmarkCount }` |
| POST | `/posts/:id/share` | → `{ shareCount }` |
| POST | `/posts/:id/view` | → `204` (counted once per user per post) |
| GET | `/posts/:id/comments?cursor` | page of `Comment`, oldest first |
| POST | `/posts/:id/comments` | `{ text (1..1000) }` → `201 Comment` |
| DELETE | `/comments/:id` | comment author or post author → `204` |
| GET | `/me/bookmarks?cursor` | page of `Post` |
| GET | `/categories` | `Category[]` |
| GET | `/trending/topics` | `(Category & { postCount })[]` ordered by posts in last 7 days |
| GET | `/trending/hashtags?limit=` | `{ tag, postCount }[]` |

## Communities

| Method | Path | Notes |
|---|---|---|
| GET | `/communities?q=&kind=&mine=true&sort=popular\|recent&cursor` | page of `Community` |
| POST | `/communities` | multipart or JSON `{ name (3-60, unique), description?, kind, icon, color, avatar? }` → `201 Community` (creator auto-joins as owner) |
| GET | `/communities/:id` | `Community` |
| PATCH | `/communities/:id` | owner only |
| DELETE | `/communities/:id` | owner only |
| POST / DELETE | `/communities/:id/join` | → `{ isMember, memberCount }` (owner cannot leave) |
| GET | `/communities/:id/posts?cursor` | page of `Post` |
| GET | `/communities/:id/members?cursor` | page of `UserSummary` |

## Search

`GET /search?q=&type=all|posts|users|communities&category=&university=&sort=relevant|recent|popular&cursor`

- `type=all` → `{ posts: Post[] (≤10), users: UserSummary[] (≤10), communities: Community[] (≤10), total: number }`
- otherwise → `{ items, nextCursor, total }`
- Full-text: PostgreSQL `ILIKE`/trigram on post text + hashtags, user name/username, community name/description.

## Messaging

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations?cursor` | page of `Conversation`, most recent first (DMs without any message yet are omitted) |
| POST | `/conversations` | `{ userId }` → get-or-create DM; or `{ title, memberIds[] }` → group. → `Conversation` (`201` when created, `200` when the DM already existed). `403` if a block exists |
| GET | `/conversations/:id` | `Conversation` (participants only) |
| PATCH | `/conversations/:id` | `{ muted?: boolean, title?: string }` |
| GET | `/conversations/:id/messages?cursor` | page of `Message`, **newest first** |
| POST | `/conversations/:id/messages` | JSON `{ text }` or multipart `text` + `media` → `201 Message` (also emitted on socket) |
| POST | `/conversations/:id/read` | marks all read → `204` |
| GET | `/conversations/unread-count` | `{ count }` (number of conversations with unread messages) |

## Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?cursor` | page of `Notification` |
| GET | `/notifications/unread-count` | `{ count }` |
| POST | `/notifications/read-all` | `204` |

## Moderation

| Method | Path | Notes |
|---|---|---|
| POST | `/reports` | `{ targetType: 'post'\|'comment'\|'user'\|'community'\|'message', targetId, reason: 'spam'\|'harassment'\|'inappropriate'\|'other', details? }` → `201 { id, status: 'open', createdAt }` (404 if the target does not exist) |

## Realtime (Socket.IO, same host/port, path `/socket.io`)

- Connect with `auth: { token: accessToken }`; invalid token → `connect_error` with message `UNAUTHORIZED`.
- Each socket joins room `user:<id>`.
- Server → client:
  - `message:new` `{ message: Message }`
  - `conversation:read` `{ conversationId, userId }`
  - `notification:new` `{ notification: Notification }`
  - `typing` `{ conversationId, user: UserSummary }`
- Client → server: `typing` `{ conversationId }`.

## Implementation notes (backend)

- `Conversation.participants` lists the **other** participants (the viewer is excluded). For DMs, `title`/`avatarUrl` are the other user's name/avatar.
- `User.mutualCount` = number of users the viewer follows who also follow this user (0 for yourself).
- `Media.thumbnailUrl` is the generated JPEG for videos, the image URL itself for images, `null` for audio. Post videos are transcoded in the background since v1.1 (see below); message videos are only remuxed to MP4 (faststart).
- Blocks: if the target blocked the viewer, `GET /users/:id` and that user's posts return `404`; the blocker still sees the profile with `isBlocked: true` (and an empty post list) so they can unblock. Blocking removes follows in both directions.
- `POST /communities` defaults: `icon = 'people-outline'`, `color = '#6C5CE7'`, `description = ''`. Owner leaving → `403`.
- Unliking / unfollowing / leaving removes the corresponding notification; deleting a comment or post removes notifications attached to it.
- Ranked lists (`forYou`, `sort=popular`, search, directory `sort=popular`) use opaque offset cursors (max offset 10 000); chronological lists use keyset cursors.
- `GET /universities` is public (sign-up screen) and returns at most 50 names.

---

## v1.1 — Advanced features

Everything below is **additive**: existing fields, endpoints and events keep their meaning. Clients must ignore unknown fields and unknown notification `type` values. All endpoints require a Bearer token unless stated otherwise. Paths are relative to `/api/v1`.

### New / extended error codes

- `ACCOUNT_SUSPENDED` (HTTP 403): returned by `POST /auth/login`, `POST /auth/refresh`, every authenticated request and the Socket.IO handshake (`connect_error` message `ACCOUNT_SUSPENDED`) when the account is suspended. `details` = `{ reason: string | null }`.
- Content filter (when `CONTENT_FILTER=reject`): `400 VALIDATION_ERROR` with `details` = `[{ path: '<field>', message: 'Contains blocked words', code: 'blocked_words' }]`. In the default `mask` mode, blocked words are silently replaced by `*` characters instead. The filter applies to post text, comments, messages, bios, names, community name/description, series title/description and event title/description.

### Extended shared objects (new fields only)

```ts
type FollowStatus = 'none' | 'requested' | 'following';
type PostStatus = 'processing' | 'ready' | 'failed';

UserSummary += {
  followStatus: FollowStatus,   // viewer → this user. isFollowing === (followStatus === 'following')
  isPrivate: boolean,
}
User += {
  isAdmin: boolean,
  canMessage: boolean,          // whether the viewer may open/continue a DM with this user (blocks + their dmPolicy). false for yourself
  pinnedPostIds: string[],      // max 3, in pin order
}
Me += {
  emailVerified: boolean,
  interests: CategoryId[],
}

Media.kind/url unchanged. While a video post is `processing`, `media.url` points to the original upload and `thumbnailUrl` to a quick preview frame (both replaced once ready).

Poll = {
  id,
  kind: 'poll' | 'quiz',
  question: string | null,
  options: { id: string, text: string, voteCount: number | null }[],  // voteCount null until the viewer voted (the post author always sees counts)
  totalVotes: number | null,                                         // same visibility rule as voteCount
  myVoteOptionId: string | null,
  correctOptionId: string | null,   // quiz only, and only after the viewer voted (author always sees it). Always null for kind='poll'
  isCorrect: boolean | null,        // quiz only, after voting
}

SeriesRef = { id, title, position: number /* 1-based */, total: number, prevPostId: string | null, nextPostId: string | null }

Post += {
  status: PostStatus,               // non-authors only ever receive 'ready' posts
  editedAt: string | null,
  poll: Poll | null,
  series: SeriesRef | null,
  repostCount: number,
  repostedByMe: boolean,
  repostedBy: UserSummary | null,   // set only on feed items that appear because someone you follow reposted it (following feed)
  isPinned: boolean,                // pinned on its author's profile
  pinnedCommentId: string | null,
}

PostSummary = { id, type: 'video' | 'post', text: string /* ≤ 200 chars */, thumbnailUrl: string | null, author: UserSummary }

Comment += {
  parentId: string | null,          // null = top-level comment
  replyCount: number,               // top-level comments only (0 for replies)
  likeCount: number,
  likedByMe: boolean,
  isPinned: boolean,
}

Message += { post: PostSummary | null }   // a shared post; null if none or no longer visible to the viewer

Notification.type += 'reply' | 'comment_like' | 'follow_request' | 'follow_accepted' | 'repost' | 'event' | 'verification'
Notification += {
  comment: { id, text } | null,
  event: { id, title, startsAt } | null,
}

Settings = {
  isPrivate: boolean,
  dmPolicy: 'everyone' | 'followers' | 'nobody',   // 'followers' = only users who follow me may DM me
  notifications: {
    push: boolean,            // master switch for push only
    likes: boolean,           // like + comment_like + repost
    comments: boolean,        // comment
    replies: boolean,         // reply
    follows: boolean,         // follow + follow_accepted
    followRequests: boolean,  // follow_request
    mentions: boolean,        // mention
    messages: boolean,        // push for new messages (there is no in-app notification for messages)
    communityJoins: boolean,  // community_join
    events: boolean,          // event
  }
}
// A disabled preference suppresses BOTH the in-app notification and the push for those types.
// Defaults: everything true, isPrivate false, dmPolicy 'everyone'.

Series = {
  id, title: string, description: string, coverUrl: string | null, category: CategoryId,
  author: UserSummary, itemCount: number, followerCount: number, isFollowing: boolean, isOwner: boolean,
  createdAt, updatedAt
}
SeriesDetail = Series & { items: Post[] }   // ordered by position; non-owners only see 'ready' posts

Event = {
  id, community: { id, name }, title: string, description: string,
  startsAt: string, endsAt: string | null, location: string | null, onlineUrl: string | null,
  creator: UserSummary, goingCount: number, myRsvp: 'going' | 'not_going' | null,
  canEdit: boolean,           // creator or community owner
  createdAt
}

FollowRequest = { user: UserSummary, createdAt }

Report = {
  id, targetType, targetId, reason, details: string | null, status: 'open' | 'reviewed' | 'dismissed',
  reporter: UserSummary | null, targetPreview: string | null /* text excerpt / name */, targetAuthor: UserSummary | null,
  resolution: 'none' | 'content_removed' | 'user_suspended' | null, note: string | null,
  resolvedBy: UserSummary | null, resolvedAt: string | null, createdAt
}

VerificationRequest = { id, user: UserSummary, message: string | null, status: 'pending' | 'approved' | 'rejected', createdAt, decidedAt: string | null }
```

### 1. Video processing pipeline

- `POST /posts` with a video now returns `201 Post` with `status: 'processing'` (unless the server runs with `VIDEO_TRANSCODE=false`, in which case it is `'ready'` immediately, v1 behaviour).
- A background job transcodes to H.264 High / AAC 128 kb/s MP4, max 720p (shorter side ≤ 720 px), `+faststart`, then regenerates the thumbnail, duration and dimensions.
- While `processing` (or `failed`), the post is visible **only to its author** (feed, profile, detail, search…). Likes/comments etc. on it return `404` for other users.
- Socket events to the author (`user:<authorId>` room):
  - `post:ready` `{ post: Post }`
  - `post:failed` `{ postId: string, reason: string }`
- A `failed` post can be deleted by its author (`DELETE /posts/:id`); there is no retry endpoint.

### 2. Push notifications

- Register the device token with the existing `POST /users/me/push-token` `{ token, platform }` (FCM registration token on both platforms; iOS goes through APNs-via-FCM). `DELETE /users/me/push-token` `{ token }` → `204` (call on logout).
- Sent for: like, comment, reply, comment like, follow, follow request, follow accepted, mention, repost, community join, event, new message (not when the conversation is muted, nor to the sender).
- FCM payload: `notification: { title, body }` and `data` (all strings): `{ type, notificationId?, postId?, commentId?, conversationId?, communityId?, eventId?, actorId? }`. `type` is the notification type, or `'message'` for messages.
- Invalid/unregistered tokens are deleted automatically.

### 3. Comments v2

| Method | Path | Notes |
|---|---|---|
| POST | `/posts/:id/comments` | body `{ text (1..1000), parentId? }`. A reply to a reply is attached to its top-level parent (one level). Notifies the post author (`comment`), the parent comment author (`reply`) and `@mentions` (`mention`) → `201 Comment` |
| GET | `/posts/:id/comments?cursor` | **top-level comments only**: pinned comment first, then oldest first |
| GET | `/comments/:id/replies?cursor` | page of `Comment` (replies), oldest first |
| POST / DELETE | `/comments/:id/like` | → `{ liked, likeCount }` (`comment_like` notification) |
| POST | `/comments/:id/pin` | post author only, top-level comments only; replaces any previously pinned comment → `Comment` |
| DELETE | `/comments/:id/pin` | post author only → `204` |

`Post.commentCount` keeps counting every comment including replies. Deleting a top-level comment deletes its replies.

### 4a. Polls & quizzes

- Create with `POST /posts` (only `type=post`; a post with a poll needs no `text`): field `poll` = JSON (in multipart, a JSON **string**):
  `{ question?: string (≤ 200), options: string[] (2..4, each 1..100), correctOptionIndex?: number /* 0-based → makes it a quiz */ }`.
- `POST /posts/:id/poll/vote` `{ optionId }` → `Poll` (with results). `409 CONFLICT` if already voted, `400` for an unknown option. Authors cannot vote on their own poll (`403`).

### 4b. Series (courses / playlists)

| Method | Path | Notes |
|---|---|---|
| POST | `/series` | JSON or multipart `{ title (1..100), description? (≤ 1000), category, cover? (image file) }` → `201 Series` |
| GET | `/series/:id` | `SeriesDetail` |
| PATCH | `/series/:id` | owner only; same fields, all optional (multipart for a new `cover`) → `Series` |
| DELETE | `/series/:id` | owner only → `204` (posts are kept) |
| POST | `/series/:id/items` | owner only `{ postId, position? /* 1-based, default = append */ }`. Post must be the owner's own; a post belongs to at most one series (`409`) → `SeriesDetail` |
| DELETE | `/series/:id/items/:postId` | owner only → `SeriesDetail` |
| PUT | `/series/:id/items` | owner only, reorder: `{ postIds: string[] }` = exactly the current items in the new order → `SeriesDetail` |
| POST / DELETE | `/series/:id/follow` | → `{ isFollowing, followerCount }` (cannot follow your own series: `400`) |
| GET | `/users/:id/series?cursor` | page of `Series`, newest first |
| GET | `/me/series/following?cursor` | page of `Series` I follow |

### 5. Discovery & social

| Method | Path | Notes |
|---|---|---|
| GET | `/hashtags/:tag?sort=recent\|popular&cursor` | `{ tag, postCount, items: Post[], nextCursor }` (`tag` lowercase, without `#`; `postCount` = all visible posts) |
| POST / DELETE | `/posts/:id/repost` | → `{ reposted, repostCount }`. Cannot repost your own post (`400`). `repost` notification. Reposts appear in followers' `tab=following` feed with `repostedBy` |
| GET | `/users/:id/reposts?cursor` | page of `Post` reposted by that user (newest repost first) |
| PATCH | `/posts/:id` | author only `{ text?, category? }` → `Post` with `editedAt` set; hashtags re-extracted |
| POST / DELETE | `/posts/:id/pin` | pin on your own profile (author only, `ready` posts only, max 3 → `409`) → `{ isPinned, pinnedPostIds }` |
| GET | `/users/:id/pinned` | `Post[]` in pin order (respects privacy/blocks) |
| GET | `/me/history?cursor` | page of `{ viewedAt, post: Post }`, most recent first. Fed by `POST /posts/:id/view` (re-viewing moves the post to the top; the view count still counts once per user) |
| DELETE | `/me/history` | clears the history → `204` (view counts unchanged) |
| DELETE | `/me/history/:postId` | removes one entry → `204` |
| POST | `/conversations/:id/messages` | new optional field `postId` (JSON or multipart): shares a post into the conversation (`text` may then be empty). The post must be visible to the sender. Increments the post's `shareCount` |
| GET | `/users/mentions?q=&limit=` | mention autocomplete: `UserSummary[]` (default 8, max 20); prefix match on username/name; people you follow first. `q` may start with `@` |

### 6. Personalisation & privacy

| Method | Path | Notes |
|---|---|---|
| PUT | `/users/me/interests` | `{ categories: CategoryId[] (0..10) }` → `Me` |
| GET | `/users/me/settings` | `Settings` |
| PUT | `/users/me/settings` | partial `Settings` (deep-merged, e.g. `{ notifications: { likes: false } }`) → `Settings`. Switching `isPrivate` to `false` auto-accepts pending follow requests |
| POST | `/users/:id/follow` | now → `{ isFollowing, followStatus, followerCount }`. Following a private account creates a request (`followStatus: 'requested'`, `follow_request` notification) |
| DELETE | `/users/:id/follow` | unfollows **or cancels a pending request** → same shape |
| GET | `/me/follow-requests?cursor` | page of `FollowRequest` (received), newest first |
| GET | `/me/follow-requests/count` | `{ count }` |
| POST | `/me/follow-requests/:userId/accept` | → `204` (`follow_accepted` notification to the requester, `follow` notification to you) |
| POST | `/me/follow-requests/:userId/decline` | → `204` |
| DELETE | `/users/:id/follower` | remove someone who follows you → `204` |

- For You ranking: engagement × time decay, boosted ×1.5 for creators you follow, ×1.4 for posts in your `interests` categories, ×1.2 for your university; videos you already watched are moved after all unwatched posts.
- Private account: only the owner and approved followers see its posts (everywhere: feeds, profile, search, hashtags, series, pinned, shared PostSummary). Profile (`User`) stays visible; `followers`/`following`/`posts`/`reposts` lists return an empty page to non-followers.
- DM policy is enforced on `POST /conversations` (DM and group members) and on sending in a DM: `403 FORBIDDEN` with message "This user does not accept messages from you". A DM where the recipient already sent a message stays open.

### 7. Email verification

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/verify-email` | auth required, `{ code /* 6 digits */ }` → `Me` (`emailVerified: true`). Wrong/expired code → `400` (max 5 attempts per code, code valid 24 h) |
| POST | `/auth/resend-verification` | auth required → `204` (`409` if already verified) |

A code is e-mailed at registration (logged to console without SMTP). Unverified accounts keep full access; the app should show a reminder.

### 8. Creator analytics

`GET /me/analytics?range=7d|28d|90d` (default `28d`) →

```ts
{
  range: '7d' | '28d' | '90d', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD',   // UTC days, inclusive, to = today
  totals: { views, likes, comments, shares, newFollowers },           // within the range
  daily: { date: 'YYYY-MM-DD', views, likes, comments, shares, newFollowers }[],  // one entry per day, zero-filled
  topPosts: { post: Post, views, likes, comments, shares }[],         // max 5, by views in range then likes
  followerCount, postCount                                            // current totals
}
```
`views` = unique viewers per post per day (a user re-watching on another day counts again). Likes/comments/new followers exclude your own actions.

### 9. Moderation & admin

- `User.isAdmin` (separate from `role`). CLI: `npm run make-admin -- <email>` (`-- --revoke <email>` to remove).
- `POST /me/verification-request` `{ message? (≤ 500) }` → `201 VerificationRequest` (`409` if already verified or a request is pending). `GET /me/verification-request` → `VerificationRequest | null` (latest).
- Admin endpoints (all `403 FORBIDDEN` for non-admins):

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/reports?status=open\|reviewed\|dismissed&cursor` | page of `Report` (default `open`, oldest first for `open`, newest first otherwise) |
| POST | `/admin/reports/:id/resolve` | `{ action?: 'none' \| 'remove_content' \| 'suspend_user', note? }` → `Report` (`status: 'reviewed'`). `remove_content` deletes the target (post/comment/community/message); `suspend_user` suspends the target's author (or the user) |
| POST | `/admin/reports/:id/dismiss` | `{ note? }` → `Report` (`status: 'dismissed'`) |
| DELETE | `/admin/posts/:id`, `/admin/comments/:id`, `/admin/communities/:id` | → `204` |
| POST | `/admin/users/:id/suspend` | `{ reason? }` → `204` (revokes refresh tokens, disconnects sockets). Admins cannot suspend themselves |
| DELETE | `/admin/users/:id/suspend` | → `204` |
| GET | `/admin/verification-requests?status=pending\|approved\|rejected&cursor` | page of `VerificationRequest` |
| POST | `/admin/verification-requests/:id/approve` / `.../reject` | → `VerificationRequest`; approve sets `verified: true` and sends a `verification` notification |

### 10. Community events

| Method | Path | Notes |
|---|---|---|
| POST | `/communities/:id/events` | members only `{ title (3..120), description? (≤ 2000), startsAt (ISO, future), endsAt? (> startsAt), location? (≤ 200), onlineUrl? (http/https URL) }` → `201 Event`. The creator is automatically RSVP'd `going`. Notifies all other members (`event` notification + push, respecting `notifications.events`) |
| GET | `/communities/:id/events?when=upcoming\|past&cursor` | page of `Event` (upcoming: soonest first, includes events in progress; past: most recent first) |
| GET | `/events/:id` | `Event` |
| PATCH | `/events/:id` | creator or community owner, same fields optional → `Event` |
| DELETE | `/events/:id` | creator or community owner → `204` |
| PUT | `/events/:id/rsvp` | `{ status: 'going' \| 'not_going' }` (members only) → `{ myRsvp, goingCount }` |
| DELETE | `/events/:id/rsvp` | → `{ myRsvp: null, goingCount }` |
| GET | `/me/events?rsvp=going&cursor` | upcoming events of my communities, soonest first; `rsvp=going` keeps only events I'm going to |

### Additional behaviour notes (v1.1)

- `Series.itemCount` counts only `ready` posts for non-owners (all items for the owner).
- Suspended users disappear for everyone else: their profile returns `404`, their posts are hidden, they receive no notifications.
- Deleting a post (by its author or an admin) closes its open reports with `status: 'reviewed'`, `resolution: 'content_removed'` (reports are kept as history).
- `verification` notifications cannot be disabled. Trending topics/hashtags and hashtag pages only count `ready` posts.
- The content filter also applies to poll options.

### Realtime additions (Socket.IO)

- `post:ready` `{ post: Post }` and `post:failed` `{ postId, reason }` (to the author).
- `notification:new` is also emitted for the new notification types.
- Suspended users are disconnected; reconnecting yields `connect_error` `ACCOUNT_SUSPENDED`.
