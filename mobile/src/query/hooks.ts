import {useCallback, useMemo, useState} from 'react';
import {Share} from 'react-native';
import {
  QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {api} from '../api';
import type {
  Category,
  CommunitiesParams,
  Community,
  FeedParams,
  Page,
  Post,
  PostType,
  UserSummary,
  UsersParams,
} from '../api/types';
import {STATIC_CATEGORIES} from '../constants/categories';
import {
  isCommunity,
  isPost,
  isUser,
  patchEntities,
  removeFromPages,
  restore,
  Snapshot,
} from './cache';
import {qk} from './keys';

/* ------------------------------------------------------------------ */
/* Generic cursor list                                                 */
/* ------------------------------------------------------------------ */

export function useCursorList<T extends {id: string}>(
  key: QueryKey,
  fetchPage: (cursor?: string) => Promise<Page<T>>,
  opts: {enabled?: boolean; staleTime?: number} = {},
) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({pageParam}) => fetchPage(pageParam as string | undefined),
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled: opts.enabled,
    staleTime: opts.staleTime,
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    q.data?.pages.forEach(p =>
      p.items.forEach(i => {
        if (!seen.has(i.id)) {
          seen.add(i.id);
          out.push(i);
        }
      }),
    );
    return out;
  }, [q.data]);
  const [refreshing, setRefreshing] = useState(false);
  const {refetch, hasNextPage, isFetchingNextPage, fetchNextPage} = q;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return {...q, items, refreshing, refresh, loadMore};
}

/** Pull-to-refresh state for a plain query. */
export function useManualRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return {refreshing, refresh};
}

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

export function useCategories() {
  const q = useQuery({
    queryKey: qk.categories(),
    queryFn: api.posts.categories,
    staleTime: 60 * 60_000,
  });
  // Static fallback (same ids/icons as the server) so chips render offline.
  const categories: Category[] = q.data?.length ? q.data : STATIC_CATEGORIES;
  return {...q, categories};
}

export function useTrendingTopics() {
  return useQuery({
    queryKey: qk.trendingTopics(),
    queryFn: api.posts.trendingTopics,
  });
}

export function useTrendingHashtags() {
  return useQuery({
    queryKey: qk.trendingHashtags(),
    queryFn: () => api.posts.trendingHashtags(10),
  });
}

export function useUniversities(q: string) {
  return useQuery({
    queryKey: qk.universities(q.trim().toLowerCase()),
    queryFn: () => api.users.universities(q.trim() || undefined),
    staleTime: 5 * 60_000,
    keepPreviousData: true,
  });
}

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

export function useFeed(p: FeedParams, enabled = true) {
  return useCursorList<Post>(qk.feed(p), cursor => api.posts.feed(p, cursor), {
    enabled,
  });
}

export function usePost(id: string) {
  return useQuery({queryKey: qk.post(id), queryFn: () => api.posts.get(id)});
}

export function useUserPosts(userId: string, type?: PostType) {
  return useCursorList<Post>(qk.userPosts(userId, type), cursor =>
    api.users.posts(userId, type, cursor),
  );
}

export function useBookmarks(enabled = true) {
  return useCursorList<Post>(qk.bookmarks(), api.posts.bookmarks, {enabled});
}

export function useComments(postId: string) {
  return useCursorList(qk.comments(postId), cursor =>
    api.posts.comments(postId, cursor),
  );
}

type PostLike = Pick<Post, 'id' | 'likedByMe'>;

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation<
    {liked: boolean; likeCount: number},
    unknown,
    PostLike,
    Snapshot
  >({
    mutationFn: p =>
      p.likedByMe ? api.posts.unlike(p.id) : api.posts.like(p.id),
    onMutate: p =>
      patchEntities(qc, isPost(p.id), o => ({
        ...o,
        likedByMe: !p.likedByMe,
        likeCount: Math.max(
          0,
          (o.likeCount as number) + (p.likedByMe ? -1 : 1),
        ),
      })),
    onError: (_e, _p, snap) => restore(qc, snap),
    onSuccess: (res, p) => {
      patchEntities(qc, isPost(p.id), o => ({
        ...o,
        likedByMe: res.liked,
        likeCount: res.likeCount,
      }));
    },
  });
}

export function useToggleBookmark() {
  const qc = useQueryClient();
  return useMutation<
    {bookmarked: boolean; bookmarkCount: number},
    unknown,
    Pick<Post, 'id' | 'bookmarkedByMe'>,
    Snapshot
  >({
    mutationFn: p =>
      p.bookmarkedByMe ? api.posts.unbookmark(p.id) : api.posts.bookmark(p.id),
    onMutate: p =>
      patchEntities(qc, isPost(p.id), o => ({
        ...o,
        bookmarkedByMe: !p.bookmarkedByMe,
        bookmarkCount: Math.max(
          0,
          (o.bookmarkCount as number) + (p.bookmarkedByMe ? -1 : 1),
        ),
      })),
    onError: (_e, _p, snap) => restore(qc, snap),
    onSuccess: (res, p) => {
      patchEntities(qc, isPost(p.id), o => ({
        ...o,
        bookmarkedByMe: res.bookmarked,
        bookmarkCount: res.bookmarkCount,
      }));
    },
    onSettled: () => qc.invalidateQueries(qk.bookmarks()),
  });
}

