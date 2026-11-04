import type {RootStackParamList} from '../navigation/types';

/** FCM `data` payload (docs/API.md §2 — all values are strings). */
export interface PushData {
  type?: string;
  notificationId?: string;
  postId?: string;
  commentId?: string;
  conversationId?: string;
  communityId?: string;
  eventId?: string;
  actorId?: string;
}

type Route = {[K in keyof RootStackParamList]: [K, RootStackParamList[K]]}[keyof RootStackParamList];

/** Map a notification payload to the screen it should open. */
export function routeForPush(data: PushData | undefined | null): Route {
  const d = data ?? {};
  if (d.type === 'message' && d.conversationId) {
    return ['Chat', {conversationId: d.conversationId}];
  }
  if (d.type === 'follow_request') {
    return ['FollowRequests', undefined];
  }
  if (d.eventId) {
    return ['EventDetail', {eventId: d.eventId}];
  }
  if (d.postId) {
    return ['ContentDetail', {postId: d.postId}];
  }
  if (d.communityId) {
    return ['CommunityDetail', {communityId: d.communityId}];
  }
  if (d.actorId) {
    return ['UserProfile', {userId: d.actorId}];
  }
  return ['Notifications', undefined];
}
