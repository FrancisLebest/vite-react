import React, {useState} from 'react';
import {Alert, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Video from 'react-native-video';
import {errorMessage} from '../api';
import type {Community, Post, User, UserSummary} from '../api/types';
import {useAuth} from '../auth/AuthContext';
import {mediaUrl} from '../config';
import {categoryLabel} from '../constants/categories';
import {
  useDeletePost,
  useSharePost,
  useToggleBookmark,
  useToggleFollow,
  useToggleJoin,
  useToggleLike,
} from '../query/hooks';
import {font, makeStyles, radius, shadowFor, spacing, useTheme, weight} from '../theme';
import {formatCount} from '../utils/responsive';
import {duration, timeAgo} from '../utils/time';
import {confirmDestructive, useReport, useSheet} from './Sheet';
import {
  Avatar,
  FollowButton,
  Icon,
  IconAvatar,
  IconButton,
  JoinButton,
  VerifiedBadge,
} from './ui';

/* ------------------------------------------------------------------ */
/* Post options (delete own / report)                                  */
/* ------------------------------------------------------------------ */

export function usePostOptions() {
  const {me} = useAuth();
  const openSheet = useSheet();
  const report = useReport();
  const del = useDeletePost();
  const navigation = useNavigation();
  return (post: Post, onDeleted?: () => void) => {
    const mine = post.author.id === me?.id;
    openSheet({
      title: post.type === 'video' ? 'Video' : 'Post',
      options: mine
        ? [
            {
              label: 'Delete',
              icon: 'trash-outline',
              destructive: true,
              onPress: async () => {
                const ok = await confirmDestructive(
                  `Delete this ${post.type}?`,
                  'This cannot be undone.',
                  'Delete',
                );
                if (ok) {
                  del.mutate(post.id, {
                    onSuccess: onDeleted,
                    onError: e => Alert.alert('Delete failed', errorMessage(e)),
                  });
                }
              },
            },
          ]
        : [
            {
              label: `View @${post.author.username}`,
              icon: 'person-outline',
              onPress: () =>
                navigation.navigate('UserProfile', {userId: post.author.id}),
            },
            {
              label: 'Report',
              icon: 'flag-outline',
              destructive: true,
              onPress: () => report('post', post.id),
            },
          ],
    });
  };
}

/* ------------------------------------------------------------------ */
/* Content (video lesson) row                                          */
/* ------------------------------------------------------------------ */

export function ContentRow({item}: {item: Post}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  const bookmark = useToggleBookmark();
  const saved = item.bookmarkedByMe;
  const thumb = mediaUrl(
    item.media?.thumbnailUrl ??
      (item.media?.kind === 'image' ? item.media.url : null),
  );
  const title = item.text || categoryLabel(item.category);
  return (
    <Pressable
      onPress={() => navigation.navigate('ContentDetail', {postId: item.id})}
      style={({pressed}) => [styles.contentRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View>
        {thumb ? (
          <Image source={{uri: thumb}} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbIcon]}>
            <Icon
              name={item.type === 'video' ? 'play' : 'document-text-outline'}
              size={24}
              color={colors.primary}
            />
          </View>
        )}
        {item.media?.durationSec ? (
          <View style={styles.duration}>
            <Text style={styles.durationText}>
              {duration(item.media.durationSec)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.contentBody}>
        <Text style={styles.contentTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <Avatar
            uri={item.author.avatarUrl}
            name={item.author.name}
            size={20}
          />
          <Text style={styles.meta} numberOfLines={1}>
            {item.author.name} · {formatCount(item.viewCount)} views
          </Text>
        </View>
      </View>
      <IconButton
        name={saved ? 'bookmark' : 'bookmark-outline'}
        color={saved ? colors.primary : colors.text}
        size={20}
        label={saved ? 'Remove bookmark' : 'Bookmark'}
        onPress={() => bookmark.mutate(item)}
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Grid tile (TikTok-style 3-column profile grid)                      */
/* ------------------------------------------------------------------ */

export function GridTile({post, size}: {post: Post; size: number}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  const thumb = mediaUrl(
    post.media?.thumbnailUrl ??
      (post.media?.kind === 'image' ? post.media.url : null),
  );
  return (
    <Pressable
      onPress={() => navigation.navigate('ContentDetail', {postId: post.id})}
      style={[styles.tile, {width: size, height: size * 1.33}]}
      accessibilityRole="button"
      accessibilityLabel={post.text || 'Open video'}>
      {thumb ? (
        <Image source={{uri: thumb}} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tileText]}>
          <Text style={styles.tileCaption} numberOfLines={5}>
            {post.text}
          </Text>
        </View>
      )}
      <View style={styles.tileViews}>
        <Icon name="play-outline" size={12} color={colors.white} />
        <Text style={styles.tileViewsText}>{formatCount(post.viewCount)}</Text>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* User row                                                            */
/* ------------------------------------------------------------------ */

export function UserRow({
  user,
  compact,
  right,
  onPress,
}: {
  user: UserSummary | User;
  compact?: boolean;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const navigation = useNavigation();
  const {me} = useAuth();
  const follow = useToggleFollow();
  const full = 'followerCount' in user ? user : null;
  const isMe = user.id === me?.id;
  return (
    <Pressable
      onPress={
        onPress ?? (() => navigation.navigate('UserProfile', {userId: user.id}))
      }
      accessibilityRole="button"
      accessibilityLabel={user.name}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <Avatar uri={user.avatarUrl} name={user.name} size={52} />
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          {user.verified ? <VerifiedBadge /> : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {compact || !user.university ? `@${user.username}` : user.university}
        </Text>
        <Text style={styles.subMuted} numberOfLines={1}>
          {full && !compact
            ? `${formatCount(full.followerCount)} Followers · ${
                full.mutualCount
              } Mutual`
            : user.university ?? roleLabel(user.role)}
        </Text>
      </View>
      {right !== undefined ? (
        right
      ) : isMe ? null : (
        <FollowButton
          following={user.isFollowing}
          onPress={() => follow.mutate(user)}
        />
      )}
    </Pressable>
  );
}

const roleLabel = (r: UserSummary['role']) =>
  r === 'professor' ? 'Professor' : r === 'creator' ? 'Creator' : 'Student';

/* ------------------------------------------------------------------ */
/* Community row + card                                                */
/* ------------------------------------------------------------------ */

export function CommunityRow({
  community,
  showChevron = true,
  joinable = true,
}: {
  community: Community;
  showChevron?: boolean;
  joinable?: boolean;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  const join = useToggleJoin();
  return (
    <Pressable
      onPress={() =>
        navigation.navigate('CommunityDetail', {communityId: community.id})
      }
      accessibilityRole="button"
      accessibilityLabel={community.name}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <CommunityAvatar community={community} size={48} />
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {community.name}
        </Text>
        <Text style={styles.sub}>
          {formatCount(community.memberCount)} Members
        </Text>
      </View>
      {joinable && !community.isOwner ? (
        <JoinButton
          joined={community.isMember}
          onPress={() => join.mutate(community)}
        />
      ) : null}
      {showChevron ? (
        <Icon
          name="chevron-forward"
          size={18}
          color={colors.text}
          style={styles.chevron}
        />
      ) : null}
    </Pressable>
  );
}

export function CommunityAvatar({
  community,
  size,
}: {
  community: Community;
  size: number;
}) {
  const {colors} = useTheme();
  const uri = mediaUrl(community.avatarUrl);
  if (uri) {
    return (
      <Image
        source={{uri}}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primarySoft,
        }}
      />
    );
  }
  return (
    <IconAvatar
      name={community.icon || 'people'}
      color={community.color}
      size={size}
    />
  );
}

export function CommunityCard({
  community,
  width,
}: {
  community: Community;
  width: number;
}) {
  const styles = useStyles();
  const navigation = useNavigation();
  const join = useToggleJoin();
  return (
    <Pressable
      onPress={() =>
        navigation.navigate('CommunityDetail', {communityId: community.id})
      }
      accessibilityRole="button"
      accessibilityLabel={community.name}
      style={[styles.card, {width}]}>
      <CommunityAvatar community={community} size={44} />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {community.name}
      </Text>
      <Text style={styles.cardSub}>
        {formatCount(community.memberCount)} Members
      </Text>
      {community.isOwner ? (
        <Text style={styles.owner}>Owner</Text>
      ) : (
        <JoinButton
          joined={community.isMember}
          onPress={() => join.mutate(community)}
        />
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Post card                                                           */
/* ------------------------------------------------------------------ */

export function PostCard({
  post,
  onDeleted,
}: {
  post: Post;
  onDeleted?: () => void;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const navigation = useNavigation();
  const like = useToggleLike();
  const bookmark = useToggleBookmark();
  const share = useSharePost();
  const options = usePostOptions();
  const author = post.author;
  const image =
    post.media?.kind === 'image' ? mediaUrl(post.media.url) : undefined;
  const videoThumb =
    post.media?.kind === 'video'
      ? mediaUrl(post.media.thumbnailUrl)
      : undefined;

  return (
    <View style={styles.post}>
      <View style={styles.postHeader}>
        <Pressable
          style={styles.postAuthor}
          accessibilityRole="button"
          accessibilityLabel={`Open ${author.name}'s profile`}
          onPress={() =>
            navigation.navigate('UserProfile', {userId: author.id})
          }>
          <Avatar uri={author.avatarUrl} name={author.name} size={42} />
          <View style={styles.rowBody}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {author.name}
              </Text>
              {author.verified ? <VerifiedBadge /> : null}
            </View>
            <Text style={styles.subMuted} numberOfLines={1}>
              {[
                author.university,
                post.community?.name,
                timeAgo(post.createdAt),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </Pressable>
        <IconButton
          name="ellipsis-horizontal"
          label="More options"
          size={20}
          onPress={() => options(post, onDeleted)}
        />
      </View>

      <Pressable
        onPress={() => navigation.navigate('ContentDetail', {postId: post.id})}>
        {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
        {post.hashtags.length ? (
          <Text style={styles.postTags}>
            {post.hashtags.map(h => `#${h}`).join(' ')}
          </Text>
        ) : null}
        {image ? (
          <Image source={{uri: image}} style={styles.postImage} />
        ) : null}
        {post.media?.kind === 'video' ? (
          <View style={styles.postImage}>
            {videoThumb ? (
              <Image
                source={{uri: videoThumb}}
                style={[StyleSheet.absoluteFill, styles.radius]}
              />
            ) : null}
            <View style={styles.playOverlay}>
              <Icon name="play" size={28} color={colors.white} />
            </View>
          </View>
        ) : null}
      </Pressable>
      {post.media?.kind === 'audio' ? (
        <AudioPlayer
          uri={post.media.url}
          durationSec={post.media.durationSec}
        />
      ) : null}

      <View style={styles.actions}>
        <Action
          icon={post.likedByMe ? 'heart' : 'heart-outline'}
          color={post.likedByMe ? colors.danger : colors.text}
          label={formatCount(post.likeCount)}
          a11y={post.likedByMe ? 'Unlike' : 'Like'}
          onPress={() => like.mutate(post)}
        />
        <Action
          icon="chatbubble-outline"
          label={formatCount(post.commentCount)}
          a11y="Comments"
          onPress={() => navigation.navigate('Comments', {postId: post.id})}
        />
        <Action
          icon="arrow-redo-outline"
          label={formatCount(post.shareCount)}
          a11y="Share"
          onPress={() => share(post)}
        />
        <View style={styles.flex} />
        <IconButton
          name={post.bookmarkedByMe ? 'bookmark' : 'bookmark-outline'}
          color={post.bookmarkedByMe ? colors.primary : colors.text}
          size={20}
          label={post.bookmarkedByMe ? 'Remove bookmark' : 'Bookmark'}
          onPress={() => bookmark.mutate(post)}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Audio (voice note) player                                           */
/* ------------------------------------------------------------------ */

const BARS = [
  6, 12, 18, 10, 22, 14, 8, 16, 24, 12, 6, 14, 20, 10, 16, 8, 12, 18, 6, 10,
];

export function AudioPlayer({
  uri,
  durationSec,
}: {
  uri: string;
  durationSec: number | null;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [total, setTotal] = useState(durationSec ?? 0);
  const src = mediaUrl(uri);
  const progress = total > 0 ? position / total : 0;
  return (
    <View style={styles.audioRow}>
      <View style={styles.audio}>
        <Pressable
          style={styles.play}
          onPress={() => setPlaying(p => !p)}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}>
          <Icon
            name={playing ? 'pause' : 'play'}
            size={16}
            color={colors.white}
          />
        </Pressable>
        <View style={styles.wave}>
          {BARS.map((h, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {height: h},
                i / BARS.length < progress && styles.barPlayed,
              ]}
            />
          ))}
        </View>
        <Text style={styles.audioTime}>
          {duration(playing ? position : total) || '0:00'}
        </Text>
      </View>
      {playing && src ? (
        <Video
          source={{uri: src}}
          audioOnly
          paused={!playing}
          playInBackground={false}
          ignoreSilentSwitch="ignore"
          style={styles.hidden}
          onLoad={d => setTotal(d.duration)}
          onProgress={p => setPosition(p.currentTime)}
          onEnd={() => {
            setPlaying(false);
            setPosition(0);
          }}
          onError={() => setPlaying(false)}
        />
      ) : null}
    </View>
  );
}

function Action({
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
  const color = colorProp ?? colors.text;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={a11y}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(c => ({
  pressed: {opacity: 0.7},
  flex: {flex: 1},
  radius: {borderRadius: radius.md},
  hidden: {width: 0, height: 0},
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: c.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  thumb: {
    width: 112,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: c.primarySoft,
  },
  thumbIcon: {alignItems: 'center', justifyContent: 'center'},
  duration: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: {
    color: c.white,
    fontSize: 10,
    fontWeight: weight.semibold,
  },
  contentBody: {flex: 1, marginLeft: spacing.md},
  contentTitle: {
    fontSize: font.md,
    fontWeight: weight.semibold,
    color: c.text,
  },
  metaRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  meta: {
    fontSize: font.xs,
    color: c.textSecondary,
    marginLeft: 6,
    flexShrink: 1,
  },
  tile: {
    backgroundColor: c.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.white,
    overflow: 'hidden',
  },
  tileText: {padding: spacing.sm, justifyContent: 'center'},
  tileCaption: {fontSize: font.xs, color: c.primary},
  tileViews: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileViewsText: {
    color: c.white,
    fontSize: font.xs,
    fontWeight: weight.semibold,
    marginLeft: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowBody: {flex: 1, marginHorizontal: spacing.md},
  nameRow: {flexDirection: 'row', alignItems: 'center'},
  name: {
    fontSize: font.md,
    fontWeight: weight.bold,
    color: c.text,
    marginRight: 4,
    flexShrink: 1,
  },
  sub: {fontSize: font.sm, color: c.textSecondary, marginTop: 2},
  subMuted: {fontSize: font.xs, color: c.textMuted, marginTop: 2},
  chevron: {marginLeft: spacing.sm},
  card: {
    backgroundColor: c.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
    alignItems: 'center',
    marginRight: spacing.md,
    ...shadowFor(c),
  },
  cardTitle: {
    fontSize: font.sm,
    fontWeight: weight.bold,
    color: c.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    minHeight: font.sm * 2.6,
  },
  cardSub: {
    fontSize: font.xs,
    color: c.textSecondary,
    marginVertical: spacing.sm,
  },
  owner: {
    fontSize: font.sm,
    color: c.primary,
    fontWeight: weight.semibold,
    height: 32,
    textAlignVertical: 'center',
    lineHeight: 32,
  },
  post: {
    backgroundColor: c.white,
    paddingVertical: spacing.lg,
    borderBottomWidth: 6,
    borderBottomColor: c.surface,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  postAuthor: {flex: 1, flexDirection: 'row', alignItems: 'center'},
  postText: {
    fontSize: font.md,
    color: c.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  postTags: {
    fontSize: font.md,
    color: c.primaryLight,
    fontWeight: weight.semibold,
    paddingHorizontal: spacing.lg,
    marginTop: 2,
  },
  postImage: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: c.primarySoft,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  audio: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.primaryTint,
    borderRadius: radius.pill,
    padding: spacing.sm,
  },
  play: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  bar: {
    flex: 1,
    marginHorizontal: 1,
    borderRadius: 2,
    backgroundColor: '#CFC6F3',
  },
  barPlayed: {backgroundColor: c.primaryLight},
  audioTime: {
    fontSize: font.xs,
    color: c.textSecondary,
    marginRight: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  action: {flexDirection: 'row', alignItems: 'center', marginRight: spacing.xl},
  actionText: {fontSize: font.sm, color: c.text, marginLeft: 4},
}));
