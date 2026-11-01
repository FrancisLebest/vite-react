import React, {useCallback, useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
} from 'react-native';
import {PostCard} from '../components/items';
import {
  Avatar,
  BackHeader,
  ChipRow,
  EmptyState,
  Icon,
  IconButton,
  Screen,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing} from '../theme';

type Feed = 'forYou' | 'following' | 'popular' | 'latest';

export default function PostsScreen({navigation}: RootScreenProps<'Posts'>) {
  const {state, me, unreadNotifications} = useApp();
  const [feed, setFeed] = useState<Feed>('forYou');
  const [refreshing, setRefreshing] = useState(false);

  const data = useMemo(() => {
    const list = [...state.posts];
    switch (feed) {
      case 'following':
        return list.filter(
          p => state.following[p.authorId] || p.authorId === me.id,
        );
      case 'popular':
        return list.sort((a, b) => b.likes - a.likes);
      case 'latest':
        return list.sort((a, b) => b.createdAt - a.createdAt);
      default:
        return list;
    }
  }, [feed, state.posts, state.following, me.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulated network refresh; plug your API call here.
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  return (
    <Screen>
      <BackHeader
        title="Posts"
        right={
          <>
            <IconButton
              name="search"
              label="Search"
              onPress={() => navigation.navigate('Search')}
            />
            <IconButton
              name="notifications-outline"
              label="Notifications"
              badge={unreadNotifications}
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
        data={data}
        keyExtractor={p => p.id}
        renderItem={({item}) => <PostCard post={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
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
            <Avatar uri={me.avatar} size={40} online />
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
        ListEmptyComponent={
          <EmptyState
            icon="newspaper-outline"
            title="No posts yet"
            message="Follow students and creators to fill your feed."
            action={{
              label: 'Find people',
              onPress: () => navigation.navigate('Users'),
            }}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ml: {marginLeft: spacing.md},
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    paddingRight: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerText: {
    flex: 1,
    marginLeft: spacing.md,
    color: colors.textMuted,
    fontSize: font.md,
  },
});
