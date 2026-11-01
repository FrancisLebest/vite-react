import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {CategoryId} from '../data/types';

export type TabParamList = {
  Home: undefined;
  Discover: undefined;
  Create: undefined;
  Inbox: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Search: {query?: string; category?: CategoryId} | undefined;
  Posts: undefined;
  Users: undefined;
  Communities: undefined;
  CommunityDetail: {communityId: string};
  UserProfile: {userId: string};
  ContentDetail: {contentId: string};
  Chat: {conversationId: string};
  Notifications: undefined;
  Comments: {targetId: string; baseCount?: number};
  CreatePost: undefined;
  CreateCommunity: undefined;
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
