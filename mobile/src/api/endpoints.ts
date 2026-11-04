import type {ApiClient, UploadOptions} from './client';
import type {
  AppNotification,
  AuthResponse,
  Category,
  CategoryId,
  Comment,
  CommunitiesParams,
  Community,
  CommunityKind,
  Conversation,
  FeedParams,
  Me,
  Message,
  Page,
  Post,
  PostType,
  ReportReason,
  ReportTarget,
  Role,
  SearchAllResult,
  SearchPage,
  SearchParams,
  TokenPair,
  TrendingHashtag,
  TrendingTopic,
  UploadFile,
  User,
  UserSummary,
  UsersParams,
  Analytics,
  AnalyticsRange,
  CommunityEvent,
  FollowRequest,
  FollowStatus,
  HashtagPage,
  HistoryEntry,
  Poll,
  PollInput,
  Report,
  ReportStatus,
  RsvpStatus,
  Series,
  SeriesDetail,
  Settings,
  SettingsPatch,
  VerificationRequest,
  VerificationStatus,
} from './types';

export type FollowResult = {
  isFollowing: boolean;
  followStatus?: FollowStatus;
  followerCount: number;
};

const enc = encodeURIComponent;

export interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
  university?: string;
  role?: Role;
}

export interface CreatePostInput {
  type: PostType;
  text: string;
  category: CategoryId;
  communityId?: string;
  media?: UploadFile;
  /** v1.1 — only for type=post */
  poll?: PollInput;
}

export interface SeriesInput {
  title: string;
  description?: string;
  category: CategoryId;
  cover?: UploadFile;
}

export interface EventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  onlineUrl?: string | null;
}

export interface CommunityInput {
  name: string;
  description?: string;
  kind: CommunityKind;
  icon: string;
  color: string;
}

export type ProfileInput = Partial<
  Pick<Me, 'name' | 'username' | 'bio' | 'university' | 'role'>
>;

