import React from 'react';
import {FlatList, RefreshControl} from 'react-native';
import {errorMessage} from '../../api';
import {ContentRow, PostCard} from '../../components/items';
import {BackHeader, EmptyState, ErrorState, ListFooter, LoadingState, Screen} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {useBookmarks} from '../../query/hooks';
import {makeStyles, spacing, useTheme} from '../../theme';

/** GET /me/bookmarks */
export default function SavedScreen(_p: RootScreenProps<'Saved'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const list = useBookmarks();
  return (
    <Screen>
      <BackHeader title={t('Saved')} />
      <FlatList
        data={list.items}
        keyExtractor={p => p.id}
        renderItem={({item}) => (item.type === 'video' ? <ContentRow item={item} /> : <PostCard post={item} />)}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.grow}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState
              icon="bookmark-outline"
              title={t('Nothing saved yet')}
              message={t('Tap the bookmark icon on any content to save it here.')}
            />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({grow: {flexGrow: 1, paddingTop: spacing.sm}}));
