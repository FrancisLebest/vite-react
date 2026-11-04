import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import type {Post} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {categoryLabel} from '../constants/categories';
import {
  registerView,
  useSharePost,
  useToggleBookmark,
  useToggleFollow,
  useToggleLike,
} from '../query/hooks';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../theme';
import {formatCount} from '../utils/responsive';
import {usePostOptions} from './items';
import {Avatar, Icon, VerifiedBadge} from './ui';
import {VideoPlayer} from './VideoPlayer';

const DOUBLE_TAP_MS = 280;
const VIEW_AFTER_MS = 1500;

export interface VideoFeedItemProps {
  post: Post;
  height: number;
  /** visible page */
  active: boolean;
  /** visible or adjacent: keep the native player mounted (preload) */
  mounted: boolean;
  /** screen focused + app in foreground */
  canPlay: boolean;
  muted: boolean;
  onToggleMute: () => void;
  /** space reserved at the top for the overlay header */
  topInset: number;
}

/** Full-screen TikTok-style video page. */
export const VideoFeedItem = React.memo(function VideoFeedItem({
  post,
  height,
  active,
  mounted,
  canPlay,
  muted,
  onToggleMute,
  topInset,
}: VideoFeedItemProps) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  const {me} = useAuth();
  const like = useToggleLike();
  const bookmark = useToggleBookmark();
  const follow = useToggleFollow();
  const share = useSharePost();
  const options = usePostOptions();
  const [userPaused, setUserPaused] = useState(false);
  const author = post.author;
  const isMine = author.id === me?.id;

  // Reset manual pause when scrolled away.
  useEffect(() => {
    if (!active) {
      setUserPaused(false);
    }
  }, [active]);

  // Count a view after the video has been on screen for a moment.
  useEffect(() => {
    if (!active || !canPlay) {
      return;
    }
    const t = setTimeout(() => registerView(post.id), VIEW_AFTER_MS);
    return () => clearTimeout(t);
  }, [active, canPlay, post.id]);

  // Single tap = play/pause, double tap = like + heart burst.
  const heart = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
      }
    },
    [],
  );
  const onTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      if (!post.likedByMe) {
        like.mutate(post);
      }
      heart.setValue(0);
      Animated.sequence([
        Animated.spring(heart, {
          toValue: 1,
          useNativeDriver: true,
          friction: 4,
        }),
        Animated.timing(heart, {
          toValue: 0,
          duration: 250,
          delay: 300,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    lastTap.current = now;
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      setUserPaused(p => !p);
    }, DOUBLE_TAP_MS);
  }, [post, like, heart]);

  const media = post.media;
  const paused = !active || !canPlay || userPaused;

  return (
    <View style={[styles.page, {height}]}>
      <Pressable
        onPress={onTap}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={userPaused ? 'Play video' : 'Pause video'}
        accessibilityHint="Double tap quickly to like">
        {media?.kind === 'video' ? (
          <VideoPlayer
            uri={media.url}
            poster={media.thumbnailUrl}
            paused={paused}
            muted={muted}
            mount={mounted}
            showPausedIcon={active && userPaused}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noMedia]}>
            <Text style={styles.noMediaText}>{post.text}</Text>
          </View>
        )}
      </Pressable>

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
        style={styles.bottomShade}
        pointerEvents="none"
      />

      <Pressable
        style={[styles.tagChip, {top: topInset + spacing.sm}]}
        accessibilityRole="button"
        accessibilityLabel={`Category ${categoryLabel(post.category)}`}
        onPress={() =>
          navigation.navigate('Search', {category: post.category})
        }>
        <Icon name="school" size={14} color={colors.white} />
        <Text style={styles.tagText}>{categoryLabel(post.category)}</Text>
      </Pressable>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.burst,
          {
            opacity: heart,
            transform: [
              {
                scale: heart.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1.2],
                }),
              },
            ],
          },
        ]}>
        <Icon name="heart" size={110} color={colors.white} />
      </Animated.View>

      {/* Right action rail */}
      <View style={styles.rail}>
        <View>
          <Pressable
            onPress={() =>
              navigation.navigate('UserProfile', {userId: author.id})
            }
            accessibilityRole="button"
            accessibilityLabel={`Open ${author.name}'s profile`}>
            <Avatar uri={author.avatarUrl} name={author.name} size={48} ring />
          </Pressable>
          {!isMine ? (
            <Pressable
              onPress={() => follow.mutate(author)}
              accessibilityRole="button"
              accessibilityLabel={
                author.isFollowing
                  ? `Unfollow ${author.name}`
                  : `Follow ${author.name}`
              }
              hitSlop={6}
              style={[styles.plus, author.isFollowing && styles.plusFollowing]}>
              <Icon
                name={author.isFollowing ? 'checkmark' : 'add'}
                size={12}
                color={colors.white}
              />
            </Pressable>
          ) : null}
        </View>
        <RailAction
          icon={post.likedByMe ? 'heart' : 'heart-outline'}
          color={post.likedByMe ? colors.danger : colors.white}
          label={formatCount(post.likeCount)}
          a11y={post.likedByMe ? 'Unlike' : 'Like'}
          onPress={() => like.mutate(post)}
        />
        <RailAction
          icon="chatbubble-ellipses"
          label={formatCount(post.commentCount)}
          a11y="Comments"
          onPress={() => navigation.navigate('Comments', {postId: post.id})}
        />
        <RailAction
          icon={post.bookmarkedByMe ? 'bookmark' : 'bookmark-outline'}
          color={post.bookmarkedByMe ? '#FFD54A' : colors.white}
          label={formatCount(post.bookmarkCount)}
          a11y={post.bookmarkedByMe ? 'Remove bookmark' : 'Bookmark'}
          onPress={() => bookmark.mutate(post)}
        />
        <RailAction
          icon="arrow-redo"
          label={formatCount(post.shareCount)}
          a11y="Share"
          onPress={() => share(post)}
        />
        <RailAction
          icon={muted ? 'volume-mute' : 'volume-high'}
          label={muted ? 'Muted' : 'Sound'}
          a11y={muted ? 'Unmute' : 'Mute'}
          onPress={onToggleMute}
        />
        <RailAction
          icon="ellipsis-horizontal"
          label=""
          a11y="More options"
          onPress={() => options(post)}
        />
      </View>

      {/* Caption */}
      <View style={styles.caption} pointerEvents="box-none">
        <View style={styles.authorRow}>
          <Pressable
            style={styles.authorTap}
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate('UserProfile', {userId: author.id})
            }>
            <Text style={styles.authorName} numberOfLines={1}>
              @{author.username}
            </Text>
            {author.verified ? <VerifiedBadge size={16} /> : null}
          </Pressable>
          {!isMine && !author.isFollowing ? (
            <Pressable
              onPress={() => follow.mutate(author)}
              style={styles.followOutline}
              accessibilityRole="button"
              accessibilityLabel={`Follow ${author.name}`}>
              <Text style={styles.followOutlineText}>Follow</Text>
            </Pressable>
          ) : null}
        </View>
        {post.text ? (
          <Text style={styles.captionText} numberOfLines={3}>
            {post.text}
          </Text>
        ) : null}
        {post.hashtags.length ? (
          <View style={styles.tags}>
            {post.hashtags.map(h => (
              <Text
                key={h}
                style={styles.hashtag}
                accessibilityRole="link"
                onPress={() => navigation.navigate('Search', {query: `#${h}`})}>
                #{h}
              </Text>
            ))}
          </View>
        ) : null}
        {post.community ? (
          <Pressable
            style={styles.soundRow}
            accessibilityRole="button"
            onPress={() =>
              post.community &&
              navigation.navigate('CommunityDetail', {
                communityId: post.community.id,
              })
            }>
            <Icon name="people" size={14} color={colors.white} />
            <Text style={styles.soundText} numberOfLines={1}>
              {post.community.name}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

function RailAction({
  icon,
  label,
  onPress,
  color: colorProp,
  a11y,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  a11y: string;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const color = colorProp ?? colors.white;
  return (
    <Pressable
      onPress={onPress}
      style={styles.railAction}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={a11y}>
      <Icon name={icon} size={30} color={color} style={styles.railIcon} />
      {label ? <Text style={styles.railLabel}>{label}</Text> : null}
    </Pressable>
  );
}

const textShadow = {
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: {width: 0, height: 1},
  textShadowRadius: 3,
};

const useStyles = makeStyles(c => ({
  page: {backgroundColor: c.black, justifyContent: 'flex-end'},
  noMedia: {
    backgroundColor: c.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  noMediaText: {color: c.white, fontSize: font.xl, textAlign: 'center'},
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  tagChip: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  tagText: {
    color: c.white,
    fontSize: font.sm,
    fontWeight: weight.semibold,
    marginLeft: 6,
  },
  burst: {position: 'absolute', alignSelf: 'center', top: '38%'},
  rail: {
    position: 'absolute',
    right: spacing.md,
    bottom: 110,
    alignItems: 'center',
  },
  plus: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusFollowing: {backgroundColor: c.success},
  railAction: {alignItems: 'center', marginTop: spacing.lg},
  railIcon: textShadow,
  railLabel: {
    color: c.white,
    fontSize: font.xs,
    fontWeight: weight.semibold,
    marginTop: 2,
    ...textShadow,
  },
  caption: {
    paddingLeft: spacing.lg,
    paddingRight: 84,
    paddingBottom: spacing.xl,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  authorTap: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  authorName: {
    color: c.white,
    fontSize: font.lg,
    fontWeight: weight.bold,
    marginRight: spacing.xs,
    flexShrink: 1,
    ...textShadow,
  },
  followOutline: {
    borderWidth: 1.5,
    borderColor: c.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginLeft: spacing.sm,
  },
  followOutlineText: {
    color: c.white,
    fontWeight: weight.semibold,
    fontSize: font.sm,
  },
  captionText: {color: c.white, fontSize: font.md, ...textShadow},
  tags: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 2},
  hashtag: {
    color: c.white,
    fontSize: font.md,
    fontWeight: weight.semibold,
    marginRight: spacing.xs,
    ...textShadow,
  },
  soundRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  soundText: {
    color: c.white,
    fontSize: font.sm,
    marginLeft: 6,
    ...textShadow,
  },
}));
