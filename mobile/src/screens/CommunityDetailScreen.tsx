import React, {useState} from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useQueryClient} from '@tanstack/react-query';
import {api, errorMessage} from '../api';
import type {Post, UserSummary} from '../api/types';
import {CommunityAvatar, PostCard, UserRow} from '../components/items';
import {confirmDestructive, useReport, useSheet} from '../components/Sheet';
import {
  BackHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  IconButton,
  ListFooter,
  LoadingState,
  PillButton,
  Screen,
} from '../components/ui';
import {removeFromPages} from '../query/cache';
import {useCommunity, useCursorList, useToggleJoin} from '../query/hooks';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../theme';
import {formatCount} from '../utils/responsive';

type Tab = 'posts' | 'members';

export default function CommunityDetailScreen({
  route,
  navigation,
}: RootScreenProps<'CommunityDetail'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const {communityId} = route.params;
  const qc = useQueryClient();
  const openSheet = useSheet();
  const report = useReport();
  const join = useToggleJoin();
  const [tab, setTab] = useState<Tab>('posts');
  const community = useCommunity(communityId);
  const posts = useCursorList<Post>(qk.communityPosts(communityId), c =>
    api.communities.posts(communityId, c),
  );
  const members = useCursorList<UserSummary>(
    qk.communityMembers(communityId),
    c => api.communities.members(communityId, c),
    {enabled: tab === 'members'},
  );

  if (community.isLoading) {
    return (
      <Screen>
        <BackHeader title="Community" />
        <LoadingState />
      </Screen>
    );
  }
  if (community.isError || !community.data) {
    return (
      <Screen>
        <BackHeader title="Community" />
        <ErrorState
          message={errorMessage(community.error)}
          onRetry={() => community.refetch()}
        />
      </Screen>
    );
  }
  const c = community.data;

  const remove = async () => {
    const ok = await confirmDestructive(
      `Delete ${c.name}?`,
      'The community and its membership list will be permanently deleted.',
      'Delete community',
    );
    if (!ok) {
      return;
    }
    try {
      await api.communities.remove(c.id);
      removeFromPages(qc, [['communities']], c.id);
      qc.removeQueries(qk.community(c.id));
      navigation.goBack();
    } catch (e) {
      Alert.alert('Delete failed', errorMessage(e));
    }
  };

  const openOptions = () =>
    openSheet({
      title: c.name,
      options: c.isOwner
        ? [
            {
              label: 'Edit community',
              icon: 'create-outline',
              onPress: () =>
                navigation.navigate('CreateCommunity', {communityId: c.id}),
            },
            {
              label: 'Delete community',
              icon: 'trash-outline',
              destructive: true,
              onPress: remove,
            },
          ]
        : [
            {
              label: 'Report community',
              icon: 'flag-outline',
              destructive: true,
              onPress: () => report('community', c.id),
            },
          ],
    });

  const header = (
    <View>
      <LinearGradient
        colors={[c.color || colors.primary, colors.primaryDark]}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.hero}>
        <View style={styles.heroIcon}>
          <CommunityAvatar community={c} size={64} />
        </View>
        <Text style={styles.title}>{c.name}</Text>
        <Text style={styles.members}>
          {formatCount(c.memberCount)} Members · {formatCount(c.postCount)}{' '}
          Posts
        </Text>
      </LinearGradient>

      {c.description ? (
        <Text style={styles.description}>{c.description}</Text>
      ) : null}

      <View style={styles.actions}>
        {c.isOwner ? (
          <PillButton
            title="Edit"
            icon="create-outline"
            variant="soft"
            style={styles.flex}
            onPress={() =>
              navigation.navigate('CreateCommunity', {communityId: c.id})
            }
          />
        ) : (
          <PillButton
            title={c.isMember ? 'Joined' : 'Join Community'}
            icon={c.isMember ? 'checkmark' : 'add'}
            variant={c.isMember ? 'soft' : 'solid'}
            style={styles.flex}
            accessibilityLabel={
              c.isMember ? 'Leave community' : 'Join community'
            }
            onPress={() => join.mutate(c)}
          />
        )}
        {c.isMember ? (
          <PillButton
            title="Post"
            icon="create-outline"
            variant="outline"
            style={styles.post}
            onPress={() =>
              navigation.navigate('CreatePost', {communityId: c.id})
            }
          />
        ) : null}
      </View>

      <ChipRow
        items={[
          {key: 'posts', label: 'Posts'},
          {key: 'members', label: 'Members'},
        ]}
        value={tab}
        onChange={setTab}
        style={styles.tabs}
      />
    </View>
  );

  const list = tab === 'posts' ? posts : members;

  return (
    <Screen>
      <BackHeader
        title={c.name}
        right={
          <IconButton
            name="ellipsis-horizontal"
            label="Community options"
            onPress={openOptions}
          />
        }
      />
      <FlatList<Post | UserSummary>
        data={list.items as (Post | UserSummary)[]}
        keyExtractor={i => i.id}
        renderItem={({item}) =>
          tab === 'posts' ? (
            <PostCard post={item as Post} />
          ) : (
            <UserRow user={item as UserSummary} compact />
          )
        }
        ListHeaderComponent={header}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => {
              community.refetch();
              list.refresh();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState
              message={errorMessage(list.error)}
              onRetry={() => list.refetch()}
            />
          ) : tab === 'posts' ? (
            <EmptyState
              icon="chatbubbles-outline"
              title="No discussions yet"
              message={
                c.isMember
                  ? 'Start the first one!'
                  : 'Join to start a discussion.'
              }
              action={
                c.isMember
                  ? {
                      label: 'Create a post',
                      onPress: () =>
                        navigation.navigate('CreatePost', {communityId: c.id}),
                    }
                  : undefined
              }
            />
          ) : (
            <EmptyState icon="people-outline" title="No members yet" />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  scroll: {paddingBottom: spacing.xxxl},
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    padding: spacing.xl,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: c.white,
    fontSize: font.xxl,
    fontWeight: weight.bold,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  members: {color: 'rgba(255,255,255,0.85)', fontSize: font.md, marginTop: 4},
  description: {
    fontSize: font.md,
    color: c.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  post: {marginLeft: spacing.md},
  tabs: {marginTop: spacing.lg, paddingBottom: spacing.sm},
}));
