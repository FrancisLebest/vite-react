/** React Query hooks for the v1.1 features (docs/API.md "v1.1 — Advanced features"). */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {api} from '../api';
import type {EventInput, SeriesInput} from '../api/endpoints';
import type {
  AnalyticsRange,
  CategoryId,
  Comment,
  CommunityEvent,
  Post,
  ReportStatus,
  RsvpStatus,
  Series,
  SeriesDetail,
  Settings,
  SettingsPatch,
  VerificationStatus,
} from '../api/types';
import {isPost, patchEntities, removeFromPages, restore, Snapshot} from './cache';
import {useCursorList} from './hooks';
import {qk} from './keys';

export const qk11 = {
  replies: (commentId: string) => ['replies', commentId] as const,
  series: (id: string) => ['series', id] as const,
  userSeries: (userId: string) => ['userSeries', userId] as const,
  followedSeries: () => ['followedSeries'] as const,
  hashtag: (tag: string, sort: string) => ['hashtag', tag.toLowerCase(), sort] as const,
  reposts: (userId: string) => ['reposts', userId] as const,
  pinned: (userId: string) => ['pinned', userId] as const,
  history: () => ['history'] as const,
  settings: () => ['settings'] as const,
  followRequests: () => ['followRequests'] as const,
  followRequestCount: () => ['unread', 'followRequests'] as const,
  analytics: (range: AnalyticsRange) => ['analytics', range] as const,
  adminReports: (status: ReportStatus) => ['admin', 'reports', status] as const,
  adminSuspended: () => ['admin', 'suspended'] as const,
  adminVerifications: (status: VerificationStatus) =>
    ['admin', 'verifications', status] as const,
  verificationRequest: () => ['verificationRequest'] as const,
  communityEvents: (id: string, when: string) => ['events', 'community', id, when] as const,
  event: (id: string) => ['event', id] as const,
  myEvents: (goingOnly: boolean) => ['events', 'mine', goingOnly] as const,
  mentions: (q: string) => ['mentions', q] as const,
};

const isComment = (id: string) => (o: Record<string, unknown>) =>
  o.id === id && 'postId' in o && 'author' in o;

/* ------------------------------- comments ------------------------------- */

export function useReplies(commentId: string, enabled: boolean) {
  return useCursorList<Comment>(
    qk11.replies(commentId),
    c => api.comments.replies(commentId, c),
    {enabled},
  );
}

export function useToggleCommentLike() {
  const qc = useQueryClient();
  return useMutation<{liked: boolean; likeCount: number}, unknown, Comment, Snapshot>({
    mutationFn: c => (c.likedByMe ? api.comments.unlike(c.id) : api.comments.like(c.id)),
    onMutate: c =>
      patchEntities(qc, isComment(c.id), o => ({
        ...o,
        likedByMe: !c.likedByMe,
        likeCount: Math.max(0, ((o.likeCount as number) ?? 0) + (c.likedByMe ? -1 : 1)),
      })),
    onError: (_e, _c, snap) => restore(qc, snap),
    onSuccess: (r, c) =>
      patchEntities(qc, isComment(c.id), o => ({...o, likedByMe: r.liked, likeCount: r.likeCount})),
  });
}

export function useTogglePinComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Comment) => {
      if (c.isPinned) {
        await api.comments.unpin(c.id);
      } else {
        await api.comments.pin(c.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(qk.comments(postId));
      qc.invalidateQueries(qk.post(postId));
    },
  });
}

/* --------------------------------- polls -------------------------------- */

export function useVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({postId, optionId}: {postId: string; optionId: string}) =>
      api.polls.vote(postId, optionId),
    onMutate: ({postId, optionId}) =>
      patchEntities(qc, isPost(postId), o => {
        const poll = o.poll as Post['poll'];
        return poll ? {...o, poll: {...poll, myVoteOptionId: optionId}} : o;
      }),
    onError: (_e, _v, snap) => restore(qc, snap),
    onSuccess: (poll, {postId}) => patchEntities(qc, isPost(postId), o => ({...o, poll})),
  });
}

/* ------------------------------ social posts ----------------------------- */

export function useToggleRepost() {
  const qc = useQueryClient();
  return useMutation<{reposted: boolean; repostCount: number}, unknown, Post, Snapshot>({
    mutationFn: p => (p.repostedByMe ? api.social.unrepost(p.id) : api.social.repost(p.id)),
    onMutate: p =>
      patchEntities(qc, isPost(p.id), o => ({
        ...o,
        repostedByMe: !p.repostedByMe,
        repostCount: Math.max(0, ((o.repostCount as number) ?? 0) + (p.repostedByMe ? -1 : 1)),
      })),
    onError: (_e, _p, snap) => restore(qc, snap),
    onSuccess: (r, p) =>
      patchEntities(qc, isPost(p.id), o => ({
        ...o,
        repostedByMe: r.reposted,
        repostCount: r.repostCount,
      })),
    onSettled: () => qc.invalidateQueries(['reposts']),
  });
}

