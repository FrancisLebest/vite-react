import React, {useState} from 'react';
import {
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {api, errorMessage} from '../api';
import type {User, UserSummary} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {UserRow} from '../components/items';
import {
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListFooter,
  LoadingState,
  PillButton,
  Screen,
  SearchInput,
  TextField,
} from '../components/ui';
import {useUsers} from '../query/hooks';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, spacing, weight} from '../theme';
import {useDebounced} from '../utils/hooks';

export default function NewMessageScreen({
  navigation,
}: RootScreenProps<'NewMessage'>) {
  const {me} = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UserSummary[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useDebounced(query.trim(), 300);
  const users = useUsers({q: q || undefined, sort: 'popular'});
  const isGroup = selected.length > 1;
  const candidates = users.items.filter(u => u.id !== me?.id);

  const toggle = (u: User | UserSummary) =>
    setSelected(s =>
      s.some(x => x.id === u.id) ? s.filter(x => x.id !== u.id) : [...s, u],
    );

  const start = async () => {
    if (!selected.length || busy) {
      return;
    }
    if (isGroup && !title.trim()) {
      Alert.alert('Group name', 'Give your group a name.');
      return;
    }
    setBusy(true);
    try {
      const conv = isGroup
        ? await api.messaging.createGroup(
            title.trim(),
            selected.map(u => u.id),
          )
        : await api.messaging.openDirect(selected[0].id);
      qc.setQueryData(qk.conversation(conv.id), conv);
      qc.invalidateQueries(qk.conversations());
      navigation.replace('Chat', {conversationId: conv.id});
    } catch (e) {
      setBusy(false);
      Alert.alert("Couldn't start the conversation", errorMessage(e));
    }
  };

  return (
    <Screen edges={Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          name="close"
          label="Cancel"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.title}>
          {isGroup ? 'New group' : 'New message'}
        </Text>
        <PillButton
          small
          title={isGroup ? 'Create' : 'Chat'}
          disabled={!selected.length}
          loading={busy}
          onPress={start}
        />
      </View>
      <SearchInput
        autoFocus
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        placeholder="Search people"
        style={styles.search}
      />
      {selected.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selected}
          style={styles.selectedScroll}>
          {selected.map(u => (
            <Chip
              key={u.id}
              label={`${u.name}  ✕`}
              active
              onPress={() => toggle(u)}
            />
          ))}
        </ScrollView>
      ) : null}
      {isGroup ? (
        <TextField
          label="Group name"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Physics study group"
          maxLength={60}
          style={styles.groupName}
        />
      ) : null}
      <FlatList
        data={candidates}
        keyExtractor={u => u.id}
        keyboardShouldPersistTaps="handled"
        onEndReached={users.loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.grow}
        renderItem={({item}) => {
          const on = selected.some(s => s.id === item.id);
          return (
            <UserRow
              user={item}
              compact
              onPress={() => toggle(item)}
              right={
                <Icon
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={on ? colors.primary : colors.textMuted}
                  accessibilityLabel={on ? 'Selected' : 'Not selected'}
                />
              }
            />
          );
        }}
        ListHeaderComponent={
          <Text style={styles.hint}>
            Select one person for a direct message, or several to create a
            group.
          </Text>
        }
        ListFooterComponent={<ListFooter loading={users.isFetchingNextPage} />}
        ListEmptyComponent={
          users.isLoading ? (
            <LoadingState />
          ) : users.isError ? (
            <ErrorState
              message={errorMessage(users.error)}
              onRetry={() => users.refetch()}
            />
          ) : (
            <EmptyState icon="people-outline" title="No one found" />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  title: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text},
  search: {marginHorizontal: spacing.lg},
  selectedScroll: {flexGrow: 0},
  selected: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm},
  groupName: {marginHorizontal: spacing.lg},
  hint: {
    fontSize: font.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  grow: {flexGrow: 1},
});
