import React, {useMemo, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {
  Avatar,
  Badge,
  ChipRow,
  EmptyState,
  Icon,
  IconAvatar,
  IconButton,
  Screen,
  ScreenHeader,
  SearchInput,
  VerifiedBadge,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {AppNotification, Conversation} from '../data/types';
import type {TabScreenProps} from '../navigation/types';
import {colors, font, spacing, weight} from '../theme';
import {inboxTime, timeAgo} from '../utils/time';

type Filter = 'all' | 'messages' | 'notifications' | 'mentions';

type Row =
  | {type: 'conversation'; item: Conversation; ts: number}
  | {type: 'notification'; item: AppNotification; ts: number};

export default function InboxScreen({navigation}: TabScreenProps<'Inbox'>) {
  const {state, getUser, unreadNotifications} = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const convs: Row[] = state.conversations
      .filter(c =>
        filter === 'all'
          ? true
          : filter === 'messages'
          ? c.kind === 'message'
          : filter === 'mentions'
          ? c.kind === 'mention'
          : false,
      )
      .filter(
        c =>
          !q ||
          c.title.toLowerCase().includes(q) ||
          c.messages.some(m => m.text.toLowerCase().includes(q)),
      )
      .map(c => ({
        type: 'conversation',
        item: c,
        ts: c.messages[c.messages.length - 1]?.createdAt ?? 0,
      }));
    const notifs: Row[] =
      filter === 'notifications'
        ? state.notifications
            .filter(
              n =>
                !q ||
                n.text.toLowerCase().includes(q) ||
                getUser(n.actorId).name.toLowerCase().includes(q),
            )
            .map(n => ({type: 'notification', item: n, ts: n.createdAt}))
        : [];
    return [...convs, ...notifs].sort((a, b) => b.ts - a.ts);
  }, [state.conversations, state.notifications, filter, query, getUser]);

  return (
    <Screen>
      <ScreenHeader
        title="Inbox"
        right={
          <>
            <IconButton
              name={searching ? 'close' : 'search'}
              label={searching ? 'Close search' : 'Search inbox'}
              onPress={() => {
                setSearching(s => !s);
                setQuery('');
              }}
            />
            <IconButton
              name="create-outline"
              label="New message"
              style={styles.ml}
              onPress={() => navigation.navigate('Users')}
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
          placeholder="Search messages"
          style={styles.search}
        />
      ) : null}
      <ChipRow
        items={[
          {key: 'all', label: 'All'},
          {key: 'messages', label: 'Messages'},
          {key: 'notifications', label: 'Notifications'},
          {key: 'mentions', label: 'Mentions'},
        ]}
        value={filter}
        onChange={setFilter}
        badges={{notifications: unreadNotifications}}
        style={styles.chips}
      />
      <FlatList
        data={rows}
        keyExtractor={r => r.item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({item}) =>
          item.type === 'conversation' ? (
            <ConversationRow conversation={item.item} />
          ) : (
            <NotificationRow notification={item.item} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon={query ? 'search-outline' : 'mail-open-outline'}
            title={query ? 'No results' : 'All caught up'}
            message={
              query ? `Nothing matches "${query}".` : 'Nothing here yet.'
            }
          />
        }
      />
    </Screen>
  );
}

function ConversationRow({conversation: c}: {conversation: Conversation}) {
  const {getUser} = useApp();
  const {navigate} = useNavigation();
  const user = c.userId ? getUser(c.userId) : undefined;
  const last = c.messages[c.messages.length - 1];
  const unread = c.unread > 0;
  return (
    <Pressable
      onPress={() => navigate('Chat', {conversationId: c.id})}
      style={({pressed}) => [
        styles.row,
        unread && styles.rowUnread,
        pressed && styles.pressed,
      ]}>
      {user ? (
        <Avatar uri={user.avatar} size={52} online={user.online} />
      ) : (
        <IconAvatar
          name={c.icon ?? 'people'}
          color={c.iconColor}
          size={52}
          filled={!c.isGroup || c.icon !== 'people'}
        />
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {c.title}
          </Text>
          {user?.verified ? <VerifiedBadge /> : null}
        </View>
        <Text
          style={[styles.preview, unread && styles.previewUnread]}
          numberOfLines={1}>
          {last?.fromMe ? 'You: ' : ''}
          {last?.text}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.time}>{last ? inboxTime(last.createdAt) : ''}</Text>
        <View style={styles.status}>
          {unread ? (
            <Badge count={c.unread} style={styles.unreadBadge} />
          ) : c.muted ? (
            <Icon
              name="notifications-off-outline"
              size={16}
              color={colors.textMuted}
            />
          ) : last?.fromMe ? null : (
            <Icon name="checkmark-done" size={16} color={colors.primaryLight} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function NotificationRow({notification: n}: {notification: AppNotification}) {
  const {getUser} = useApp();
  const {navigate} = useNavigation();
  const actor = getUser(n.actorId);
  return (
    <Pressable
      onPress={() => navigate('UserProfile', {userId: actor.id})}
      style={({pressed}) => [
        styles.row,
        !n.read && styles.rowUnread,
        pressed && styles.pressed,
      ]}>
      <View>
        <Avatar uri={actor.avatar} size={52} />
        <View style={styles.notifIcon}>
          <Icon name={n.icon} size={11} color={colors.white} />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.preview} numberOfLines={2}>
          <Text style={styles.title}>{actor.name} </Text>
          {n.text}
        </Text>
      </View>
      <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ml: {marginLeft: spacing.md},
  pressed: {opacity: 0.7},
  search: {marginHorizontal: spacing.lg, marginBottom: spacing.sm},
  chips: {paddingBottom: spacing.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowUnread: {backgroundColor: colors.primaryTint},
  body: {flex: 1, marginHorizontal: spacing.md},
  titleRow: {flexDirection: 'row', alignItems: 'center'},
  title: {
    fontSize: font.md,
    fontWeight: weight.bold,
    color: colors.text,
    marginRight: 4,
    flexShrink: 1,
  },
  preview: {fontSize: font.sm, color: colors.textSecondary, marginTop: 3},
  previewUnread: {color: colors.text, fontWeight: weight.medium},
  trailing: {alignItems: 'flex-end'},
  time: {fontSize: font.xs, color: colors.textMuted},
  status: {height: 20, marginTop: 6, justifyContent: 'center'},
  unreadBadge: {backgroundColor: colors.primary},
  notifIcon: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