export function useTogglePinPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Post) => (p.isPinned ? api.social.unpin(p.id) : api.social.pin(p.id)),
    onSuccess: (r, p) => {
      patchEntities(qc, isPost(p.id), o => ({...o, isPinned: r.isPinned}));
      qc.invalidateQueries(qk11.pinned(p.author.id));
      qc.invalidateQueries(qk.user(p.author.id));
    },
  });
}

export function useEditPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({id, text, category}: {id: string; text: string; category: CategoryId}) =>
      api.social.editPost(id, {text, category}),
    onSuccess: post => patchEntities(qc, isPost(post.id), () => post as never),
  });
}

export function usePinnedPosts(userId: string, enabled = true) {
  return useQuery({
    queryKey: qk11.pinned(userId),
    queryFn: () => api.social.pinned(userId),
    enabled,
  });
}

export function useReposts(userId: string, enabled = true) {
  return useCursorList<Post>(qk11.reposts(userId), c => api.social.reposts(userId, c), {enabled});
}

export function useHashtag(tag: string, sort: 'recent' | 'popular') {
  return useCursorList<Post>(qk11.hashtag(tag, sort), c => api.social.hashtag(tag, sort, c));
}

export function useHistory() {
  return useCursorList(qk11.history(), async c => {
    const page = await api.social.history(c);
    // list items need an id: one history entry per post
    return {...page, items: page.items.map(e => ({...e, id: e.post.id}))};
  });
}

/* --------------------------------- series ------------------------------- */

export function useSeries(id: string) {
  return useQuery({queryKey: qk11.series(id), queryFn: () => api.series.get(id)});
}

export function useUserSeries(userId: string, enabled = true) {
  return useCursorList<Series>(qk11.userSeries(userId), c => api.series.byUser(userId, c), {
    enabled,
  });
}

export function useSaveSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({id, input}: {id?: string; input: SeriesInput}) =>
      id ? api.series.update(id, input) : api.series.create(input),
    onSuccess: s => {
      qc.invalidateQueries(qk11.series(s.id));
      qc.invalidateQueries(['userSeries']);
    },
  });
}

export function useSeriesItems(seriesId: string) {
  const qc = useQueryClient();
  const set = (d: SeriesDetail) => {
    qc.setQueryData(qk11.series(seriesId), d);
    d.items.forEach(p => qc.invalidateQueries(qk.post(p.id)));
    qc.invalidateQueries(['userSeries']);
  };
  return {
    add: useMutation({
      mutationFn: (postId: string) => api.series.addItem(seriesId, postId),
      onSuccess: set,
    }),
    remove: useMutation({
      mutationFn: (postId: string) => api.series.removeItem(seriesId, postId),
      onSuccess: d => {
        set(d);
      },
    }),
    reorder: useMutation({
      mutationFn: (postIds: string[]) => api.series.reorder(seriesId, postIds),
      onMutate: postIds => {
        const prev = qc.getQueryData<SeriesDetail>(qk11.series(seriesId));
        if (prev) {
          const byId = new Map(prev.items.map(p => [p.id, p]));
          qc.setQueryData(qk11.series(seriesId), {
            ...prev,
            items: postIds.map(id => byId.get(id)!).filter(Boolean),
          });
        }
        return prev;
      },
      onError: (_e, _v, prev) => qc.setQueryData(qk11.series(seriesId), prev),
      onSuccess: set,
    }),
  };
}

export function useToggleFollowSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Series) => (s.isFollowing ? api.series.unfollow(s.id) : api.series.follow(s.id)),
    onMutate: s =>
      patchEntities(
        qc,
        o => o.id === s.id && 'itemCount' in o,
        o => ({
          ...o,
          isFollowing: !s.isFollowing,
          followerCount: Math.max(0, (o.followerCount as number) + (s.isFollowing ? -1 : 1)),
        }),
      ),
    onError: (_e, _s, snap) => restore(qc, snap),
    onSuccess: (r, s) =>
      patchEntities(
        qc,
        o => o.id === s.id && 'itemCount' in o,
        o => ({...o, ...r}),
      ),
  });
}

/* ------------------------------ privacy etc. ----------------------------- */