/** Native share sheet, then count the share server-side. */
export function useSharePost() {
  const qc = useQueryClient();
  return useCallback(
    async (post: Post) => {
      const what = post.type === 'video' ? 'video' : 'post';
      const body = post.text ? `"${post.text.slice(0, 140)}"` : '';
      try {
        const res = await Share.share({
          message:
            `Check out this ${what} by @${post.author.username} on StudyHub ${body}`.trim(),
        });
        if (res.action === Share.dismissedAction) {
          return;
        }
        const {shareCount} = await api.posts.share(post.id);
        patchEntities(qc, isPost(post.id), o => ({...o, shareCount}));
      } catch {
        // Share sheet cancelled or offline: nothing to do.
      }
    },
    [qc],
  );
}

const viewed = new Set<string>();
/** Register a view once per app session (server dedupes per user anyway). */
export function registerView(postId: string) {
  if (viewed.has(postId)) {
    return;
  }
  viewed.add(postId);
  api.posts.view(postId).catch(() => viewed.delete(postId));
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.posts.remove(id),
    onSuccess: (_r, id) => {
      removeFromPages(qc, null, id);
      qc.removeQueries(qk.post(id));
    },
  });
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export function useUser(idOrUsername: string, placeholder?: UserSummary) {
  return useQuery({
    queryKey: qk.user(idOrUsername),
    queryFn: () => api.users.get(idOrUsername),
    placeholderData: placeholder as never,
  });
}

export function useUsers(p: UsersParams) {
  return useCursorList(qk.users(p), cursor => api.users.list(p, cursor));
}

export function useSuggestedUsers() {
  return useQuery({
    queryKey: qk.suggested(),
    queryFn: () => api.users.suggested(10),
  });
}

export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation<
    {isFollowing: boolean; followerCount: number},
    unknown,
    Pick<UserSummary, 'id' | 'isFollowing'>,
    Snapshot
  >({
    mutationFn: u =>
      u.isFollowing ? api.users.unfollow(u.id) : api.users.follow(u.id),
    onMutate: u =>
      patchEntities(qc, isUser(u.id), o => {
        const next: Record<string, unknown> = {
          ...o,
          isFollowing: !u.isFollowing,
        };
        if (typeof o.followerCount === 'number') {
          next.followerCount = Math.max(
            0,
            o.followerCount + (u.isFollowing ? -1 : 1),
          );
        }
        return next;
      }),
    onError: (_e, _u, snap) => restore(qc, snap),
    onSuccess: (res, u) => {
      patchEntities(qc, isUser(u.id), o =>
        typeof o.followerCount === 'number'
          ? {
              ...o,
              isFollowing: res.isFollowing,
              followerCount: res.followerCount,
            }
          : {...o, isFollowing: res.isFollowing},
      );
    },
    onSettled: () => {
      qc.invalidateQueries(['following']);
      qc.invalidateQueries(['feed', {tab: 'following'}]);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Communities                                                         */
/* ------------------------------------------------------------------ */

export function useCommunities(p: CommunitiesParams) {
  return useCursorList<Community>(qk.communities(p), cursor =>
    api.communities.list(p, cursor),
  );
}

export function useCommunity(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.community(id),
    queryFn: () => api.communities.get(id),
    enabled,
  });
}

export function useToggleJoin() {
  const qc = useQueryClient();
  return useMutation<
    {isMember: boolean; memberCount: number},
    unknown,
    Pick<Community, 'id' | 'isMember'>,
    Snapshot
  >({
    mutationFn: c =>
      c.isMember ? api.communities.leave(c.id) : api.communities.join(c.id),
    onMutate: c =>
      patchEntities(qc, isCommunity(c.id), o => ({
        ...o,
        isMember: !c.isMember,
        memberCount: Math.max(
          0,
          (o.memberCount as number) + (c.isMember ? -1 : 1),
        ),
      })),
    onError: (_e, _c, snap) => restore(qc, snap),
    onSuccess: (res, c) => {
      patchEntities(qc, isCommunity(c.id), o => ({
        ...o,
        isMember: res.isMember,
        memberCount: res.memberCount,
      }));
    },
    onSettled: (_r, _e, c) => {
      qc.invalidateQueries(['communities', {mine: true}]);
      qc.invalidateQueries(qk.communityMembers(c.id));
    },
  });
}
