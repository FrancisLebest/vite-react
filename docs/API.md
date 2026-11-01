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
- `Media.thumbnailUrl` is the generated JPEG for videos, the image URL itself for images, `null` for audio. Videos are remuxed to MP4 (faststart) when possible, never transcoded.
- Blocks: if the target blocked the viewer, `GET /users/:id` and that user's posts return `404`; the blocker still sees the profile with `isBlocked: true` (and an empty post list) so they can unblock. Blocking removes follows in both directions.
- `POST /communities` defaults: `icon = 'people-outline'`, `color = '#6C5CE7'`, `description = ''`. Owner leaving → `403`.
- Unliking / unfollowing / leaving removes the corresponding notification; deleting a comment or post removes notifications attached to it.
- Ranked lists (`forYou`, `sort=popular`, search, directory `sort=popular`) use opaque offset cursors (max offset 10 000); chronological lists use keyset cursors.
- `GET /universities` is public (sign-up screen) and returns at most 50 names.