export function useSettings() {
  return useQuery({queryKey: qk11.settings(), queryFn: api.privacy.settings});
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<Settings, unknown, SettingsPatch, Settings | undefined>({
    mutationFn: patch => api.privacy.updateSettings(patch),
    onMutate: patch => {
      const prev = qc.getQueryData<Settings>(qk11.settings());
      if (prev) {
        qc.setQueryData<Settings>(qk11.settings(), {
          ...prev,
          ...patch,
          notifications: {...prev.notifications, ...(patch.notifications ?? {})},
        });
      }
      return prev;
    },
    onError: (_e, _p, prev) => qc.setQueryData(qk11.settings(), prev),
    onSuccess: s => {
      qc.setQueryData(qk11.settings(), s);
      qc.invalidateQueries(qk11.followRequests());
    },
  });
}

export function useFollowRequests() {
  return useCursorList(qk11.followRequests(), api.privacy.followRequests);
}

export function useFollowRequestCount(enabled = true) {
  return useQuery({
    queryKey: qk11.followRequestCount(),
    queryFn: api.privacy.followRequestCount,
    enabled,
  });
}

export function useAnswerFollowRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({userId, accept}: {userId: string; accept: boolean}) =>
      accept ? api.privacy.accept(userId) : api.privacy.decline(userId),
    onSuccess: (_r, {userId}) => {
      removeFromPages(qc, [qk11.followRequests()], userId);
      qc.setQueryData<{count: number}>(qk11.followRequestCount(), d => ({
        count: Math.max(0, (d?.count ?? 1) - 1),
      }));
      qc.invalidateQueries(['followers']);
    },
  });
}

export function useAnalytics(range: AnalyticsRange) {
  return useQuery({
    queryKey: qk11.analytics(range),
    queryFn: () => api.analytics.get(range),
    keepPreviousData: true,
  });
}

export function useMentionSuggestions(q: string | null) {
  return useQuery({
    queryKey: qk11.mentions(q ?? ''),
    queryFn: () => api.social.mentions(q ?? ''),
    enabled: q !== null,
    staleTime: 60_000,
    keepPreviousData: true,
  });
}

/* --------------------------------- events -------------------------------- */

export function useCommunityEvents(communityId: string, when: 'upcoming' | 'past', enabled = true) {
  return useCursorList<CommunityEvent>(
    qk11.communityEvents(communityId, when),
    c => api.events.list(communityId, when, c),
    {enabled},
  );
}

export function useEvent(id: string) {
  return useQuery({queryKey: qk11.event(id), queryFn: () => api.events.get(id)});
}

export function useMyEvents(goingOnly: boolean) {
  return useCursorList<CommunityEvent>(qk11.myEvents(goingOnly), c => api.events.mine(goingOnly, c));
}

const isEvent = (id: string) => (o: Record<string, unknown>) => o.id === id && 'startsAt' in o && 'goingCount' in o;

export function useRsvp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({event, status}: {event: CommunityEvent; status: RsvpStatus | null}) =>
      status ? api.events.rsvp(event.id, status) : api.events.clearRsvp(event.id),
    onMutate: ({event, status}) =>
      patchEntities(qc, isEvent(event.id), o => {
        const wasGoing = o.myRsvp === 'going';
        const going = status === 'going';
        return {
          ...o,
          myRsvp: status,
          goingCount: Math.max(0, (o.goingCount as number) + (going ? 1 : 0) - (wasGoing ? 1 : 0)),
        };
      }),
    onError: (_e, _v, snap) => restore(qc, snap),
    onSuccess: (r, {event}) => {
      patchEntities(qc, isEvent(event.id), o => ({...o, ...r}));
      qc.invalidateQueries(['events', 'mine']);
    },
  });
}

export function useSaveEvent(communityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({id, input}: {id?: string; input: EventInput}) =>
      id ? api.events.update(id, input) : api.events.create(communityId, input),
    onSuccess: e => {
      qc.setQueryData(qk11.event(e.id), e);
      qc.invalidateQueries(['events']);
    },
  });
}

/* --------------------------- processing pipeline -------------------------- */

/** `post:ready` replaces the processing post everywhere. */
export function applyPostReady(qc: ReturnType<typeof useQueryClient>, post: Post) {
  patchEntities(qc, isPost(post.id), () => post as never);
  qc.setQueryData(qk.post(post.id), post);
  qc.invalidateQueries(['userPosts', post.author.id]);
}

export function applyPostFailed(qc: ReturnType<typeof useQueryClient>, postId: string) {
  patchEntities(qc, isPost(postId), o => ({...o, status: 'failed'}));
}
