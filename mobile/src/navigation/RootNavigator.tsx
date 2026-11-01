import React from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {
  BottomTabBarButtonProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import {useNavigation} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthContext';
import {useSheet} from '../components/Sheet';
import {ErrorState, Icon, LoadingState, Logo} from '../components/ui';
import {useUnreadCounts} from '../query/messaging';
import {SocketProvider} from '../realtime/SocketProvider';
import {colors, font, spacing, weight} from '../theme';
import type {RootStackParamList, TabParamList} from './types';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';

import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import InboxScreen from '../screens/InboxScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SearchScreen from '../screens/SearchScreen';
import PostsScreen from '../screens/PostsScreen';
import UsersScreen from '../screens/UsersScreen';
import CommunitiesScreen from '../screens/CommunitiesScreen';
import CommunityDetailScreen from '../screens/CommunityDetailScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import ContentDetailScreen from '../screens/ContentDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import CommentsScreen from '../screens/CommentsScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
import CreateVideoScreen from '../screens/CreateVideoScreen';
import CreateCommunityScreen from '../screens/CreateCommunityScreen';
import NewMessageScreen from '../screens/NewMessageScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import FollowListScreen from '../screens/FollowListScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const EmptyScreen = () => null;

const TAB_ICONS: Record<keyof TabParamList, [string, string]> = {
  Home: ['home', 'home-outline'],
  Discover: ['compass', 'compass-outline'],
  Create: ['add', 'add'],
  Inbox: ['mail', 'mail-outline'],
  Profile: ['person', 'person-outline'],
};

type IconRenderer = (p: {
  focused: boolean;
  color: string;
  size: number;
}) => React.ReactNode;

function renderTabIcon(name: keyof TabParamList): IconRenderer {
  const [active, inactive] = TAB_ICONS[name];
  return ({focused, color, size}) => (
    <Icon name={focused ? active : inactive} size={size} color={color} />
  );
}

/** "+" tab: opens a chooser (Video / Post) instead of a screen. */
function CreateTabButton(props: BottomTabBarButtonProps) {
  const openSheet = useSheet();
  const navigation = useNavigation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create"
      style={props.style}
      onPress={() =>
        openSheet({
          title: 'Create',
          options: [
            {
              label: 'Video',
              icon: 'videocam-outline',
              onPress: () => navigation.navigate('CreateVideo'),
            },
            {
              label: 'Post',
              icon: 'create-outline',
              onPress: () => navigation.navigate('CreatePost'),
            },
            {
              label: 'Community',
              icon: 'people-outline',
              onPress: () => navigation.navigate('CreateCommunity'),
            },
          ],
        })
      }>
      <View style={styles.createButton}>
        <Icon name="add" size={28} color={colors.white} />
      </View>
    </Pressable>
  );
}

function Tabs() {
  const unread = useUnreadCounts();
  const insets = useSafeAreaInsets();
  const inboxBadge = unread.conversations + unread.notifications;
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 58 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ],
        tabBarIcon: renderTabIcon(route.name),
      })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen
        name="Create"
        component={EmptyScreen}
        options={{
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: 'Create',
          tabBarButton: CreateTabButton,
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          tabBarBadge: inboxBadge
            ? inboxBadge > 99
              ? '99+'
              : inboxBadge
            : undefined,
          tabBarBadgeStyle: styles.tabBadge,
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const modalOptions = {
  presentation: Platform.OS === 'ios' ? ('modal' as const) : ('card' as const),
  animation:
    Platform.OS === 'ios'
      ? ('default' as const)
      : ('slide_from_bottom' as const),
};

function SplashScreen({
  error,
  onRetry,
}: {
  error?: string | null;
  onRetry: () => void;
}) {
  return (
    <View style={styles.splash}>
      <Logo size={64} />
      <Text style={styles.brand}>StudyHub</Text>
      {error ? (
        <ErrorState
          title="Can't reach StudyHub"
          message={error}
          onRetry={onRetry}
        />
      ) : (
        <LoadingState
          label="Restoring your session"
          style={styles.splashLoader}
        />
      )}
    </View>
  );
}

export default function RootNavigator() {
  const {status, me, bootError, retryBoot} = useAuth();

  if (status === 'booting') {
    return <SplashScreen error={bootError} onRetry={retryBoot} />;
  }

  if (status === 'signedOut' || !me) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: {backgroundColor: colors.background},
          animation: 'default',
        }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <SocketProvider meId={me.id}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: {backgroundColor: colors.background},
          // 'default' keeps the platform native push animation (iOS 12 / Android 7 safe)
          animation: 'default',
        }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Posts" component={PostsScreen} />
        <Stack.Screen name="Users" component={UsersScreen} />
        <Stack.Screen name="Communities" component={CommunitiesScreen} />
        <Stack.Screen
          name="CommunityDetail"
          component={CommunityDetailScreen}
        />
        <Stack.Screen name="UserProfile" component={UserProfileScreen} />
        <Stack.Screen name="ContentDetail" component={ContentDetailScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
        <Stack.Screen name="FollowList" component={FollowListScreen} />
        <Stack.Group screenOptions={modalOptions}>
          <Stack.Screen name="Comments" component={CommentsScreen} />
          <Stack.Screen name="CreatePost" component={CreatePostScreen} />
          <Stack.Screen
            name="CreateVideo"
            component={CreateVideoScreen}
            options={{gestureEnabled: false}}
          />
          <Stack.Screen
            name="CreateCommunity"
            component={CreateCommunityScreen}
          />
          <Stack.Screen name="NewMessage" component={NewMessageScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        </Stack.Group>
      </Stack.Navigator>
    </SocketProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    paddingTop: 6,
  },
  tabLabel: {fontSize: font.xs, fontWeight: '500'},
  tabBadge: {backgroundColor: colors.danger, fontSize: 10},
  createButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: {width: 0, height: 4},
      },
      default: {elevation: 4},
    }),
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  brand: {
    fontSize: font.title,
    fontWeight: weight.bold,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  splashLoader: {flexGrow: 0, marginTop: spacing.xl},
});
