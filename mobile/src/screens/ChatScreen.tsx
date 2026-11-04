import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {errorMessage} from '../api';
import type {Message, UserSummary} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {useReport, useSheet} from '../components/Sheet';
import {
  Avatar,
  BackHeader,
  EmptyState,
  ErrorState,
  Icon,
  IconAvatar,
  IconButton,
  ListFooter,
  LoadingState,
  ProgressBar,
  Screen,
  VerifiedBadge,
} from '../components/ui';
import {mediaUrl} from '../config';
import {pickImage, takePhoto} from '../media/picker';
import {
  setActiveConversation,
  useConversation,
  useMarkConversationRead,
  useMessages,
  useMuteConversation,
  useReadReceipts,
  useSendMessage,
} from '../query/messaging';
import {useSocket} from '../realtime/SocketProvider';
import type {RootScreenProps} from '../navigation/types';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../theme';
import {clock, toMs} from '../utils/time';

const TYPING_THROTTLE_MS = 2000;
const TYPING_VISIBLE_MS = 3500;

export default function ChatScreen({
  route,
  navigation,
}: RootScreenProps<'Chat'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const {conversationId} = route.params;
  const {me} = useAuth();
  const insets = useSafeAreaInsets();
  const openSheet = useSheet();
  const report = useReport();
  const socket = useSocket();
  const conv = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId, me);
  const markRead = useMarkConversationRead();
  const mute = useMuteConversation();
  const reads = useReadReceipts(conversationId);
  const [text, setText] = useState('');
  const [typingUser, setTypingUser] = useState<UserSummary | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const lastTypingEmit = useRef(0);

  const c = conv.data;
  const other =
    c && !c.isGroup
      ? c.participants.find(p => p.id !== me?.id) ?? c.participants[0]
      : undefined;

  // This chat is "active" while focused: incoming messages are read immediately.
  const {mutate: markReadMutate} = markRead;
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(conversationId);
      markReadMutate(conversationId);
      return () => setActiveConversation(null);
    }, [conversationId, markReadMutate]),
  );

  // Mark read when a new message from someone else arrives while on screen.
  const newest = messages.items[0];
  useEffect(() => {
    if (
      newest &&
      newest.sender.id !== me?.id &&
      !newest.id.startsWith('tmp-')
    ) {
      markReadMutate(conversationId);
    }
  }, [newest, me?.id, conversationId, markReadMutate]);

  // Typing indicator from the socket.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = socket.onTyping((cid, user) => {
      if (cid !== conversationId) {
        return;
      }
      setTypingUser(user);
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => setTypingUser(null), TYPING_VISIBLE_MS);
    });
    return () => {
      off();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [socket, conversationId]);

  // A new message from the typing user hides the indicator.
  useEffect(() => {
    if (newest && typingUser && newest.sender.id === typingUser.id) {
      setTypingUser(null);
    }
  }, [newest, typingUser]);

  const onChangeText = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTypingEmit.current > TYPING_THROTTLE_MS) {
      lastTypingEmit.current = now;
      socket.emitTyping(conversationId);
    }
  };

  const sendText = () => {
    const value = text.trim();
    if (!value) {
      return;
    }
    setText('');
    send.mutate(
      {text: value},
      {
        onError: e => {
          setText(value);
          Alert.alert('Message not sent', errorMessage(e));
        },
      },
    );
  };

  const sendImage = async (source: 'library' | 'camera') => {
    const img =
      source === 'camera' ? await takePhoto(1280) : await pickImage(1280);
    if (!img) {
      return;
    }
    const caption = text.trim();
    setText('');
    setUploadProgress(0);
    send.mutate(
      {text: caption, media: img, onProgress: setUploadProgress},
      {
        onSettled: () => setUploadProgress(null),
        onError: e => {
          setText(caption);
          Alert.alert('Photo not sent', errorMessage(e));
        },
      },
    );
  };

  const attach = () =>
    openSheet({
      title: 'Send a photo',
      options: [
        {
          label: 'Choose from library',
          icon: 'images-outline',
          onPress: () => sendImage('library'),
        },
        {
          label: 'Take a photo',
          icon: 'camera-outline',
          onPress: () => sendImage('camera'),
        },
      ],
    });

  const options = () =>
    c &&
    openSheet({
      title: c.title,
      options: [
        {
          label: c.muted ? 'Unmute notifications' : 'Mute notifications',
          icon: c.muted ? 'notifications-outline' : 'notifications-off-outline',
          onPress: () => mute.mutate({id: c.id, muted: !c.muted}),
        },
        ...(other
          ? [
              {
                label: 'View profile',
                icon: 'person-outline',
                onPress: () =>
                  navigation.navigate('UserProfile', {userId: other.id}),
              },
              {
                label: `Report ${other.name}`,
                icon: 'flag-outline',
                destructive: true,
                onPress: () => report('user', other.id),
              },
            ]
          : []),
      ],
    });

  // "Seen" under my latest message when someone read after it (live receipts).
  const seenMessageId = useMemo(() => {
    const mine = messages.items.find(
      m => m.sender.id === me?.id && !m.id.startsWith('tmp-'),
    );
    if (!mine) {
      return null;
    }
    const readAfter = Object.values(reads).some(
      t => toMs(t) >= toMs(mine.createdAt),
    );
    return readAfter ? mine.id : null;
  }, [messages.items, reads, me?.id]);

  const renderItem = ({item, index}: {item: Message; index: number}) => {
    const fromMe = item.sender.id === me?.id;
    const pending = item.id.startsWith('tmp-');
    const prev = messages.items[index + 1]; // older (list is inverted)
    const showSender =
      c?.isGroup && !fromMe && prev?.sender.id !== item.sender.id;
    const img =
      item.media?.kind === 'image' ? mediaUrl(item.media.url) : undefined;
    return (
      <View style={[styles.bubbleWrap, fromMe ? styles.right : styles.left]}>
        {showSender ? (
          <Text style={styles.sender}>{item.sender.name}</Text>
        ) : null}
        {img ? (
          <Image
            source={{uri: img}}
            style={[styles.image, pending && styles.pending]}
          />
        ) : null}
        {item.text ? (
          <View
            style={[
              styles.bubble,
              fromMe ? styles.mine : styles.theirs,
              pending && styles.pending,
            ]}>
            <Text style={[styles.msg, fromMe && styles.msgMine]}>
              {item.text}
            </Text>
          </View>
        ) : null}
        <Text style={styles.time}>
          {pending ? 'Sending…' : clock(new Date(toMs(item.createdAt)))}
          {item.id === seenMessageId ? ' · Seen' : ''}
        </Text>
      </View>
    );
  };

  if (conv.isError && !c) {
    return (
      <Screen>
        <BackHeader title="Chat" />
        <ErrorState
          message={errorMessage(conv.error)}
          onRetry={() => conv.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <BackHeader
        right={
          c ? (
            <IconButton
              name="ellipsis-vertical"
              label="Conversation options"
              onPress={options}
            />
          ) : null
        }>
        <Pressable
          style={styles.headerTitle}
          disabled={!other}
          accessibilityRole="button"
          onPress={() =>
            other && navigation.navigate('UserProfile', {userId: other.id})
          }>
          {c?.isGroup && !c.avatarUrl ? (
            <IconAvatar name="people" size={38} filled />
          ) : (
            <Avatar
              uri={c?.avatarUrl ?? other?.avatarUrl}
              name={c?.title}
              size={38}
            />
          )}
          <View style={styles.headerBody}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>
                {c?.title ?? ''}
              </Text>
              {other?.verified ? <VerifiedBadge /> : null}
              {c?.muted ? (
                <Icon
                  name="notifications-off-outline"
                  size={14}
                  color={colors.textMuted}
                />
              ) : null}
            </View>
            <Text style={styles.status} numberOfLines={1}>
              {typingUser
                ? `${
                    c?.isGroup ? typingUser.name.split(' ')[0] + ' is ' : ''
                  }typing…`
                : c?.isGroup
                ? `${c.participants.length + 1} members`
                : other?.university ?? (other ? `@${other.username}` : '')}
            </Text>
          </View>
        </Pressable>
      </BackHeader>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}>
        {messages.isLoading ? (
          <LoadingState />
        ) : messages.isError && !messages.items.length ? (
          <ErrorState
            message={errorMessage(messages.error)}
            onRetry={() => messages.refetch()}
          />
        ) : (
          <FlatList
            data={messages.items}
            inverted
            keyExtractor={m => m.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={renderItem}
            onEndReached={messages.loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              <ListFooter loading={messages.isFetchingNextPage} />
            }
            ListEmptyComponent={
              <View style={styles.invert}>
                <EmptyState
                  icon="hand-left-outline"
                  title="Say hi 👋"
                  message="Start the conversation."
                />
              </View>
            }
          />
        )}
        {uploadProgress !== null ? (
          <View style={styles.upload}>
            <ProgressBar progress={uploadProgress} label="Sending photo" />
          </View>
        ) : null}
        <View
          style={[
            styles.composer,
            {paddingBottom: Math.max(insets.bottom, spacing.sm)},
          ]}>
          <IconButton
            name="image-outline"
            label="Send a photo"
            color={colors.primary}
            onPress={attach}
            style={styles.attach}
          />
          <TextInput
            value={text}
            onChangeText={onChangeText}
            placeholder="Write a message..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={4000}
            accessibilityLabel="Message"
            underlineColorAndroid="transparent"
          />
          <Pressable
            onPress={sendText}
            disabled={!text.trim()}
            style={[styles.send, !text.trim() && styles.sendDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Send message">
            <Icon name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  row: {flexDirection: 'row', alignItems: 'center'},
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  headerBody: {flex: 1, marginLeft: spacing.md},
  name: {
    fontSize: font.lg,
    fontWeight: weight.bold,
    color: c.text,
    marginRight: 4,
    flexShrink: 1,
  },
  status: {fontSize: font.xs, color: c.textSecondary},
  list: {padding: spacing.lg, flexGrow: 1},
  invert: {transform: [{scaleY: -1}]},
  bubbleWrap: {marginBottom: spacing.md, maxWidth: '80%'},
  left: {alignSelf: 'flex-start'},
  right: {alignSelf: 'flex-end', alignItems: 'flex-end'},
  sender: {
    fontSize: font.xs,
    color: c.textSecondary,
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  mine: {backgroundColor: c.primary, borderBottomRightRadius: 4},
  theirs: {backgroundColor: c.surface, borderBottomLeftRadius: 4},
  pending: {opacity: 0.6},
  image: {
    width: 220,
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: c.primarySoft,
    marginBottom: 4,
  },
  msg: {fontSize: font.md, color: c.text},
  msgMine: {color: c.white},
  time: {fontSize: 10, color: c.textMuted, marginTop: 2},
  upload: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xs},
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.white,
  },
  attach: {marginBottom: 8, marginRight: spacing.xs},
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 21,
    backgroundColor: c.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    fontSize: font.md,
    color: c.text,
    textAlignVertical: 'center',
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendDisabled: {opacity: 0.4},
}));
