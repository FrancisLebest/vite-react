import React from 'react';
import {Alert, FlatList, RefreshControl, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {api, errorMessage} from '../../api';
import {ContentRow} from '../../components/items';
import {confirmDestructive} from '../../components/Sheet';
import {
  BackHeader,
  EmptyState,
  ErrorState,
  IconButton,
  ListFooter,
  LoadingState,
  Screen,
} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {removeFromPages} from '../../query/cache';
import {qk11, useHistory} from '../../query/v11';
import {font, makeStyles, spacing, useTheme} from '../../theme';
import {timeAgo} from '../../utils/time';

/** GET /me/history — recently watched, with clear-all and per-item remove. */
export default function HistoryScreen({navigation}: RootScreenProps<'History'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const qc = useQueryClient();
  const list = useHistory();

  const clearAll = async () => {
    if (!(await confirmDestructive(t('Clear watch history?'), t('This removes every video from your history.'), t('Clear')))) {
      return;
    }
    try {
      await api.social.clearHistory();
      qc.setQueryData(qk11.history(), {pages: [{items: [], nextCursor: null}], pageParams: [undefined]});
    } catch (e) {
      Alert.alert(t('Error'), errorMessage(e));
    }
  };

  const removeOne = (postId: string) =>
    api.social
      .removeHistory(postId)
      .then(() => removeFromPages(qc, [qk11.history()], postId))
      .catch(e => Alert.alert(t('Error'), errorMessage(e)));

  return (
    <Screen>
      <BackHeader
        title={t('Watch history')}
        right={
          list.items.length ? (
            <IconButton name="trash-outline" label={t('Clear watch history')} color={colors.danger} onPress={clearAll} />
          ) : null
        }
      />
      <FlatList
        data={list.items}
        keyExtractor={e => e.id}
        contentContainerStyle={styles.grow}
        renderItem={({item}) => (
          <View>
            <View style={styles.meta}>
              <Text style={styles.when}>{t('Watched {when}', {when: timeAgo(item.viewedAt)})}</Text>
              <IconButton
                name="close"
                size={16}
                color={colors.textMuted}
                label={t('Remove from history')}
                onPress={() => removeOne(item.post.id)}
              />
            </View>
            <ContentRow item={item.post} />
          </View>
        )}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState
              icon="time-outline"
              title={t('No watch history')}
              message={t('Videos you watch will show up here.')}
              action={{label: t('Discover videos'), onPress: () => navigation.navigate('Tabs', {screen: 'Home'})}}
            />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  grow: {flexGrow: 1, paddingTop: spacing.sm},
  meta: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg},
  when: {fontSize: font.xs, color: c.textMuted},
}));
