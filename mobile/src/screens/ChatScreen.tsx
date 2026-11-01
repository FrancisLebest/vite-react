import React, {useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Avatar,
  BackHeader,
  EmptyState,
  Icon,
  IconAvatar,
  Screen,
  VerifiedBadge,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {clock} from '../utils/time';

export default function ChatScreen({
  route,
  navigation,
}: RootScreenProps<'Chat'>) {
  const {state, dispatch, getUser} = useApp();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const conv = state.conversations.find(
    c => c.id === route.params.conversationId,
  );
  const user = conv?.userId ? getUser(conv.userId) : undefined;

  useEffect(() => {
    if (conv && conv.unread > 0) {
      dispatch({type: 'markConversationRead', conversationId: conv.id});
    }
  }, [conv, dispatch]);

  const messages = useMemo(
    () => (conv ? [...conv.messages].reverse() : []),
    [conv],
  );

  if (!conv) {
    return (
      <Screen>
        <BackHeader title="Chat" />
        <EmptyState icon="chatbubbles-outline" title="Conversation not found" />
      </Screen>
    );
  }

  const send = () => {
    const value = text.trim();
    if (!value) {
      return;
    }
    dispatch({type: 'sendMessage', conversationId: conv.id, text: value});
    setText('');
  };

  return (
    <Screen edges={['top']}>
      <BackHeader>
        <Pressable
          style={styles.headerTitle}
          disabled={!user}
          onPress={() =>
            user && navigation.navigate('UserProfile', {userId: user.id})
          }>
          {user ? (
            <Avatar uri={user.avatar} size={38} online={user.online} />
          ) : (
            <IconAvatar
              name={conv.icon ?? 'people'}
              color={conv.iconColor}
              size={38}
              filled
            />
          )}
          <View style={styles.headerBody}>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>
                {conv.title}
              </Text>
              {user?.verified ? <VerifiedBadge /> : null}
            </View>
            <Text style={styles.status}>
              {user ? (user.online ? 'Online' : user.university) : 'Group'}
            </Text>
          </View>
        </Pressable>
      </BackHeader>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}>
        <FlatList
          data={messages}
          inverted
          keyExtractor={m => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({item}) => (
            <View
              style={[
                styles.bubbleWrap,
                item.fromMe ? styles.right : styles.left,
              ]}>
              <View
                style={[
                  styles.bubble,
                  item.fromMe ? styles.mine : styles.theirs,
                ]}>
                <Text style={[styles.msg, item.fromMe && styles.msgMine]}>
                  {item.text}
                </Text>
              </View>
              <Text style={styles.time}>{clock(new Date(item.createdAt))}</Text>
            </View>
          )}
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
        <View
          style={[
            styles.composer,
            {paddingBottom: Math.max(insets.bottom, spacing.sm)},
          ]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            underlineColorAndroid="transparent"
          />
          <Pressable
            onPress={send}
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

const styles = StyleSheet.create({
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
    color: colors.text,
    marginRight: 4,
    flexShrink: 1,
  },
  status: {fontSize: font.xs, color: colors.textSecondary},
  list: {padding: spacing.lg, flexGrow: 1},
  invert: {transform: [{scaleY: -1}]},
  bubbleWrap: {marginBottom: spacing.md, maxWidth: '80%'},
  left: {alignSelf: 'flex-start'},
  right: {alignSelf: 'flex-end', alignItems: 'flex-end'},
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  mine: {backgroundColor: colors.primary, borderBottomRightRadius: 4},
  theirs: {backgroundColor: colors.surface, borderBottomLeftRadius: 4},
  msg: {fontSize: font.md, color: colors.text},
  msgMine: {color: colors.white},
  time: {fontSize: 10, color: colors.textMuted, marginTop: 2},
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 21,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    fontSize: font.md,
    color: colors.text,
    textAlignVertical: 'center',
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendDisabled: {opacity: 0.4},
});
