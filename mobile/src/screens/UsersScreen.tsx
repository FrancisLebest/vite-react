import React, {useState} from 'react';
import {FlatList, RefreshControl, StyleSheet} from 'react-native';
import {errorMessage} from '../api';
import type {UsersParams} from '../api/types';
import {UserRow} from '../components/items';
import {
  BackHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  IconButton,
  ListFooter,
  LoadingState,
  Screen,
  SearchInput,
} from '../components/ui';
import {useUsers} from '../query/hooks';
import type {RootScreenProps} from '../navigation/types';
import {colors, spacing} from '../theme';
import {useDebounced} from '../utils/hooks';

type Segment = 'all' | 'students' | 'professors' | 'creators';

const SEGMENTS: Record<Segment, UsersParams> = {
  all: {sort: 'popular'},
  students: {role: 'student', sort: 'popular'},
  professors: {role: 'professor', sort: 'popular'},
  creators: {role: 'creator', sort: 'popular'},
};

export default function UsersScreen({navigation}: RootScreenProps<'Users'>) {
  const [segment, setSegment] = useState<Segment>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 350);
  const list = useUsers({...SEGMENTS[segment], q: q || undefined});

  return (
    <Screen>
      <BackHeader
        title="Users"
        right={
          <>
            <IconButton
              name={searching ? 'close' : 'search'}
              label={searching ? 'Close search' : 'Search users'}
              onPress={() => {
                setSearching(s => !s);
                setQuery('');
              }}
            />
            <IconButton
              name="funnel-outline"
              label="Advanced search"
              style={styles.ml}
              onPress={() =>
                navigation.navigate('Search', {
                  type: 'users',
                  openFilters: true,
                })
              }
            />
          </>
        }
      />
      {searching ? (
        <SearchInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search by name or username"
          style={styles.search}
        />
      ) : null}
      <ChipRow
        items={[
          {key: 'all', label: 'All'},
          {key: 'students', label: 'Students'},
          {key: 'professors', label: 'Professors'},
          {key: 'creators', label: 'Top Creators'},
        ]}
        value={segment}
        onChange={setSegment}
        style={styles.chips}
      />
      <FlatList
        data={list.items}
        keyExtractor={u => u.id}
        renderItem={({item}) => <UserRow user={item} />}
        keyboardShouldPersistTaps="handled"
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
              title="No users found"
              message={q ? `Nobody matches "${q}".` : undefined}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ml: {marginLeft: spacing.md},
  grow: {flexGrow: 1},
  search: {marginHorizontal: spacing.lg, marginBottom: spacing.sm},
  chips: {paddingBottom: spacing.sm},
});
