import React, {useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {api, errorMessage, isApiError} from '../api';
import type {Community, Post, User} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {qk} from '../query/keys';
import {
  useBookmarks,
  useCommunities,
  useToggleFollow,
  useUser,
  useUserPosts,
} from '../query/hooks';
import {colors, font, radius, spacing, weight} from '../theme';
import {formatCount, useResponsive} from '../utils/responsive';
import {CommunityRow, GridTile, PostCard} from './items';
import {confirmDestructive, useReport, useSheet} from './Sheet';
import {
  Avatar,
  ChipRow,
  EmptyState,
  ErrorState,
  FollowButton,
  IconButton,
  ListFooter,
  LoadingState,
  PillButton,
  VerifiedBadge,
} from './ui';

type Tab = 'videos' | 'posts' | 'saved' | 'communities';

export default function ProfileView({userId}: {userId: string}) {
  const {me} = useAuth();
  const isMe = userId === me?.id;
  const user = useUser(userId, isMe && me ? me : undefined);

  if (user.isLoading && !user.data) {
    return <LoadingState />;
  }
  if (!user.data) {
    const notFound = isApiError(user.error) && user.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Profile unavailable' : "Couldn't load this profile"}
        message={
          notFound
            ? 'This account does not exist or is not available.'
            : errorMessage(user.error)
        }
        onRetry={notFound ? undefined : () => user.refetch()}
      />
    );
  }
  return (
    <ProfileContent
      user={user.data}
      isMe={isMe}
      onRefresh={() => user.refetch()}
    />
  );
}

