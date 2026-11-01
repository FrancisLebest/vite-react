import React from 'react';
import {
  ImageBackground,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {ContentRow} from '../components/items';
import {
  Avatar,
  BackHeader,
  EmptyState,
  FollowButton,
  Icon,
  PillButton,
  Screen,
  SectionHeader,
  VerifiedBadge,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import {categories, contents} from '../data/mock';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {formatCount} from '../utils/responsive';

export default function ContentDetailScreen({
  route,
  navigation,
}: RootScreenProps<'ContentDetail'>) {
  const {getUser, state, dispatch} = useApp();
  const item = contents.find(c => c.id === route.params.contentId);
  if (!item) {
    return (
      <Screen>
        <BackHeader />
        <EmptyState icon="alert-circle-outline" title="Content not found" />
      </Screen>
    );
  }
  const author = getUser(item.authorId);
  const saved = !!state.bookmarked[item.id];
  const liked = !!state.liked[item.id];
  const category = categories.find(c => c.id === item.category);
  const related = contents
    .filter(c => c.category === item.category && c.id !== item.id)
    .slice(0, 4);

  return (
    <Screen>
      <BackHeader title={category?.label ?? 'Lesson'} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ImageBackground
          source={{uri: item.thumbnail}}
          style={styles.player}
          imageStyle={styles.playerImg}>
          <Pressable
            style={styles.playBtn}
            accessibilityRole="button"
            accessibilityLabel="Play video">
            <Icon name="play" size={34} color={colors.white} />
          </Pressable>
          <View style={styles.duration}>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
        </ImageBackground>

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.views}>{formatCount(item.views)} views</Text>

        <View style={styles.actions}>
          <PillButton
            small
            variant={liked ? 'solid' : 'soft'}
            icon={liked ? 'heart' : 'heart-outline'}
            title="Like"
            onPress={() => dispatch({type: 'toggleLike', id: item.id})}
          />
          <PillButton
            small
            variant={saved ? 'solid' : 'soft'}
            icon={saved ? 'bookmark' : 'bookmark-outline'}
            title={saved ? 'Saved' : 'Save'}
            style={styles.ml}
            onPress={() => dispatch({type: 'toggleBookmark', id: item.id})}
          />
          <PillButton
            small
            variant="soft"
            icon="arrow-redo-outline"
            title="Share"
            style={styles.ml}
            onPress={() =>
              Share.share({message: item.title}).catch(() => undefined)
            }
          />
        </View>

        <Pressable
          style={styles.author}
          onPress={() =>
            navigation.navigate('UserProfile', {userId: author.id})
          }>
          <Avatar uri={author.avatar} size={44} />
          <View style={styles.authorBody}>
            <View style={styles.row}>
              <Text style={styles.authorName}>{author.name}</Text>
              {author.verified ? <VerifiedBadge /> : null}
            </View>
            <Text style={styles.meta}>
              {formatCount(author.followers)} followers
            </Text>
          </View>
          <FollowButton
            following={!!state.following[author.id]}
            onPress={() => dispatch({type: 'toggleFollow', userId: author.id})}
          />
        </Pressable>

        {related.length ? (
          <>
            <SectionHeader title="Related Content" />
            {related.map(c => (
              <ContentRow key={c.id} item={c} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {paddingBottom: spacing.xxxl},
  player: {
    marginHorizontal: spacing.lg,
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
  },
  playerImg: {borderRadius: radius.lg},
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(59,31,168,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  duration: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    color: colors.white,
    fontSize: font.xs,
    fontWeight: weight.semibold,
  },
  title: {
    fontSize: font.xl,
    fontWeight: weight.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  meta: {fontSize: font.sm, color: colors.textSecondary, marginTop: 2},
  views: {
    fontSize: font.sm,
    color: colors.textSecondary,
    marginTop: 2,
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
});
