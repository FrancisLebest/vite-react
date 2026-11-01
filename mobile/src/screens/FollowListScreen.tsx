import React from 'react';
import {StyleSheet, FlatList, RefreshControl} from 'react-native';
import {api, errorMessage} from '../api';
import type {UserSummary} from '../api/types';
import {UserRow} from '../components/items';
import {
  BackHeader,
  EmptyState,
  ErrorState,
  ListFooter,
  LoadingState,
  Screen,
} from '../components/ui';
import {useCursorList} from '../query/hooks';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';
import {colors} from '../theme';

export default function FollowListScreen({
  route,
}: RootScreenProps<'FollowList'>) {
  const {userId, kind, title} = route.params;
  const list = useCursorList<UserSummary>(
    kind === 'followers' ? qk.followers(userId) : qk.following(userId),
    cursor =>
      kind === 'followers'
        ? api.users.followers(userId, cursor)
        : api.users.following(userId, cursor),
  );
  const label = kind === 'followers' ? 'Followers' : 'Following';
  return (
    <Screen>
      <BackHeader title={title ? `${title} · ${label}` : label} />
      <FlatList
        data={list.items}
        keyExtractor={u => u.id}
        renderItem={({item}) => <UserRow user={item} compact />}
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
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
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
              icon="people-outline"
              title={
                kind === 'followers'
                  ? 'No followers yet'
                  : 'Not following anyone yet'
              }
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({grow: {flexGrow: 1}});