function ProfileContent({
  user,
  isMe,
  onRefresh,
}: {
  user: User;
  isMe: boolean;
  onRefresh: () => void;
}) {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const openSheet = useSheet();
  const report = useReport();
  const follow = useToggleFollow();
  const {width} = useResponsive();
  const [tab, setTab] = useState<Tab>('videos');
  const [opening, setOpening] = useState(false);

  const videos = useUserPosts(user.id, 'video');
  const posts = useUserPosts(user.id, 'post');
  const saved = useBookmarks(isMe && tab === 'saved');
  const communities = useCommunities({mine: true, sort: 'recent'});

  const tabs: {key: Tab; label: string}[] = [
    {key: 'videos', label: 'Videos'},
    {key: 'posts', label: 'Posts'},
    ...(isMe
      ? ([
          {key: 'saved', label: 'Saved'},
          {key: 'communities', label: 'Communities'},
        ] as {key: Tab; label: string}[])
      : []),
  ];

  const openChat = async () => {
    setOpening(true);
    try {
      const conv = await api.messaging.openDirect(user.id);
      qc.setQueryData(qk.conversation(conv.id), conv);
      navigation.navigate('Chat', {conversationId: conv.id});
    } catch (e) {
      Alert.alert("Couldn't open the chat", errorMessage(e));
    } finally {
      setOpening(false);
    }
  };

  const setBlocked = async (blocked: boolean) => {
    try {
      if (blocked) {
        await api.users.block(user.id);
      } else {
        await api.users.unblock(user.id);
      }
      qc.invalidateQueries(qk.user(user.id));
      qc.invalidateQueries(qk.blocked());
      qc.invalidateQueries(['feed']);
      qc.invalidateQueries(['userPosts', user.id]);
    } catch (e) {
      Alert.alert('Error', errorMessage(e));
    }
  };

  const moreOptions = () =>
    openSheet({
      title: `@${user.username}`,
      options: [
        user.isBlocked
          ? {
              label: 'Unblock',
              icon: 'lock-open-outline',
              onPress: () => setBlocked(false),
            }
          : {
              label: 'Block',
              icon: 'ban-outline',
              destructive: true,
              onPress: async () => {
                if (
                  await confirmDestructive(
                    `Block ${user.name}?`,
                    "They won't be able to message you or see your content, and you won't see theirs.",
                    'Block',
                  )
                ) {
                  setBlocked(true);
                }
              },
            },
        {
          label: 'Report',
          icon: 'flag-outline',
          destructive: true,
          onPress: () => report('user', user.id),
        },
      ],
    });

  const list =
    tab === 'videos'
      ? videos
      : tab === 'posts'
      ? posts
      : tab === 'saved'
      ? saved
      : communities;
  const grid = tab === 'videos';
  const tileSize = Math.floor(Math.min(width, 680) / 3);

  const header = (
    <View>
      <View style={styles.cover} />
      <View style={styles.head}>
        <Avatar
          uri={user.avatarUrl}
          name={user.name}
          size={96}
          ring
          style={styles.avatar}
        />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.name}</Text>
          {user.verified ? <VerifiedBadge size={18} /> : null}
        </View>
        <Text style={styles.handle}>
          @{user.username}
          {user.university ? ` · ${user.university}` : ''}
        </Text>
        {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

        <View style={styles.stats}>
          <Stat
            value={formatCount(user.followerCount)}
            label="Followers"
            onPress={() =>
              navigation.navigate('FollowList', {
                userId: user.id,
                kind: 'followers',
                title: user.name,
              })
            }
          />
          <View style={styles.statDivider} />
          <Stat
            value={formatCount(user.followingCount)}
            label="Following"
            onPress={() =>
              navigation.navigate('FollowList', {
                userId: user.id,
                kind: 'following',
                title: user.name,
              })
            }
          />
          <View style={styles.statDivider} />
          <Stat value={formatCount(user.postCount)} label="Posts" />
        </View>
        {!isMe && user.mutualCount > 0 ? (
          <Text style={styles.mutual}>
            {user.mutualCount} mutual connections
          </Text>
        ) : null}

        <View style={styles.actions}>
          {isMe ? (
            <>
              <PillButton
                small
                title="Edit Profile"
                variant="outline"
                icon="create-outline"
                style={styles.actionBtn}
                onPress={() => navigation.navigate('EditProfile')}
              />
              <PillButton
                small
                title="Settings"
                variant="soft"
                icon="settings-outline"
                style={styles.actionBtn}
                onPress={() => navigation.navigate('Settings')}
              />
            </>
          ) : user.isBlocked ? (
            <PillButton
              small
              title="Unblock"
              icon="lock-open-outline"
              style={styles.actionBtn}
              onPress={() => setBlocked(false)}
            />
          ) : (
            <>
              <FollowButton
                following={user.isFollowing}
                onPress={() => follow.mutate(user)}
              />
              <PillButton
                small
                title="Message"
                variant="soft"
                icon="chatbubble-outline"
                loading={opening}
                style={styles.actionBtn}
                onPress={openChat}
              />
              <IconButton
                name="ellipsis-horizontal"
                label="More options"
                onPress={moreOptions}
              />
            </>
          )}
        </View>
      </View>

      {user.isBlocked ? (
        <EmptyState
          icon="ban-outline"
          title="You blocked this account"
          message="Unblock to see their content and message each other."
        />
      ) : (
        <ChipRow
          items={tabs}
          value={tab}
          onChange={setTab}
          style={styles.tabs}
        />
      )}
    </View>
  );

  const empty = list.isLoading ? (
    <LoadingState />
  ) : list.isError ? (
    <ErrorState
      message={errorMessage(list.error)}
      onRetry={() => list.refetch()}
    />
  ) : tab === 'videos' ? (
    <EmptyState
      icon="videocam-outline"
      title="No videos yet"
      action={
        isMe
          ? {
              label: 'Record a video',
              onPress: () => navigation.navigate('CreateVideo'),
            }
          : undefined
      }
    />
  ) : tab === 'posts' ? (
    <EmptyState
      icon="newspaper-outline"
      title="No posts yet"
      action={
        isMe
          ? {
              label: 'Create a post',
              onPress: () => navigation.navigate('CreatePost'),
            }
          : undefined
      }
    />
  ) : tab === 'saved' ? (
    <EmptyState
      icon="bookmark-outline"
      title="Nothing saved yet"
      message="Tap the bookmark icon on any content to save it here."
    />
  ) : (
    <EmptyState
      icon="people-outline"
      title="No communities yet"
      action={{
        label: 'Explore communities',
        onPress: () => navigation.navigate('Communities'),
      }}
    />
  );

  return (
    <FlatList<Post | Community>
      key={grid ? 'grid' : 'list'}
      numColumns={grid ? 3 : 1}
      data={user.isBlocked ? [] : (list.items as (Post | Community)[])}
      keyExtractor={i => i.id}
      renderItem={({item}) =>
        tab === 'communities' ? (
          <CommunityRow community={item as Community} />
        ) : grid ? (
          <GridTile post={item as Post} size={tileSize} />
        ) : (
          <PostCard post={item as Post} />
        )
      }
      ListHeaderComponent={header}
      ListEmptyComponent={user.isBlocked ? null : empty}
      ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={list.refreshing}
          onRefresh={() => {
            onRefresh();
            list.refresh();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    />
  );
}

function Stat({
  value,
  label,
  onPress,
}: {
  value: string;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={styles.stat}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {paddingBottom: spacing.xxxl},
  cover: {
    height: 96,
    backgroundColor: colors.primarySoft,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  head: {alignItems: 'center', paddingHorizontal: spacing.lg},
  avatar: {marginTop: -48},
  nameRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.md},
  name: {
    fontSize: font.xxl,
    fontWeight: weight.bold,
    color: colors.text,
    marginRight: 6,
  },
  handle: {
    fontSize: font.sm,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  bio: {
    fontSize: font.md,
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    alignSelf: 'stretch',
  },
  stat: {flex: 1, alignItems: 'center'},
  statValue: {fontSize: font.xl, fontWeight: weight.bold, color: colors.text},
  statLabel: {fontSize: font.xs, color: colors.textSecondary, marginTop: 2},
  statDivider: {width: 1, height: 28, backgroundColor: colors.border},
  mutual: {
    fontSize: font.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  actions: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg},
  actionBtn: {marginHorizontal: spacing.xs},
  tabs: {marginTop: spacing.lg, paddingBottom: spacing.sm},
});
