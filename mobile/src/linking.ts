import type {LinkingOptions} from '@react-navigation/native';
import type {RootStackParamList} from './navigation/types';

/**
 * Deep links:
 *   studyhub://post/<id>        https://studyhub.app/post/<id>
 *   studyhub://user/<id|name>   https://studyhub.app/user/<id|name>
 *   studyhub://community/<id>   https://studyhub.app/community/<id>
 *   studyhub://series/<id>      https://studyhub.app/series/<id>
 *   studyhub://hashtag/<tag>    https://studyhub.app/hashtag/<tag>
 * `studyhub.app` is a placeholder: replace it with your domain here, in
 * AndroidManifest.xml (autoVerify intent-filter) and in the iOS entitlements
 * (applinks:) — see README "Liens profonds".
 */
export const LINK_PREFIXES = ['studyhub://', 'https://studyhub.app', 'https://www.studyhub.app'];
export const WEB_BASE = 'https://studyhub.app';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: LINK_PREFIXES,
  config: {
    screens: {
      ContentDetail: 'post/:postId',
      UserProfile: 'user/:userId',
      CommunityDetail: 'community/:communityId',
      SeriesDetail: 'series/:seriesId',
      Hashtag: 'hashtag/:tag',
      Chat: 'chat/:conversationId',
      Tabs: {
        screens: {Home: 'home', Discover: 'discover', Inbox: 'inbox', Profile: 'profile'},
      },
    },
  },
};

/** Public share links (open the app through universal/app links). */
export const shareUrl = {
  post: (id: string) => `${WEB_BASE}/post/${id}`,
  user: (username: string) => `${WEB_BASE}/user/${username}`,
  community: (id: string) => `${WEB_BASE}/community/${id}`,
  series: (id: string) => `${WEB_BASE}/series/${id}`,
  hashtag: (tag: string) => `${WEB_BASE}/hashtag/${encodeURIComponent(tag)}`,
};
