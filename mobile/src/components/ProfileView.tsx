import React, {useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {dmId, useApp} from '../context/AppContext';
import {contents} from '../data/mock';
import {colors, font, radius, spacing, weight} from '../theme';
import {formatCount} from '../utils/responsive';
import {CommunityRow, ContentRow, PostCard} from './items';
import {
  Avatar,
  ChipRow,
  EmptyState,
  FollowButton,
  PillButton,
  VerifiedBadge,
} from './ui';

type Tab = 'posts' | 'videos' | 'saved' | 'communities';

export default function ProfileView({userId}: {userId: string}) {
  const {state, me, getUser, dispatch} = useApp();
  const navigation = useNavigation();
  const user = getUser(userId);
  const isMe = user.id === me.id;
  const [tab, setTab] = useState<Tab>('posts');

  const following = !!state.following[user.id];
  const followers = user.followers + (following ? 1 : 0);
  const followingCount = isMe
    ? Object.values(state.following).filter(Boolean).length + user.following
    : user.following;

  const posts = state.posts.filter(p => p.authorId === user.id);
  const videos = contents.filter(c => c.authorId === user.id);
  const saved = [
    ...contents
      .filter(c => state.bookmarked[c.id])
      .map(c => ({kind: 'content' as const, c})),
  ];
  const savedPosts = state.posts.filter(p => state.bookmarked[p.id]);
  const myCommunities = state.communities.filter(c => state.joined[c.id]);

  const tabs: {key: Tab; label: string}[] = [
    {key: 'posts', label: 'Posts'},
    {key: 'videos', label: 'Videos'},
    ...(isMe
      ? ([
          {key: 'saved', label: 'Saved'},
          {key: 'communities', label: 'Communities'},
        ] as {key: Tab; label: string}[])
      : []),
  ];

  const openChat = () => {
    const existing = state.conversations.find(c => c.userId === user.id);
    if (existing) {
      navigation.navigate('Chat', {conversationId: existing.id});
      return;
    }
    dispatch({type: 'ensureConversation', user});
    navigation.navigate('Chat', {conversationId: dmId(user.id)});
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.cover} />
      <View style={styles.head}>
        <Avatar uri={user.avatar} size={96} ring style={styles.avatar} />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.name}</Text>
          {user.verified ? <VerifiedBadge size={18} /> : null}
        </View>
        <Text style={styles.handle}>
          @{user.handle} · {user.university}
        </Text>
        {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

        <View style={styles.stats}>
          <Stat value={formatCount(followers)} label="Followers" />
          <View style={styles.statDivider} />
          <Stat value={formatCount(followingCount)} label="Following" />
          <View style={styles.statDivider} />
          <Stat value={String(posts.length + videos.length)} label="Posts" />
        </View>

        <View style={styles.actions}>
          {isMe ? (
            <>
              <PillButton
                small
                title="Edit Profile"
                variant="outline"
                icon="create-outline"
                style={styles.actionBtn}
                onPress={() =>
                  Alert.alert(
                    'Edit profile',
                    'Profile editing will be available soon.',
                  )
                }
              />
              <PillButton
                small
                title="Communities"
                icon="people-outline"
                style={styles.actionBtn}
                onPress={() => navigation.navigate('Communities')}
              />
            </>
          ) : (
            <>
              <FollowButton
                following={following}
                onPress={() =>
                  dispatch({type: 'toggleFollow', userId: user.id})
                }
              />
              <PillButton
                small
                title="Message"
                variant="soft"
                icon="chatbubble-outline"
                style={styles.actionBtn}
                onPress={openChat}
              />
            </>
          )}
        </View>
      </View>

      <ChipRow items={tabs} value={tab} onChange={setTab} style={styles.tabs} />

      {tab === 'posts' &&
        (posts.length ? (
          posts.map(p => <PostCard key={p.id} post={p} />)
        ) : (
          <EmptyState
            icon="newspaper-outline"
            title="No posts yet"
            action={
              isMe
                ? {
                    label: 'Create a post',
                    onPress: () => navigation.navigate('CreatePost'),
                  }
                : undefined
            }
          />
        ))}
      {tab === 'videos' &&
        (videos.length ? (
          <View style={styles.listPad}>
            {videos.map(c => (
              <ContentRow key={c.id} item={c} />
            ))}
          </View>
        ) : (
          <EmptyState icon="videocam-outline" title="No videos yet" />
        ))}
      {tab === 'saved' &&
        (saved.length || savedPosts.length ? (
          <View style={styles.listPad}>
            {saved.map(s => (
              <ContentRow key={s.c.id} item={s.c} />
            ))}
            {savedPosts.map(p => (
              <PostCard key={p.id} post={p} />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="bookmark-outline"
            title="Nothing saved yet"
            message="Tap the bookmark icon on any content to save it here."
          />
        ))}
      {tab === 'communities' &&
        (myCommunities.length ? (
          myCommunities.map(c => <CommunityRow key={c.id} community={c} />)
        ) : (
          <EmptyState icon="people-outline" title="No communities yet" />
        ))}
    </ScrollView>
  );
}

function Stat({value, label}: {value: string; label: string}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {paddingBottom: spacing.xxxl},
  cover: {
    height: 96,
    backgroundColor: colors.primarySoft,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  head: {alignItems: 'center', paddingHorizontal: spacing.lg},
  avatar: {marginTop: -48},
  nameRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.md},
  name: {
    fontSize: font.xxl,
    fontWeight: weight.bold,
    color: colors.text,
    marginRight: 6,
  },
  handle: {
    fontSize: font.sm,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  bio: {
    fontSize: font.md,
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    alignSelf: 'stretch',
  },
  stat: {flex: 1, alignItems: 'center'},
  statValue: {fontSize: font.xl, fontWeight: weight.bold, color: colors.text},
  statLabel: {fontSize: font.xs, color: colors.textSecondary, marginTop: 2},
  statDivider: {width: 1, height: 28, backgroundColor: colors.border},
  actions: {flexDirection: 'row', marginTop: spacing.lg},
  actionBtn: {marginHorizontal: spacing.xs},
  tabs: {marginTop: spacing.lg, paddingBottom: spacing.sm},
  listPad: {paddingTop: spacing.sm},
});
