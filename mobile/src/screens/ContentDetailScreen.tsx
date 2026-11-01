import React, {useEffect, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import {errorMessage} from '../api';
import type {Post} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {PostCard, usePostOptions} from '../components/items';
import {
  Avatar,
  BackHeader,
  ErrorState,
  FollowButton,
  IconButton,
  LoadingState,
  PillButton,
  Screen,
  SectionHeader,
  VerifiedBadge,
} from '../components/ui';
import {VideoPlayer} from '../components/VideoPlayer';
import {categoryLabel} from '../constants/categories';
import {
  registerView,
  useComments,
  usePost,
  useSharePost,
  useToggleBookmark,
  useToggleFollow,
  useToggleLike,
} from '../query/hooks';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {useAppActive} from '../utils/hooks';
import {formatCount, useResponsive} from '../utils/responsive';
import {timeAgo} from '../utils/time';

export default function ContentDetailScreen({
  route,
  navigation,
}: RootScreenProps<'ContentDetail'>) {
  const {postId} = route.params;
  const q = usePost(postId);
  const options = usePostOptions();
  const post = q.data;

  useEffect(() => {
    if (post) {
      registerView(post.id);
    }
  }, [post]);

  return (
    <Screen>
      <BackHeader
        title={post ? categoryLabel(post.category) : ''}
        right={
          post ? (
            <IconButton
              name="ellipsis-horizontal"
              label="More options"
              onPress={() => options(post, () => navigation.goBack())}
            />
          ) : null
        }
      />
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !post ? (
        <ErrorState
          message={errorMessage(q.error)}
          onRetry={() => q.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => q.refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }>
          {post.type === 'video' && post.media?.kind === 'video' ? (
            <VideoDetail post={post} />
          ) : (
            <PostCard post={post} onDeleted={() => navigation.goBack()} />
          )}
          <CommentsPreview post={post} />
        </ScrollView>
      )}
    </Screen>
  );
}

function VideoDetail({post}: {post: Post}) {
  const navigation = useNavigation();
  const {me} = useAuth();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const {contentWidth, height} = useResponsive();
  const like = useToggleLike();
  const bookmark = useToggleBookmark();
  const follow = useToggleFollow();
  const share = useSharePost();
  const [paused, setPaused] = useState(false);
  const media = post.media!;
  const ratio =
    media.width && media.height ? media.width / media.height : 9 / 16;
  const playerWidth = contentWidth - spacing.lg * 2;
  const playerHeight = Math.min(playerWidth / ratio, height * 0.62);
  const author = post.author;

  return (
    <View>
      <Pressable
        onPress={() => setPaused(p => !p)}
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Play video' : 'Pause video'}
        style={styles.playerWrap}>
        <VideoPlayer
          uri={media.url}
          poster={media.thumbnailUrl}
          paused={paused || !focused || !appActive}
          resizeMode="contain"
          showPausedIcon
          style={[styles.player, {height: playerHeight}]}
        />
      </Pressable>

      {post.text ? <Text style={styles.title}>{post.text}</Text> : null}
      {post.hashtags.length ? (
        <Text style={styles.tags}>
          {post.hashtags.map(h => `#${h}`).join(' ')}
        </Text>
      ) : null}
      <Text style={styles.views}>
        {formatCount(post.viewCount)} views · {timeAgo(post.createdAt)}
        {post.community ? ` · ${post.community.name}` : ''}
      </Text>

      <View style={styles.actions}>
        <PillButton
          small
          variant={post.likedByMe ? 'solid' : 'soft'}
          icon={post.likedByMe ? 'heart' : 'heart-outline'}
          title={formatCount(post.likeCount)}
          accessibilityLabel={post.likedByMe ? 'Unlike' : 'Like'}
          onPress={() => like.mutate(post)}
        />
        <PillButton
          small
          variant={post.bookmarkedByMe ? 'solid' : 'soft'}
          icon={post.bookmarkedByMe ? 'bookmark' : 'bookmark-outline'}
          title={post.bookmarkedByMe ? 'Saved' : 'Save'}
          style={styles.ml}
          onPress={() => bookmark.mutate(post)}
        />
        <PillButton
          small
          variant="soft"
          icon="arrow-redo-outline"
          title={formatCount(post.shareCount)}
          accessibilityLabel="Share"
          style={styles.ml}
          onPress={() => share(post)}
        />
      </View>

      <Pressable
        style={styles.author}
        accessibilityRole="button"
        onPress={() => navigation.navigate('UserProfile', {userId: author.id})}>
        <Avatar uri={author.avatarUrl} name={author.name} size={44} />
        <View style={styles.authorBody}>
          <View style={styles.row}>
            <Text style={styles.authorName}>{author.name}</Text>
            {author.verified ? <VerifiedBadge /> : null}
          </View>
          <Text style={styles.meta}>@{author.username}</Text>
        </View>
        {author.id !== me?.id ? (
          <FollowButton
            following={author.isFollowing}
            onPress={() => follow.mutate(author)}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

function CommentsPreview({post}: {post: Post}) {
  const navigation = useNavigation();
  const comments = useComments(post.id);
  const first = comments.items.slice(0, 3);
  return (
    <View>
      <SectionHeader
        title={`Comments (${formatCount(post.commentCount)})`}
        onSeeAll={() => navigation.navigate('Comments', {postId: post.id})}
      />
      {first.map(c => (
        <View key={c.id} style={styles.comment}>
          <Avatar uri={c.author.avatarUrl} name={c.author.name} size={32} />
          <View style={styles.commentBody}>
            <Text style={styles.commentName}>
              {c.author.name}{' '}
              <Text style={styles.commentTime}>· {timeAgo(c.createdAt)}</Text>
            </Text>
            <Text style={styles.commentText}>{c.text}</Text>
          </View>
        </View>
      ))}
      <PillButton
        small
        variant="soft"
        icon="chatbubble-outline"
        title={first.length ? 'View all & reply' : 'Add the first comment'}
        style={styles.commentBtn}
        onPress={() => navigation.navigate('Comments', {postId: post.id})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {paddingBottom: spacing.xxxl},
  playerWrap: {marginHorizontal: spacing.lg},
  player: {borderRadius: radius.lg},
  title: {
    fontSize: font.lg,
    fontWeight: weight.semibold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  tags: {
    fontSize: font.md,
    color: colors.primaryLight,
    fontWeight: weight.semibold,
    paddingHorizontal: spacing.lg,
    marginTop: 2,
  },
  meta: {fontSize: font.sm, color: colors.textSecondary, marginTop: 2},
  views: {
    fontSize: font.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  ml: {marginLeft: spacing.sm},
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
  },
  authorBody: {flex: 1, marginHorizontal: spacing.md},
  row: {flexDirection: 'row', alignItems: 'center'},
  authorName: {
    fontSize: font.md,
    fontWeight: weight.bold,
    color: colors.text,
    marginRight: 4,
  },
  comment: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  commentBody: {flex: 1, marginLeft: spacing.md},
  commentName: {fontSize: font.sm, fontWeight: weight.bold, color: colors.text},
  commentTime: {fontWeight: weight.regular, color: colors.textMuted},
  commentText: {fontSize: font.md, color: colors.text, marginTop: 2},
  commentBtn: {alignSelf: 'center', marginTop: spacing.sm},
});
