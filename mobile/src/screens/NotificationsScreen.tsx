import React, {useEffect, useRef} from 'react';
import {StyleSheet, FlatList, RefreshControl} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {api, errorMessage} from '../api';
import {NotificationRow} from '../components/NotificationRow';
import {
  BackHeader,
  EmptyState,
  ErrorState,
  ListFooter,
  LoadingState,
  Screen,
} from '../components/ui';
import {qk} from '../query/keys';
import {useNotifications} from '../query/messaging';
import type {RootScreenProps} from '../navigation/types';
import {colors} from '../theme';

export default function NotificationsScreen(
  _props: RootScreenProps<'Notifications'>,
) {
  const qc = useQueryClient();
  const list = useNotifications();
  // Ids that were unread when the screen opened stay highlighted during this visit.
  const unreadSnapshot = useRef<Set<string> | null>(null);
  if (!unreadSnapshot.current && list.data) {
    unreadSnapshot.current = new Set(
      list.items.filter(n => !n.read).map(n => n.id),
    );
  }

  // Mark everything read on open.
  useEffect(() => {
    api.notifications
      .readAll()
      .then(() => {
        qc.setQueryData(qk.unreadNotifications(), {count: 0});
      })
      .catch(() => undefined);
    return () => {
      // Reflect the read state in the cached list when leaving.
      qc.invalidateQueries(qk.notifications());
    };
  }, [qc]);

  return (
    <Screen>
      <BackHeader title="Notifications" />
      <FlatList
        data={list.items}
        keyExtractor={n => n.id}
        renderItem={({item}) => (
          <NotificationRow
            notification={item}
            highlight={
              unreadSnapshot.current
                ? unreadSnapshot.current.has(item.id)
                : !item.read
            }
          />
        )}
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
              icon="notifications-off-outline"
              title="No notifications"
              message="Likes, comments, follows and mentions will show up here."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({grow: {flexGrow: 1}});
