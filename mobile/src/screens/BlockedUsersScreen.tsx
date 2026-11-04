import React from 'react';
import {StyleSheet, Alert, FlatList, RefreshControl} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {api, errorMessage} from '../api';
import type {UserSummary} from '../api/types';
import {UserRow} from '../components/items';
import {
  BackHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PillButton,
  Screen,
} from '../components/ui';
import {useManualRefresh} from '../query/hooks';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';

export default function BlockedUsersScreen(
  _p: RootScreenProps<'BlockedUsers'>,
) {
  const styles = useStyles();
  const {colors} = useTheme();
  const qc = useQueryClient();
  const blocked = useQuery({
    queryKey: qk.blocked(),
    queryFn: api.users.blocked,
  });
  const {refreshing, refresh} = useManualRefresh(blocked.refetch);
  const unblock = useMutation({
    mutationFn: (id: string) => api.users.unblock(id),
    onMutate: id => {
      const prev = qc.getQueryData<UserSummary[]>(qk.blocked());
      qc.setQueryData<UserSummary[]>(qk.blocked(), l =>
        (l ?? []).filter(u => u.id !== id),
      );
      return prev;
    },
    onError: (e, _id, prev) => {
      qc.setQueryData(qk.blocked(), prev);
      Alert.alert('Unblock failed', errorMessage(e));
    },
    onSuccess: (_r, id) => {
      qc.invalidateQueries(qk.user(id));
      qc.invalidateQueries(['feed']);
    },
  });

  return (
    <Screen>
      <BackHeader title="Blocked accounts" />
      <FlatList
        data={blocked.data ?? []}
        keyExtractor={u => u.id}
        contentContainerStyle={styles.grow}
        renderItem={({item}) => (
          <UserRow
            user={item}
            compact
            right={
              <PillButton
                small
                variant="outline"
                title="Unblock"
                onPress={() => unblock.mutate(item.id)}
              />
            }
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          blocked.isLoading ? (
            <LoadingState />
          ) : blocked.isError ? (
            <ErrorState
              message={errorMessage(blocked.error)}
              onRetry={() => blocked.refetch()}
            />
          ) : (
            <EmptyState icon="happy-outline" title="No blocked accounts" />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({grow: {flexGrow: 1}}));
