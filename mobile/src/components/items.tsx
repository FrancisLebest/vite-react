import React from 'react';
import {Image, Pressable, Share, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useApp} from '../context/AppContext';
import type {Community, ContentItem, Post, User} from '../data/types';
import {colors, font, radius, shadow, spacing, weight} from '../theme';
import {formatCount} from '../utils/responsive';
import {timeAgo} from '../utils/time';
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
/* Content (video lesson) row                                          */
/* ------------------------------------------------------------------ */

export function ContentRow({item}: {item: ContentItem}) {
  const {getUser, state, dispatch} = useApp();
  const navigation = useNavigation();
  const author = getUser(item.authorId);
  const saved = !!state.bookmarked[item.id];
  return (
    <Pressable
      onPress={() => navigation.navigate('ContentDetail', {contentId: item.id})}
      style={({pressed}) => [styles.contentRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={item.title}>
      <View>
        <Image source={{uri: item.thumbnail}} style={styles.thumb} />
        <View style={styles.duration}>
          <Text style={styles.durationText}>{item.duration}</Text>
        </View>
      </View>
      <View style={styles.contentBody}>
        <Text style={styles.contentTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <Avatar uri={author.avatar} size={20} />
          <Text style={styles.meta} numberOfLines={1}>
            {author.name} · {formatCount(item.views)} views
          </Text>
        </View>
      </View>
      <IconButton
        name={saved ? 'bookmark' : 'bookmark-outline'}
        color={saved ? colors.primary : colors.text}
        size={20}
        label={saved ? 'Remove bookmark' : 'Bookmark'}
        onPress={() => dispatch({type: 'toggleBookmark', id: item.id})}
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* User row                                                            */
/* ------------------------------------------------------------------ */

export function UserRow({user, compact}: {user: User; compact?: boolean}) {
  const {state, dispatch} = useApp();
  const navigation = useNavigation();
  return (
    <Pressable
      onPress={() => navigation.navigate('UserProfile', {userId: user.id})}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <Avatar uri={user.avatar} size={52} />
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          {user.verified ? <VerifiedBadge /> : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {compact ? `@${user.handle}` : user.university}
        </Text>
        <Text style={styles.subMuted} numberOfLines={1}>
          {compact
            ? user.university
            : `${formatCount(user.followers)} Followers · ${
                user.mutual
              } Mutual`}
        </Text>
      </View>
      <FollowButton
        following={!!state.following[user.id]}
        onPress={() => dispatch({type: 'toggleFollow', userId: user.id})}
      />
    </Pressable>
  );
}

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
  const {state, dispatch} = useApp();
  const navigation = useNavigation();
  const joined = !!state.joined[community.id];
  return (
    <Pressable
      onPress={() =>
        navigation.navigate('CommunityDetail', {communityId: community.id})
      }
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <IconAvatar name={community.icon} color={community.color} size={48} />
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {community.name}
        </Text>
        <Text style={styles.sub}>
          {formatCount(community.members + (joined ? 1 : 0))} Members
        </Text>
      </View>
      {joinable ? (
        <JoinButton
          joined={joined}
          onPress={() =>
            dispatch({type: 'toggleJoin', communityId: community.id})
          }
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

export function CommunityCard({
  community,
  width,
}: {
  community: Community;
  width: number;
}) {
  const {state, dispatch} = useApp();
  const navigation = useNavigation();
  const joined = !!state.joined[community.id];
  return (
    <Pressable
      onPress={() =>
        navigation.navigate('CommunityDetail', {communityId: community.id})
      }
      style={[styles.card, {width}]}>
      <IconAvatar name={community.icon} color={community.color} size={44} />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {community.name}
      </Text>
      <Text style={styles.cardSub}>
        {formatCount(community.members)} Members
      </Text>
      <JoinButton
        joined={joined}
        onPress={() =>
          dispatch({type: 'toggleJoin', communityId: community.id})
        }
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Post card                                                           */
/* ------------------------------------------------------------------ */

export function PostCard({post}: {post: Post}) {
  const {getUser, state, dispatch} = useApp();
  const navigation = useNavigation();
  const author = getUser(post.authorId);
  const liked = !!state.liked[post.id];
  const saved = !!state.bookmarked[post.id];
  const commentCount = state.comments[post.id]?.length ?? 0;

  return (
    <View style={styles.post}>
      <View style={styles.postHeader}>
        <Pressable
          style={styles.postAuthor}
          onPress={() =>
            navigation.navigate('UserProfile', {userId: author.id})
          }>
          <Avatar uri={author.avatar} size={42} />
          <View style={styles.rowBody}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {author.name}
              </Text>
              {author.verified ? <VerifiedBadge /> : null}
            </View>
            <Text style={styles.subMuted} numberOfLines={1}>
              {author.university} · {timeAgo(post.createdAt)}
            </Text>
          </View>
        </Pressable>
        <IconButton name="ellipsis-horizontal" label="More options" size={20} />
      </View>

      <Text style={styles.postText}>{post.text}</Text>
      {post.hashtags.length ? (
        <Text style={styles.postTags}>
          {post.hashtags.map(h => `#${h}`).join(' ')}
        </Text>
      ) : null}

      {post.image ? (
        <Image source={{uri: post.image}} style={styles.postImage} />
      ) : null}

      {post.audio ? (
        <View style={styles.audioRow}>
          <View style={styles.audio}>
            <View style={styles.play}>
              <Icon name="play" size={16} color={colors.white} />
            </View>
            <Waveform />
            <Text style={styles.audioTime}>{post.audio.duration}</Text>
          </View>
          {post.audio.attachment ? (
            <Image
              source={{uri: post.audio.attachment}}
              style={styles.audioAttachment}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Action
          icon={liked ? 'heart' : 'heart-outline'}
          color={liked ? colors.danger : colors.text}
          label={String(post.likes + (liked ? 1 : 0))}
          a11y={liked ? 'Unlike' : 'Like'}
          onPress={() => dispatch({type: 'toggleLike', id: post.id})}
        />
        <Action
          icon="chatbubble-outline"
          label={String(commentCount)}
          a11y="Comments"
          onPress={() => navigation.navigate('Comments', {targetId: post.id})}
        />
        <Action
          icon="arrow-redo-outline"
          label={String(post.shares)}
          a11y="Share"
          onPress={() =>
            Share.share({message: post.text}).catch(() => undefined)
          }
        />
        <View style={styles.flex} />
        <IconButton
          name={saved ? 'bookmark' : 'bookmark-outline'}
          color={saved ? colors.primary : colors.text}
          size={20}
          label={saved ? 'Remove bookmark' : 'Bookmark'}
          onPress={() => dispatch({type: 'toggleBookmark', id: post.id})}
        />
      </View>
    </View>
  );
}

const BARS = [
  6, 12, 18, 10, 22, 14, 8, 16, 24, 12, 6, 14, 20, 10, 16, 8, 12, 18, 6, 10,
];
function Waveform() {
  return (
    <View style={styles.wave}>
      {BARS.map((h, i) => (
        <View key={i} style={[styles.bar, {height: h}]} />
      ))}
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  color = colors.text,
  a11y,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  a11y: string;
}) {
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

const styles = StyleSheet.create({
  pressed: {opacity: 0.7},
  flex: {flex: 1},
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    width: 112,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
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
    color: colors.white,
    fontSize: 10,
    fontWeight: weight.semibold,
  },
  contentBody: {flex: 1, marginLeft: spacing.md},
  contentTitle: {
    fontSize: font.md,
    fontWeight: weight.semibold,
    color: colors.text,
  },
  metaRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  meta: {
    fontSize: font.xs,
    color: colors.textSecondary,
    marginLeft: 6,
    flexShrink: 1,
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
    color: colors.text,
    marginRight: 4,
    flexShrink: 1,
  },
  sub: {fontSize: font.sm, color: colors.textSecondary, marginTop: 2},
  subMuted: {fontSize: font.xs, color: colors.textMuted, marginTop: 2},
  chevron: {marginLeft: spacing.sm},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    marginRight: spacing.md,
    ...shadow,
  },
  cardTitle: {
    fontSize: font.sm,
    fontWeight: weight.bold,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    minHeight: font.sm * 2.6,
  },
  cardSub: {
    fontSize: font.xs,
    color: colors.textSecondary,
    marginVertical: spacing.sm,
  },
  post: {
    backgroundColor: colors.white,
    paddingVertical: spacing.lg,
    borderBottomWidth: 6,
    borderBottomColor: colors.surface,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  postAuthor: {flex: 1, flexDirection: 'row', alignItems: 'center'},
  postText: {
    fontSize: font.md,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  postTags: {
    fontSize: font.md,
    color: colors.primaryLight,
    fontWeight: weight.semibold,
    paddingHorizontal: spacing.lg,
    marginTop: 2,
  },
  postImage: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
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
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    padding: spacing.sm,
  },
  play: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primaryLight,
  },
  audioTime: {
    fontSize: font.xs,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  audioAttachment: {
    width: 72,
    height: 52,
    borderRadius: radius.sm,
    marginLeft: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  action: {flexDirection: 'row', alignItems: 'center', marginRight: spacing.xl},
  actionText: {fontSize: font.sm, color: colors.text, marginLeft: 4},
});
