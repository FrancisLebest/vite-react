import React, {useMemo, useState} from 'react';
import {FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {errorMessage} from '../api';
import type {AppNotification, Conversation} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {useSheet} from '../components/Sheet';
import {NotificationRow} from '../components/NotificationRow';
import {
  Avatar,
  Badge,
  ChipRow,
  EmptyState,
  ErrorState,
  Icon,
  IconAvatar,
  IconButton,
  ListFooter,
  LoadingState,
  Screen,
  ScreenHeader,
  SearchInput,
  VerifiedBadge,
} from '../components/ui';
import {
  useConversations,
  useMuteConversation,
  useNotifications,
  useUnreadCounts,
} from '../query/messaging';
import type {TabScreenProps} from '../navigation/types';
import {colors, font, spacing, weight} from '../theme';
import {inboxTime, toMs} from '../utils/time';

type Filter = 'all' | 'messages' | 'notifications' | 'mentions';

type Row =
  | {type: 'conversation'; id: string; item: Conversation; ts: number}
  | {type: 'notification'; id: string; item: AppNotification; ts: number};

export default function InboxScreen({navigation}: TabScreenProps<'Inbox'>) {
  const [filter, setFilter] = useState<Filter>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const unread = useUnreadCounts();
  const conversations = useConversations();
  const notifications = useNotifications(filter !== 'messages');

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const convs: Row[] =
      filter === 'all' || filter === 'messages'
        ? conversations.items
            .filter(
              c =>
                !q ||
                c.title.toLowerCase().includes(q) ||
                (c.lastMessage?.text ?? '').toLowerCase().includes(q),
            )
            .map(c => ({
              type: 'conversation',
              id: `c-${c.id}`,
              item: c,
              ts: toMs(c.lastMessage?.createdAt ?? c.updatedAt),
            }))
        : [];
    const notifs: Row[] =
      filter === 'messages'
        ? []
        : notifications.items
            .filter(n => filter !== 'mentions' || n.type === 'mention')
            .filter(n => filter !== 'all' || n.type !== 'message')
            .filter(
              n =>
                !q ||
                n.text.toLowerCase().includes(q) ||
                n.actor.name.toLowerCase().includes(q),
            )
            .map(n => ({type: 'notification', id: `n-${n.id}`, item: n, ts: toMs(n.createdAt)}));
    return [...convs, ...notifs].sort((a, b) => b.ts - a.ts);
  }, [conversations.items, notifications.items, filter, query]);

  const loading =
    (filter === 'all' && (conversations.isLoading || notifications.isLoading)) ||
    (filter === 'messages' && conversations.isLoading) ||
    ((filter === 'notifications' || filter === 'mentions') && notifications.isLoading);
  const error =
    filter === 'messages' || filter === 'all' ? conversations.error : notifications.error;

  const loadMore = () => {
    if (filter !== 'notifications' && filter !== 'mentions') {
      conversations.loadMore();
    }
    if (filter !== 'messages') {
      notifications.loadMore();
    }
  };
  const refreshing = conversations.refreshing || notifications.refreshing;
  const refresh = () => {
    conversations.refresh();
    if (filter !== 'messages') {
      notifications.refresh();
    }
  };

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
              onPress={() => navigation.navigate('NewMessage')}
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
        badges={{messages: unread.conversations, notifications: unread.notifications}}
        style={styles.chips}
      />
      <FlatList
        data={rows}
        keyExtractor={r => r.id}
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.grow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={({item}) =>
          item.type === 'conversation' ? (
            <ConversationRow conversation={item.item} />
          ) : (
            <NotificationRow notification={item.item} />
          )
        }
        ListFooterComponent={
          <ListFooter loading={conversations.isFetchingNextPage || notifications.isFetchingNextPage} />
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : error && !rows.length ? (
            <ErrorState message={errorMessage(error)} onRetry={refresh} />
          ) : (
            <EmptyState
              icon={query ? 'search-outline' : 'mail-open-outline'}
              title={query ? 'No results' : 'All caught up'}
              message={
                query
                  ? `Nothing matches "${query}".`
                  : filter === 'messages' || filter === 'all'
                  ? 'Start a conversation with a classmate.'
                  : 'Nothing here yet.'
              }
              action={
                !query && (filter === 'messages' || filter === 'all')
                  ? {label: 'New message', onPress: () => navigation.navigate('NewMessage')}
                  : undefined
              }
            />
          )
        }
      />
    </Screen>
  );
}

function ConversationRow({conversation: c}: {conversation: Conversation}) {
  const {me} = useAuth();
  const {navigate} = useNavigation();
  const openSheet = useSheet();
  const mute = useMuteConversation();
  const other = !c.isGroup ? c.participants.find(p => p.id !== me?.id) : undefined;
  const last = c.lastMessage;
  const unread = c.unreadCount > 0;
  const fromMe = last?.sender.id === me?.id;
  const preview = last ? (last.text || (last.media ? '📷 Photo' : '')) : 'No messages yet';

  return (
    <Pressable
      onPress={() => navigate('Chat', {conversationId: c.id})}
      onLongPress={() =>
        openSheet({
          title: c.title,
          options: [
            {
              label: c.muted ? 'Unmute conversation' : 'Mute conversation',
              icon: c.muted ? 'notifications-outline' : 'notifications-off-outline',
              onPress: () => mute.mutate({id: c.id, muted: !c.muted}),
            },
          ],
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${c.title}${unread ? `, ${c.unreadCount} unread` : ''}`}
      accessibilityHint="Long press for options"
      style={({pressed}) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}>
      {c.isGroup && !c.avatarUrl ? (
        <IconAvatar name="people" size={52} filled />
      ) : (
        <Avatar uri={c.avatarUrl ?? other?.avatarUrl} name={c.title} size={52} />
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {c.title}
          </Text>
          {other?.verified ? <VerifiedBadge /> : null}
        </View>
        <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
          {fromMe ? 'You: ' : c.isGroup && last ? `${last.sender.name.split(' ')[0]}: ` : ''}
          {preview}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.time}>{last ? inboxTime(last.createdAt) : ''}</Text>
        <View style={styles.status}>
          {unread ? (
            <Badge count={c.unreadCount} style={styles.unreadBadge} />
          ) : c.muted ? (
            <Icon name="notifications-off-outline" size={16} color={colors.textMuted} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ml: {marginLeft: spacing.md},
  grow: {flexGrow: 1},
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
});
