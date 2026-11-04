import React, {useRef, useState} from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {InfiniteData, useMutation, useQueryClient} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {api, errorMessage} from '../api';
import type {Comment, Page} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {confirmDestructive, useReport, useSheet} from '../components/Sheet';
import {
  Avatar,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListFooter,
  LoadingState,
  Screen,
} from '../components/ui';
import {isPost, patchEntities, removeFromPages} from '../query/cache';
import {useComments, usePost} from '../query/hooks';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../theme';
import {formatCount} from '../utils/responsive';
import {timeAgo} from '../utils/time';

const MAX = 1000;

export default function CommentsScreen({
  route,
  navigation,
}: RootScreenProps<'Comments'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const {postId} = route.params;
  const {me} = useAuth();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const openSheet = useSheet();
  const report = useReport();
  const post = usePost(postId);
  const comments = useComments(postId);
  const listRef = useRef<FlatList<Comment>>(null);
  const [text, setText] = useState('');

  const add = useMutation({
    mutationFn: (value: string) => api.posts.addComment(postId, value),
    onSuccess: c => {
      qc.setQueryData<InfiniteData<Page<Comment>>>(
        qk.comments(postId),
        data => {
          if (!data || !data.pages.length) {
            return data;
          }
          const pages = [...data.pages];
          const last = pages.length - 1;
          // Oldest-first list: only append when the last page is loaded.
          if (!pages[last].nextCursor) {
            pages[last] = {...pages[last], items: [...pages[last].items, c]};
          }
          return {...data, pages};
        },
      );
      patchEntities(qc, isPost(postId), o => ({
        ...o,
        commentCount: (o.commentCount as number) + 1,
      }));
      setText('');
      setTimeout(() => listRef.current?.scrollToEnd({animated: true}), 200);
    },
    onError: e => Alert.alert("Couldn't post comment", errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.posts.deleteComment(id),
    onSuccess: (_r, id) => {
      removeFromPages(qc, [qk.comments(postId)], id);
      patchEntities(qc, isPost(postId), o => ({
        ...o,
        commentCount: Math.max(0, (o.commentCount as number) - 1),
      }));
    },
    onError: e => Alert.alert('Delete failed', errorMessage(e)),
  });

  const submit = () => {
    const value = text.trim();
    if (!value || value.length > MAX || add.isLoading) {
      return;
    }
    add.mutate(value);
  };

  const onLongPress = (c: Comment) => {
    const canDelete = c.author.id === me?.id || post.data?.author.id === me?.id;
    openSheet({
      title: 'Comment',
      options: [
        ...(canDelete
          ? [
              {
                label: 'Delete comment',
                icon: 'trash-outline',
                destructive: true,
                onPress: async () => {
                  if (
                    await confirmDestructive(
                      'Delete comment?',
                      'This cannot be undone.',
                      'Delete',
                    )
                  ) {
                    remove.mutate(c.id);
                  }
                },
              },
            ]
          : []),
        ...(c.author.id !== me?.id
          ? [
              {
                label: 'Report comment',
                icon: 'flag-outline',
                destructive: true,
                onPress: () => report('comment', c.id),
              },
            ]
          : []),
      ],
    });
  };

  const total = post.data?.commentCount ?? comments.items.length;

  return (
    <Screen edges={Platform.OS === 'ios' ? [] : ['top']}>
      <View style={styles.header}>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">
          {formatCount(total)} Comments
        </Text>
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
          ref={listRef}
          data={comments.items}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={comments.loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({item}) => (
            <Pressable
              onLongPress={() => onLongPress(item)}
              delayLongPress={350}
              accessibilityHint="Long press for options"
              style={styles.comment}>
              <Pressable
                onPress={() =>
                  navigation.navigate('UserProfile', {userId: item.author.id})
                }
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.author.name}'s profile`}>
                <Avatar
                  uri={item.author.avatarUrl}
                  name={item.author.name}
                  size={36}
                />
              </Pressable>
              <View style={styles.body}>
                <Text style={styles.name}>
                  {item.author.name}{' '}
                  <Text style={styles.time}>· {timeAgo(item.createdAt)}</Text>
                </Text>
                <Text style={styles.text}>{item.text}</Text>
              </View>
              <IconButton
                name="ellipsis-horizontal"
                size={16}
                color={colors.textMuted}
                label="Comment options"
                onPress={() => onLongPress(item)}
              />
            </Pressable>
          )}
          ListFooterComponent={
            <ListFooter loading={comments.isFetchingNextPage} />
          }
          ListEmptyComponent={
            comments.isLoading ? (
              <LoadingState />
            ) : comments.isError ? (
              <ErrorState
                message={errorMessage(comments.error)}
                onRetry={() => comments.refetch()}
              />
            ) : (
              <EmptyState
                icon="chatbubbles-outline"
                title="No comments yet"
                message="Be the first to comment."
              />
            )
          }
        />
        <View
          style={[
            styles.composer,
            {paddingBottom: Math.max(insets.bottom, spacing.sm)},
          ]}>
          <Avatar uri={me?.avatarUrl} name={me?.name} size={36} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={submit}
            returnKeyType="send"
            maxLength={MAX}
            accessibilityLabel="Comment"
            underlineColorAndroid="transparent"
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim() || add.isLoading}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            style={[
              styles.send,
              (!text.trim() || add.isLoading) && styles.disabled,
            ]}>
            <Icon name="arrow-up" size={18} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  header: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginBottom: spacing.sm,
  },
  title: {fontSize: font.lg, fontWeight: weight.bold, color: c.text},
  close: {position: 'absolute', right: spacing.md, top: spacing.md},
  list: {padding: spacing.lg, flexGrow: 1},
  comment: {flexDirection: 'row', marginBottom: spacing.lg},
  body: {flex: 1, marginLeft: spacing.md},
  name: {fontSize: font.sm, fontWeight: weight.bold, color: c.text},
  time: {fontWeight: weight.regular, color: c.textMuted},
  text: {fontSize: font.md, color: c.text, marginTop: 2},
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  input: {
    flex: 1,
    height: 42,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    fontSize: font.md,
    color: c.text,
    paddingVertical: 0,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {opacity: 0.4},
}));
