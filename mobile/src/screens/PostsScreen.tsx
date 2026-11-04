import React, {useState} from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
} from 'react-native';
import {errorMessage} from '../api';
import type {FeedParams} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {PostCard} from '../components/items';
import {
  Avatar,
  BackHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListFooter,
  LoadingState,
  Screen,
} from '../components/ui';
import {useFeed} from '../query/hooks';
import {useUnreadCounts} from '../query/messaging';
import type {RootScreenProps} from '../navigation/types';
import {font, makeStyles, radius, spacing, useTheme} from '../theme';

type Feed = 'forYou' | 'following' | 'popular' | 'latest';

const PARAMS: Record<Feed, FeedParams> = {
  forYou: {tab: 'forYou', type: 'post'},
  following: {tab: 'following', type: 'post'},
  popular: {tab: 'forYou', type: 'post', sort: 'popular'},
  latest: {tab: 'forYou', type: 'post', sort: 'latest'},
};

export default function PostsScreen({navigation}: RootScreenProps<'Posts'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const {me} = useAuth();
  const unread = useUnreadCounts();
  const [feed, setFeed] = useState<Feed>('forYou');
  const list = useFeed(PARAMS[feed]);

  return (
    <Screen>
      <BackHeader
        title="Posts"
        right={
          <>
            <IconButton
              name="search"
              label="Search"
              onPress={() => navigation.navigate('Search', {type: 'posts'})}
            />
            <IconButton
              name="notifications-outline"
              label="Notifications"
              badge={unread.notifications}
              style={styles.ml}
              onPress={() => navigation.navigate('Notifications')}
            />
          </>
        }
      />
      <ChipRow
        items={[
          {key: 'forYou', label: 'For You'},
          {key: 'following', label: 'Following'},
          {key: 'popular', label: 'Popular'},
          {key: 'latest', label: 'Latest'},
        ]}
        value={feed}
        onChange={setFeed}
      />
      <FlatList
        data={list.items}
        keyExtractor={p => p.id}
        renderItem={({item}) => <PostCard post={item} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.grow}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={list.refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <Pressable
            style={styles.composer}
            onPress={() => navigation.navigate('CreatePost')}
            accessibilityRole="button"
            accessibilityLabel="Share something">
            <Avatar uri={me?.avatarUrl} name={me?.name} size={40} />
            <Text style={styles.composerText}>Share something...</Text>
            <Icon name="image-outline" size={22} color={colors.primary} />
            <Icon
              name="pencil"
              size={20}
              color={colors.primary}
              style={styles.ml}
            />
          </Pressable>
        }
        ListFooterComponent={
          <ListFooter
            loading={list.isFetchingNextPage}
            error={list.isError && list.items.length > 0}
            onRetry={list.loadMore}
          />
        }
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState
              message={errorMessage(list.error)}
              onRetry={() => list.refetch()}
            />
          ) : (
            <EmptyState
              icon="newspaper-outline"
              title="No posts yet"
              message={
                feed === 'following'
                  ? 'Follow students and creators to fill your feed.'
                  : 'Be the first to share something.'
              }
              action={
                feed === 'following'
                  ? {
                      label: 'Find people',
                      onPress: () => navigation.navigate('Users'),
                    }
                  : {
                      label: 'Create a post',
                      onPress: () => navigation.navigate('CreatePost'),
                    }
              }
            />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  ml: {marginLeft: spacing.md},
  grow: {flexGrow: 1},
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    paddingRight: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  composerText: {
    flex: 1,
    marginLeft: spacing.md,
    color: c.textMuted,
    fontSize: font.md,
  },
}));
