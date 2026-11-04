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

export type FollowStatus = 'none' | 'requested' | 'following';

export interface UserSummary {
  id: ID;
  username: string;
  name: string;
  avatarUrl: string | null;
  university: string | null;
  role: Role;
  verified: boolean;
  isFollowing: boolean;
  /** v1.1 — viewer → this user. isFollowing === (followStatus === 'following') */
  followStatus?: FollowStatus;
  /** v1.1 */
  isPrivate?: boolean;
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
  /** v1.1 */
  isAdmin?: boolean;
  /** v1.1 — whether the viewer may open/continue a DM with this user */
  canMessage?: boolean;
  /** v1.1 — max 3, in pin order */
  pinnedPostIds?: string[];
}

export interface Me extends User {
  email: string;
  /** v1.1 */
  emailVerified?: boolean;
  /** v1.1 */
  interests?: CategoryId[];
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
export type PostStatus = 'processing' | 'ready' | 'failed';

export interface PollOption {
  id: ID;
  text: string;
  /** null until the viewer voted (the author always sees counts) */
  voteCount: number | null;
}

export interface Poll {
  id: ID;
  kind: 'poll' | 'quiz';
  question: string | null;
  options: PollOption[];
  totalVotes: number | null;
  myVoteOptionId: string | null;
  /** quiz only, after voting (author always) */
  correctOptionId: string | null;
  isCorrect: boolean | null;
}

export interface SeriesRef {
  id: ID;
  title: string;
  /** 1-based */
  position: number;
  total: number;
  prevPostId: string | null;
  nextPostId: string | null;
}

export interface PostSummary {
  id: ID;
  type: PostType;
  text: string;
  thumbnailUrl: string | null;
  author: UserSummary;
}

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
  /* ---- v1.1 (optional so v1 servers keep working) ---- */
  status?: PostStatus;
  editedAt?: ISODate | null;
  poll?: Poll | null;
  series?: SeriesRef | null;
  repostCount?: number;
  repostedByMe?: boolean;
  /** only on following-feed items that appear because someone you follow reposted */
  repostedBy?: UserSummary | null;
  isPinned?: boolean;
  pinnedCommentId?: string | null;
}

export interface Comment {
  id: ID;
  text: string;
  author: UserSummary;
  createdAt: ISODate;
  postId: ID;
  /* ---- v1.1 ---- */
  parentId?: string | null;
  replyCount?: number;
  likeCount?: number;
  likedByMe?: boolean;
  isPinned?: boolean;
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
  /** v1.1 — a shared post (null if none / not visible) */
  post?: PostSummary | null;
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
  | 'message'
  | 'reply'
  | 'comment_like'
  | 'follow_request'
  | 'follow_accepted'
  | 'repost'
  | 'event'
  | 'verification';

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
  /** v1.1 */
  comment?: {id: ID; text: string} | null;
  /** v1.1 */
  event?: {id: ID; title: string; startsAt: ISODate} | null;
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
  | 'ACCOUNT_SUSPENDED'
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

/* ------------------------------- v1.1 -------------------------------- */

export type DmPolicy = 'everyone' | 'followers' | 'nobody';

export interface NotificationPrefs {
  push: boolean;
  likes: boolean;
  comments: boolean;
  replies: boolean;
  follows: boolean;
  followRequests: boolean;
  mentions: boolean;
  messages: boolean;
  communityJoins: boolean;
  events: boolean;
}

export interface Settings {
  isPrivate: boolean;
  dmPolicy: DmPolicy;
  notifications: NotificationPrefs;
}

export type SettingsPatch = Partial<Omit<Settings, 'notifications'>> & {
  notifications?: Partial<NotificationPrefs>;
};

export interface Series {
  id: ID;
  title: string;
  description: string;
  coverUrl: string | null;
  category: CategoryId;
  author: UserSummary;
  itemCount: number;
  followerCount: number;
  isFollowing: boolean;
  isOwner: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type SeriesDetail = Series & {items: Post[]};

export type RsvpStatus = 'going' | 'not_going';

export interface CommunityEvent {
  id: ID;
  community: {id: ID; name: string};
  title: string;
  description: string;
  startsAt: ISODate;
  endsAt: ISODate | null;
  location: string | null;
  onlineUrl: string | null;
  creator: UserSummary;
  goingCount: number;
  myRsvp: RsvpStatus | null;
  canEdit: boolean;
  createdAt: ISODate;
}

export interface FollowRequest {
  user: UserSummary;
  createdAt: ISODate;
}

export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface Report {
  id: ID;
  targetType: ReportTarget;
  targetId: ID;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reporter: UserSummary | null;
  targetPreview: string | null;
  targetAuthor: UserSummary | null;
  resolution: 'none' | 'content_removed' | 'user_suspended' | null;
  note: string | null;
  resolvedBy: UserSummary | null;
  resolvedAt: ISODate | null;
  createdAt: ISODate;
}

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  id: ID;
  user: UserSummary;
  message: string | null;
  status: VerificationStatus;
  createdAt: ISODate;
  decidedAt: ISODate | null;
}

export interface HistoryEntry {
  viewedAt: ISODate;
  post: Post;
}

export type AnalyticsRange = '7d' | '28d' | '90d';

export interface AnalyticsTotals {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  newFollowers: number;
}

export interface Analytics {
  range: AnalyticsRange;
  from: string;
  to: string;
  totals: AnalyticsTotals;
  daily: (AnalyticsTotals & {date: string})[];
  topPosts: (Omit<AnalyticsTotals, 'newFollowers'> & {post: Post})[];
  followerCount: number;
  postCount: number;
}

export interface HashtagPage extends Page<Post> {
  tag: string;
  postCount: number;
}

export interface PollInput {
  question?: string;
  options: string[];
  /** 0-based → makes it a quiz */
  correctOptionIndex?: number;
}

export interface ServerToClientEvents {
  'message:new': (p: {message: Message}) => void;
  'conversation:read': (p: {conversationId: ID; userId: ID}) => void;
  'notification:new': (p: {notification: AppNotification}) => void;
  typing: (p: {conversationId: ID; user: UserSummary}) => void;
  'post:ready': (p: {post: Post}) => void;
  'post:failed': (p: {postId: ID; reason: string}) => void;
}

export interface ClientToServerEvents {
  typing: (p: {conversationId: ID}) => void;
}
