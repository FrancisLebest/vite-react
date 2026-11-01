import React from 'react';
import {Platform, Pressable, StyleSheet, View} from 'react-native';
import {
  BottomTabBarButtonProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon} from '../components/ui';
import {useApp} from '../context/AppContext';
import {colors, font} from '../theme';
import type {RootStackParamList, TabParamList} from './types';

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
import CreateCommunityScreen from '../screens/CreateCommunityScreen';

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

function CreateTabButton(props: BottomTabBarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create post"
      style={props.style}
      onPress={props.onPress}>
      <View style={styles.createButton}>
        <Icon name="add" size={28} color={colors.white} />
      </View>
    </Pressable>
  );
}

function Tabs() {
  const {unreadMessages} = useApp();
  const insets = useSafeAreaInsets();
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
          tabBarAccessibilityLabel: 'Create post',
          tabBarButton: CreateTabButton,
        }}
        listeners={({navigation}) => ({
          tabPress: e => {
            e.preventDefault();
            navigation.navigate('CreatePost');
          },
        })}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          tabBarBadge: unreadMessages || undefined,
          tabBarBadgeStyle: styles.tabBadge,
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
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
      <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="ContentDetail" component={ContentDetailScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Group
        screenOptions={{
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_bottom',
        }}>
        <Stack.Screen name="Comments" component={CommentsScreen} />
        <Stack.Screen name="CreatePost" component={CreatePostScreen} />
        <Stack.Screen
          name="CreateCommunity"
          component={CreateCommunityScreen}
        />
      </Stack.Group>
    </Stack.Navigator>
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
});
