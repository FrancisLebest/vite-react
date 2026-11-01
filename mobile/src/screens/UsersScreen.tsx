import React, {useMemo, useState} from 'react';
import {FlatList, StyleSheet} from 'react-native';
import {UserRow} from '../components/items';
import {
  BackHeader,
  ChipRow,
  EmptyState,
  IconButton,
  Screen,
  SearchInput,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import {ME_ID} from '../data/mock';
import type {RootScreenProps} from '../navigation/types';
import {spacing} from '../theme';

type Segment = 'all' | 'students' | 'professors' | 'creators';

export default function UsersScreen({navigation}: RootScreenProps<'Users'>) {
  const {state} = useApp();
  const [segment, setSegment] = useState<Segment>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.users
      .filter(u => u.id !== ME_ID)
      .filter(u => {
        switch (segment) {
          case 'students':
            return u.role === 'student';
          case 'professors':
            return u.role === 'professor';
          case 'creators':
            return u.role === 'creator';
          default:
            return true;
        }
      })
      .filter(
        u =>
          !q ||
          u.name.toLowerCase().includes(q) ||
          u.university.toLowerCase().includes(q),
      )
      .sort((a, b) => (segment === 'creators' ? b.followers - a.followers : 0));
  }, [state.users, segment, query]);

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
              onPress={() => navigation.navigate('Search', {})}
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
          placeholder="Search by name or university"
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
        data={data}
        keyExtractor={u => u.id}
        renderItem={({item}) => <UserRow user={item} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState icon="people-outline" title="No users found" />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ml: {marginLeft: spacing.md},
  search: {marginHorizontal: spacing.lg, marginBottom: spacing.sm},
  chips: {paddingBottom: spacing.sm},
});
