import React, {useState} from 'react';
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
import {Avatar, EmptyState, Icon, IconButton, Screen} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {formatCount} from '../utils/responsive';
import {timeAgo} from '../utils/time';

export default function CommentsScreen({
  route,
  navigation,
}: RootScreenProps<'Comments'>) {
  const {state, dispatch, getUser, me} = useApp();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const {targetId, baseCount = 0} = route.params;
  const comments = state.comments[targetId] ?? [];
  const total = baseCount + comments.length;

  const submit = () => {
    const value = text.trim();
    if (!value) {
      return;
    }
    dispatch({type: 'addComment', targetId, text: value});
    setText('');
  };

  return (
    <Screen edges={Platform.OS === 'ios' ? [] : ['top']}>
      <View style={styles.header}>
        <View style={styles.handle} />
        <Text style={styles.title}>{formatCount(total)} Comments</Text>
        <IconButton
          name="close"
          label="Close comments"
          onPress={() => navigation.goBack()}
          style={styles.close}
        />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
        <FlatList
          data={comments}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({item}) => {
            const author = getUser(item.authorId);
            return (
              <View style={styles.comment}>
                <Avatar uri={author.avatar} size={36} />
                <View style={styles.body}>
                  <Text style={styles.name}>
                    {author.name}{' '}
                    <Text style={styles.time}>· {timeAgo(item.createdAt)}</Text>
                  </Text>
                  <Text style={styles.text}>{item.text}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No comments yet"
              message="Be the first to comment."
            />
          }
        />
        <View
          style={[
            styles.composer,
            {paddingBottom: Math.max(insets.bottom, spacing.sm)},
          ]}>
          <Avatar uri={me.avatar} size={36} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={submit}
            returnKeyType="send"
            underlineColorAndroid="transparent"
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim()}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            style={[styles.send, !text.trim() && styles.disabled]}>
            <Icon name="arrow-up" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  header: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text},
  close: {position: 'absolute', right: spacing.md, top: spacing.md},
  list: {padding: spacing.lg, flexGrow: 1},
  comment: {flexDirection: 'row', marginBottom: spacing.lg},
  body: {flex: 1, marginLeft: spacing.md},
  name: {fontSize: font.sm, fontWeight: weight.bold, color: colors.text},
  time: {fontWeight: weight.regular, color: colors.textMuted},
  text: {fontSize: font.md, color: colors.text, marginTop: 2},
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    height: 42,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    fontSize: font.md,
    color: colors.text,
    paddingVertical: 0,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {opacity: 0.4},
});
