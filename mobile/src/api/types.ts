/**
 * Types mirroring docs/API.md (StudyHub API contract v1).
 * Keep in sync with the contract — never add fields the server does not send.
 */

export type ID = string;
/** ISO 8601 date string */
export type ISODate = string;

export type Role = 'student' | 'professor' | 'creator';

export type CategoryId =
  | 'study-tips'
  | 'exams'
  | 'assignments'
  | 'math'
  | 'science'
  | 'programming'
  | 'business'
  | 'notes'
  | 'languages'
  | 'other';

export interface UserSummary {
  id: ID;
  username: string;
  name: string;
  avatarUrl: string | null;
  university: string | null;
  role: Role;
  verified: boolean;
  isFollowing: boolean;
}

export interface User extends UserSummary {
  bio: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  mutualCount: number;
  isMe: boolean;
  isBlocked: boolean;
  createdAt: ISODate;
}

export interface Me extends User {
  email: string;
}

export type MediaKind = 'video' | 'image' | 'audio';

export interface Media {
  kind: MediaKind;
  url: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export type PostType = 'video' | 'post';

export interface Post {
  id: ID;
  type: PostType;
  text: string;
  hashtags: string[];
  category: CategoryId;
  media: Media | null;
  author: UserSummary;
  community: {id: ID; name: string} | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  bookmarkCount: number;
  viewCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  createdAt: ISODate;
}

export interface Comment {
  id: ID;
  text: string;
  author: UserSummary;
  createdAt: ISODate;
  postId: ID;
}

export type CommunityKind = 'university' | 'faculty' | 'topic';

export interface Community {
  id: ID;
  name: string;
  description: string;
  kind: CommunityKind;
  /** Ionicons name */
  icon: string;
  /** #hex */
  color: string;
  avatarUrl: string | null;
  memberCount: number;
  postCount: number;
  isMember: boolean;
  isOwner: boolean;
  createdAt: ISODate;
}

export interface Message {
  id: ID;
  conversationId: ID;
  sender: UserSummary;
  text: string;
  media: Media | null;
  createdAt: ISODate;
}

export interface Conversation {
  id: ID;
  isGroup: boolean;
  /** group title, or other user's name for DMs */
  title: string;
  avatarUrl: string | null;
  participants: UserSummary[];
  lastMessage: Message | null;
  unreadCount: number;
  muted: boolean;
  updatedAt: ISODate;
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'community_join'
  | 'message';

export interface AppNotification {
  id: ID;
  type: NotificationType;
  actor: UserSummary;
  post: {id: ID; type: PostType; thumbnailUrl: string | null} | null;
  community: {id: ID; name: string} | null;
  /** e.g. "liked your video" */
  text: string;
  read: boolean;
  createdAt: ISODate;
}

export interface Category {
  id: CategoryId;
  label: string;
  /** Ionicons */
  icon: string;
}

export type TrendingTopic = Category & {postCount: number};
export interface TrendingHashtag {
  tag: string;
  postCount: number;
}

/** Cursor pagination envelope. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AuthResponse {
  user: Me;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ErrorBody {
  error: {code: ErrorCode; message: string; details?: unknown};
}

/* ---------------------------- Query params ---------------------------- */

export type FeedTab = 'forYou' | 'following';
export type FeedSort = 'latest' | 'popular';

export interface FeedParams {
  tab: FeedTab;
  type?: PostType;
  sort?: FeedSort;
  category?: CategoryId;
}

export interface UsersParams {
  q?: string;
  role?: Role;
  university?: string;
  sort?: 'popular' | 'recent';
}

export interface CommunitiesParams {
  q?: string;
  kind?: CommunityKind;
  mine?: boolean;
  sort?: 'popular' | 'recent';
}

export type SearchType = 'all' | 'posts' | 'users' | 'communities';
export type SearchSort = 'relevant' | 'recent' | 'popular';

export interface SearchParams {
  q: string;
  type: SearchType;
  category?: CategoryId;
  university?: string;
  sort?: SearchSort;
}

export interface SearchAllResult {
  posts: Post[];
  users: UserSummary[];
  communities: Community[];
  total: number;
}

export type SearchPage<T> = Page<T> & {total: number};

export type ReportTarget =
  | 'post'
  | 'comment'
  | 'user'
  | 'community'
  | 'message';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

/** Local file to upload (from the image picker / camera). */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/* ------------------------------ Realtime ------------------------------ */

export interface ServerToClientEvents {
  'message:new': (p: {message: Message}) => void;
  'conversation:read': (p: {conversationId: ID; userId: ID}) => void;
  'notification:new': (p: {notification: AppNotification}) => void;
  typing: (p: {conversationId: ID; user: UserSummary}) => void;
}

export interface ClientToServerEvents {
  typing: (p: {conversationId: ID}) => void;
}
