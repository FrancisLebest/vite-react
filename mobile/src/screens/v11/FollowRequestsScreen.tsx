import React from 'react';
import {Alert, FlatList, RefreshControl, View} from 'react-native';
import {errorMessage} from '../../api';
import {UserRow} from '../../components/items';
import {BackHeader, EmptyState, ErrorState, ListFooter, LoadingState, PillButton, Screen} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {useAnswerFollowRequest, useFollowRequests} from '../../query/v11';
import {makeStyles, spacing, useTheme} from '../../theme';
import {timeAgo} from '../../utils/time';

/** Received follow requests (private account): accept / decline. */
export default function FollowRequestsScreen(_p: RootScreenProps<'FollowRequests'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const list = useFollowRequests();
  const answer = useAnswerFollowRequest();
  const respond = (userId: string, accept: boolean) =>
    answer.mutate({userId, accept}, {onError: e => Alert.alert(t('Error'), errorMessage(e))});

  return (
    <Screen>
      <BackHeader title={t('Follow requests')} />
      <FlatList
        data={list.items}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.grow}
        renderItem={({item}) => (
          <UserRow
            user={item.user}
            compact
            right={
              <View style={styles.actions} accessibilityLabel={t('Requested {when}', {when: timeAgo(item.createdAt)})}>
                <PillButton small title={t('Accept')} onPress={() => respond(item.user.id, true)} />
                <PillButton small variant="soft" title={t('Decline')} style={styles.ml} onPress={() => respond(item.user.id, false)} />
              </View>
            }
          />
        )}
        onEndReached={list.loadMore}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState icon="person-add-outline" title={t('No pending requests')} message={t('When someone asks to follow your private account, it shows up here.')} />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  grow: {flexGrow: 1},
  actions: {flexDirection: 'row'},
  ml: {marginLeft: spacing.xs},
}));
