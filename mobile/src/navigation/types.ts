import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {CategoryId, SearchType} from '../api/types';

export type TabParamList = {
  Home: undefined;
  Discover: undefined;
  Create: undefined;
  Inbox: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  /* ---- signed out ---- */
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: {email?: string} | undefined;
  ResetPassword: {email: string};

  /* ---- signed in ---- */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Search:
    | {
        query?: string;
        category?: CategoryId;
        type?: SearchType;
        openFilters?: boolean;
      }
    | undefined;
  Posts: undefined;
  Users: undefined;
  Communities: undefined;
  CommunityDetail: {communityId: string};
  UserProfile: {userId: string};
  ContentDetail: {postId: string};
  Chat: {conversationId: string};
  Notifications: undefined;
  Comments: {postId: string};
  CreateVideo: {communityId?: string} | undefined;
  CreatePost: {communityId?: string} | undefined;
  CreateCommunity: {communityId?: string} | undefined;
  NewMessage: undefined;
  EditProfile: undefined;
  Settings: undefined;
  ChangePassword: undefined;
  BlockedUsers: undefined;
  FollowList: {userId: string; kind: 'followers' | 'following'; title?: string};

  /* ---- v1.1 ---- */
  Onboarding: {fromSettings?: boolean} | undefined;
  VerifyEmail: undefined;
  Hashtag: {tag: string};
  EditPost: {postId: string};
  SharePost: {postId: string};
  History: undefined;
  Saved: undefined;
  SeriesDetail: {seriesId: string};
  SeriesEditor: {seriesId?: string} | undefined;
  PrivacySettings: undefined;
  NotificationSettings: undefined;
  FollowRequests: undefined;
  Analytics: undefined;
  RequestVerification: undefined;
  Admin: undefined;
  ReportDetail: {reportId: string};
  CreateEvent: {communityId: string; eventId?: string};
  EventDetail: {eventId: string};
  MyEvents: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