/** Endpoint functions, 1:1 with docs/API.md. */
export function createEndpoints(c: ApiClient) {
  return {
    auth: {
      register: (body: RegisterInput) =>
        c.request<AuthResponse>('POST', '/auth/register', {body, auth: false}),
      login: (identifier: string, password: string) =>
        c.request<AuthResponse>('POST', '/auth/login', {
          body: {identifier, password},
          auth: false,
        }),
      logout: (refreshToken: string) =>
        c.request<void>('POST', '/auth/logout', {
          body: {refreshToken},
          auth: false,
        }),
      me: () => c.get<Me>('/auth/me'),
      forgotPassword: (email: string) =>
        c.request<void>('POST', '/auth/forgot-password', {
          body: {email},
          auth: false,
        }),
      resetPassword: (email: string, code: string, newPassword: string) =>
        c.request<void>('POST', '/auth/reset-password', {
          body: {email, code, newPassword},
          auth: false,
        }),
      changePassword: (currentPassword: string, newPassword: string) =>
        c.post<void>('/auth/change-password', {currentPassword, newPassword}),
      refresh: (refreshToken: string) =>
        c.request<TokenPair>('POST', '/auth/refresh', {
          body: {refreshToken},
          auth: false,
        }),
    },

    users: {
      list: (p: UsersParams, cursor?: string) =>
        c.get<Page<User>>('/users', {...p, cursor}),
      suggested: (limit = 10) =>
        c.get<UserSummary[]>('/users/suggested', {limit}),
      get: (idOrUsername: string) => c.get<User>(`/users/${enc(idOrUsername)}`),
      updateMe: (body: ProfileInput) => c.patch<Me>('/users/me', body),
      uploadAvatar: (file: UploadFile, opts?: UploadOptions) => {
        const form = new FormData();
        form.append('avatar', file as unknown as Blob);
        return c.upload<Me>('POST', '/users/me/avatar', form, opts);
      },
      deleteMe: () => c.delete<void>('/users/me'),
      follow: (id: string) =>
        c.post<FollowResult>(`/users/${enc(id)}/follow`),
      unfollow: (id: string) =>
        c.delete<FollowResult>(`/users/${enc(id)}/follow`),
      followers: (id: string, cursor?: string) =>
        c.get<Page<UserSummary>>(`/users/${enc(id)}/followers`, {cursor}),
      following: (id: string, cursor?: string) =>
        c.get<Page<UserSummary>>(`/users/${enc(id)}/following`, {cursor}),
      posts: (id: string, type: PostType | undefined, cursor?: string) =>
        c.get<Page<Post>>(`/users/${enc(id)}/posts`, {type, cursor}),
      block: (id: string) => c.post<void>(`/users/${enc(id)}/block`),
      unblock: (id: string) => c.delete<void>(`/users/${enc(id)}/block`),
      blocked: () => c.get<UserSummary[]>('/users/me/blocked'),
      universities: (q?: string) => c.get<string[]>('/universities', {q}),
    },

    posts: {
      feed: (p: FeedParams, cursor?: string) =>
        c.get<Page<Post>>('/feed', {...p, cursor}),
      create: (input: CreatePostInput, opts?: UploadOptions) => {
        const form = new FormData();
        form.append('type', input.type);
        form.append('text', input.text);
        form.append('category', input.category);
        if (input.communityId) {
          form.append('communityId', input.communityId);
        }
        if (input.media) {
          form.append('media', input.media as unknown as Blob);
        }
        if (input.poll) {
          // multipart → the poll is a JSON string (docs/API.md §4a)
          form.append('poll', JSON.stringify(input.poll));
        }
        return c.upload<Post>('POST', '/posts', form, opts);
      },
      get: (id: string) => c.get<Post>(`/posts/${enc(id)}`),
      remove: (id: string) => c.delete<void>(`/posts/${enc(id)}`),
      like: (id: string) =>
        c.post<{liked: boolean; likeCount: number}>(`/posts/${enc(id)}/like`),
      unlike: (id: string) =>
        c.delete<{liked: boolean; likeCount: number}>(`/posts/${enc(id)}/like`),
      bookmark: (id: string) =>
        c.post<{bookmarked: boolean; bookmarkCount: number}>(
          `/posts/${enc(id)}/bookmark`,
        ),
      unbookmark: (id: string) =>
        c.delete<{bookmarked: boolean; bookmarkCount: number}>(
          `/posts/${enc(id)}/bookmark`,
        ),
      share: (id: string) =>
        c.post<{shareCount: number}>(`/posts/${enc(id)}/share`),
      view: (id: string) => c.post<void>(`/posts/${enc(id)}/view`),
      comments: (id: string, cursor?: string) =>
        c.get<Page<Comment>>(`/posts/${enc(id)}/comments`, {cursor}),
      addComment: (id: string, text: string, parentId?: string) =>
        c.post<Comment>(`/posts/${enc(id)}/comments`, {text, parentId}),
      deleteComment: (commentId: string) =>
        c.delete<void>(`/comments/${enc(commentId)}`),
      bookmarks: (cursor?: string) =>
        c.get<Page<Post>>('/me/bookmarks', {cursor}),
      categories: () => c.get<Category[]>('/categories'),
      trendingTopics: () => c.get<TrendingTopic[]>('/trending/topics'),
      trendingHashtags: (limit = 10) =>
        c.get<TrendingHashtag[]>('/trending/hashtags', {limit}),
    },

    communities: {
      list: (p: CommunitiesParams, cursor?: string) =>
        c.get<Page<Community>>('/communities', {
          ...p,
          mine: p.mine ? true : undefined,
          cursor,
        }),
      create: (body: CommunityInput) => c.post<Community>('/communities', body),
      get: (id: string) => c.get<Community>(`/communities/${enc(id)}`),
      update: (id: string, body: Partial<CommunityInput>) =>
        c.patch<Community>(`/communities/${enc(id)}`, body),
      remove: (id: string) => c.delete<void>(`/communities/${enc(id)}`),
      join: (id: string) =>
        c.post<{isMember: boolean; memberCount: number}>(
          `/communities/${enc(id)}/join`,
        ),
      leave: (id: string) =>
        c.delete<{isMember: boolean; memberCount: number}>(
          `/communities/${enc(id)}/join`,
        ),
      posts: (id: string, cursor?: string) =>
        c.get<Page<Post>>(`/communities/${enc(id)}/posts`, {cursor}),
      members: (id: string, cursor?: string) =>
        c.get<Page<UserSummary>>(`/communities/${enc(id)}/members`, {cursor}),
    },

    search: {
      all: (p: Omit<SearchParams, 'type'>) =>
        c.get<SearchAllResult>('/search', {...p, type: 'all'}),
      posts: (p: Omit<SearchParams, 'type'>, cursor?: string) =>
        c.get<SearchPage<Post>>('/search', {...p, type: 'posts', cursor}),
      users: (p: Omit<SearchParams, 'type'>, cursor?: string) =>
        c.get<SearchPage<UserSummary>>('/search', {
          ...p,
          type: 'users',
          cursor,
        }),
      communities: (p: Omit<SearchParams, 'type'>, cursor?: string) =>
        c.get<SearchPage<Community>>('/search', {
          ...p,
          type: 'communities',
          cursor,
        }),
    },

    messaging: {
      list: (cursor?: string) =>
        c.get<Page<Conversation>>('/conversations', {cursor}),
      openDirect: (userId: string) =>
        c.post<Conversation>('/conversations', {userId}),
      createGroup: (title: string, memberIds: string[]) =>
        c.post<Conversation>('/conversations', {title, memberIds}),
      get: (id: string) => c.get<Conversation>(`/conversations/${enc(id)}`),
      update: (id: string, body: {muted?: boolean; title?: string}) =>
        c.patch<Conversation>(`/conversations/${enc(id)}`, body),
      messages: (id: string, cursor?: string) =>
        c.get<Page<Message>>(`/conversations/${enc(id)}/messages`, {cursor}),
      send: (id: string, text: string, postId?: string) =>
        c.post<Message>(`/conversations/${enc(id)}/messages`, {text, postId}),
      sendMedia: (
        id: string,
        text: string,
        media: UploadFile,
        opts?: UploadOptions,
      ) => {
        const form = new FormData();
        form.append('text', text);
        form.append('media', media as unknown as Blob);
        return c.upload<Message>(
          'POST',
          `/conversations/${enc(id)}/messages`,
          form,
          opts,
        );
      },
      markRead: (id: string) => c.post<void>(`/conversations/${enc(id)}/read`),
      unreadCount: () => c.get<{count: number}>('/conversations/unread-count'),
    },

    notifications: {
      list: (cursor?: string) =>
        c.get<Page<AppNotification>>('/notifications', {cursor}),
      unreadCount: () => c.get<{count: number}>('/notifications/unread-count'),
      readAll: () => c.post<void>('/notifications/read-all'),
    },

    reports: {
      create: (
        targetType: ReportTarget,
        targetId: string,
        reason: ReportReason,
        details?: string,
      ) => c.post<void>('/reports', {targetType, targetId, reason, details}),
    },
    /* ------------------------------- v1.1 ------------------------------- */

    push: {
      register: (token: string, platform: 'ios' | 'android') =>
        c.post<void>('/users/me/push-token', {token, platform}),
      unregister: (token: string) =>
        c.delete<void>('/users/me/push-token', {token}),
    },

    comments: {
      replies: (commentId: string, cursor?: string) =>
        c.get<Page<Comment>>(`/comments/${enc(commentId)}/replies`, {cursor}),
      like: (id: string) =>
        c.post<{liked: boolean; likeCount: number}>(`/comments/${enc(id)}/like`),
      unlike: (id: string) =>
        c.delete<{liked: boolean; likeCount: number}>(
          `/comments/${enc(id)}/like`,
        ),
      pin: (id: string) => c.post<Comment>(`/comments/${enc(id)}/pin`),
      unpin: (id: string) => c.delete<void>(`/comments/${enc(id)}/pin`),
    },

    polls: {
      vote: (postId: string, optionId: string) =>
        c.post<Poll>(`/posts/${enc(postId)}/poll/vote`, {optionId}),
    },

    series: {
      create: (input: SeriesInput, opts?: UploadOptions) =>
        seriesWrite(c, 'POST', '/series', input, opts),
      get: (id: string) => c.get<SeriesDetail>(`/series/${enc(id)}`),
      update: (id: string, input: Partial<SeriesInput>, opts?: UploadOptions) =>
        seriesWrite(c, 'PATCH', `/series/${enc(id)}`, input, opts),
      remove: (id: string) => c.delete<void>(`/series/${enc(id)}`),
      addItem: (id: string, postId: string, position?: number) =>
        c.post<SeriesDetail>(`/series/${enc(id)}/items`, {postId, position}),
      removeItem: (id: string, postId: string) =>
        c.delete<SeriesDetail>(`/series/${enc(id)}/items/${enc(postId)}`),
      reorder: (id: string, postIds: string[]) =>
        c.request<SeriesDetail>('PUT', `/series/${enc(id)}/items`, {
          body: {postIds},
        }),
      follow: (id: string) =>
        c.post<{isFollowing: boolean; followerCount: number}>(
          `/series/${enc(id)}/follow`,
        ),
      unfollow: (id: string) =>
        c.delete<{isFollowing: boolean; followerCount: number}>(
          `/series/${enc(id)}/follow`,
        ),
      byUser: (userId: string, cursor?: string) =>
        c.get<Page<Series>>(`/users/${enc(userId)}/series`, {cursor}),
      following: (cursor?: string) =>
        c.get<Page<Series>>('/me/series/following', {cursor}),
    },

    social: {
      hashtag: (tag: string, sort: 'recent' | 'popular', cursor?: string) =>
        c.get<HashtagPage>(
          `/hashtags/${enc(tag.replace(/^#/, '').toLowerCase())}`,
          {sort, cursor},
        ),
      repost: (id: string) =>
        c.post<{reposted: boolean; repostCount: number}>(
          `/posts/${enc(id)}/repost`,
        ),
      unrepost: (id: string) =>
        c.delete<{reposted: boolean; repostCount: number}>(
          `/posts/${enc(id)}/repost`,
        ),
      reposts: (userId: string, cursor?: string) =>
        c.get<Page<Post>>(`/users/${enc(userId)}/reposts`, {cursor}),
      editPost: (id: string, body: {text?: string; category?: CategoryId}) =>
        c.patch<Post>(`/posts/${enc(id)}`, body),
      pin: (id: string) =>
        c.post<{isPinned: boolean; pinnedPostIds: string[]}>(
          `/posts/${enc(id)}/pin`,
        ),
      unpin: (id: string) =>
        c.delete<{isPinned: boolean; pinnedPostIds: string[]}>(
          `/posts/${enc(id)}/pin`,
        ),
      pinned: (userId: string) => c.get<Post[]>(`/users/${enc(userId)}/pinned`),
      history: (cursor?: string) =>
        c.get<Page<HistoryEntry>>('/me/history', {cursor}),
      clearHistory: () => c.delete<void>('/me/history'),
      removeHistory: (postId: string) =>
        c.delete<void>(`/me/history/${enc(postId)}`),
      mentions: (q: string, limit = 8) =>
        c.get<UserSummary[]>('/users/mentions', {q, limit}),
    },

    privacy: {
      setInterests: (categories: CategoryId[]) =>
        c.request<Me>('PUT', '/users/me/interests', {body: {categories}}),
      settings: () => c.get<Settings>('/users/me/settings'),
      updateSettings: (patch: SettingsPatch) =>
        c.request<Settings>('PUT', '/users/me/settings', {body: patch}),
      followRequests: (cursor?: string) =>
        c
          .get<Page<FollowRequest>>('/me/follow-requests', {cursor})
          .then(p => ({
            ...p,
            // FollowRequest has no id: key list items by the requester id
            items: p.items.map(r => ({...r, id: r.user.id})),
          })),
      followRequestCount: () =>
        c.get<{count: number}>('/me/follow-requests/count'),
      accept: (userId: string) =>
        c.post<void>(`/me/follow-requests/${enc(userId)}/accept`),
      decline: (userId: string) =>
        c.post<void>(`/me/follow-requests/${enc(userId)}/decline`),
      removeFollower: (userId: string) =>
        c.delete<void>(`/users/${enc(userId)}/follower`),
    },

    verification: {
      verifyEmail: (code: string) => c.post<Me>('/auth/verify-email', {code}),
      resendEmail: () => c.post<void>('/auth/resend-verification'),
      request: (message?: string) =>
        c.post<VerificationRequest>('/me/verification-request', {message}),
      latest: () =>
        c.get<VerificationRequest | null>('/me/verification-request'),
    },

    analytics: {
      get: (range: AnalyticsRange) =>
        c.get<Analytics>('/me/analytics', {range}),
    },

    admin: {
      reports: (status: ReportStatus, cursor?: string) =>
        c.get<Page<Report>>('/admin/reports', {status, cursor}),
      resolve: (
        id: string,
        action: 'none' | 'remove_content' | 'suspend_user',
        note?: string,
      ) => c.post<Report>(`/admin/reports/${enc(id)}/resolve`, {action, note}),
      dismiss: (id: string, note?: string) =>
        c.post<Report>(`/admin/reports/${enc(id)}/dismiss`, {note}),
      suspend: (userId: string, reason?: string) =>
        c.post<void>(`/admin/users/${enc(userId)}/suspend`, {reason}),
      unsuspend: (userId: string) =>
        c.delete<void>(`/admin/users/${enc(userId)}/suspend`),
      /** Requested by mobile (v1.1) — see docs/API.md */
      suspendedUsers: (cursor?: string) =>
        c.get<Page<SuspendedUser>>('/admin/users/suspended', {cursor}),
      verificationRequests: (status: VerificationStatus, cursor?: string) =>
        c.get<Page<VerificationRequest>>('/admin/verification-requests', {
          status,
          cursor,
        }),
      approve: (id: string) =>
        c.post<VerificationRequest>(
          `/admin/verification-requests/${enc(id)}/approve`,
        ),
      reject: (id: string) =>
        c.post<VerificationRequest>(
          `/admin/verification-requests/${enc(id)}/reject`,
        ),
    },

    events: {
      create: (communityId: string, body: EventInput) =>
        c.post<CommunityEvent>(`/communities/${enc(communityId)}/events`, body),
      list: (communityId: string, when: 'upcoming' | 'past', cursor?: string) =>
        c.get<Page<CommunityEvent>>(`/communities/${enc(communityId)}/events`, {
          when,
          cursor,
        }),
      get: (id: string) => c.get<CommunityEvent>(`/events/${enc(id)}`),
      update: (id: string, body: Partial<EventInput>) =>
        c.patch<CommunityEvent>(`/events/${enc(id)}`, body),
      remove: (id: string) => c.delete<void>(`/events/${enc(id)}`),
      rsvp: (id: string, status: RsvpStatus) =>
        c.request<RsvpResult>('PUT', `/events/${enc(id)}/rsvp`, {
          body: {status},
        }),
      clearRsvp: (id: string) =>
        c.delete<RsvpResult>(`/events/${enc(id)}/rsvp`),
      mine: (goingOnly: boolean, cursor?: string) =>
        c.get<Page<CommunityEvent>>('/me/events', {
          rsvp: goingOnly ? 'going' : undefined,
          cursor,
        }),
    },
  };
}

export type RsvpResult = {myRsvp: RsvpStatus | null; goingCount: number};

export type SuspendedUser = UserSummary & {
  suspendedAt?: string;
  suspendedReason?: string | null;
};

function seriesWrite(
  c: ApiClient,
  method: 'POST' | 'PATCH',
  path: string,
  input: Partial<SeriesInput>,
  opts?: UploadOptions,
): Promise<Series> {
  const {cover, ...fields} = input;
  if (!cover) {
    return c.request<Series>(method, path, {body: fields});
  }
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined) {
      form.append(k, String(v));
    }
  });
  form.append('cover', cover as unknown as Blob);
  return c.upload<Series>(method, path, form, opts);
}

export type Endpoints = ReturnType<typeof createEndpoints>;
