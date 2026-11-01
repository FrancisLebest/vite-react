import type {
  CommunitiesParams,
  FeedParams,
  PostType,
  SearchParams,
  UsersParams,
} from '../api/types';

/** Central query-key factory (all server data lives in React Query). */
export const qk = {
  feed: (p: FeedParams) => ['feed', p] as const,
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['comments', postId] as const,
  bookmarks: () => ['bookmarks'] as const,
  categories: () => ['categories'] as const,
  trendingTopics: () => ['trending', 'topics'] as const,
  trendingHashtags: () => ['trending', 'hashtags'] as const,

  user: (idOrUsername: string) => ['user', idOrUsername] as const,
  users: (p: UsersParams) => ['users', p] as const,
  userPosts: (id: string, type?: PostType) => ['userPosts', id, type ?? 'all'] as const,
  followers: (id: string) => ['followers', id] as const,
  following: (id: string) => ['following', id] as const,
  suggested: () => ['suggested'] as const,
  blocked: () => ['blocked'] as const,
  universities: (q: string) => ['universities', q] as const,

  communities: (p: CommunitiesParams) => ['communities', p] as const,
  community: (id: string) => ['community', id] as const,
  communityPosts: (id: string) => ['communityPosts', id] as const,
  communityMembers: (id: string) => ['communityMembers', id] as const,

  search: (p: SearchParams) => ['search', p] as const,

  conversations: () => ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
  unreadConversations: () => ['unread', 'conversations'] as const,
  notifications: () => ['notifications'] as const,
  unreadNotifications: () => ['unread', 'notifications'] as const,
};
