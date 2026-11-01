import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {errorMessage} from '../api';
import type {CategoryId, UserSummary} from '../api/types';
import {ContentRow} from '../components/items';
import {
  Avatar,
  ChipRow,
  EmptyState,
  ErrorState,
  FollowButton,
  Icon,
  IconButton,
  Logo,
  Screen,
  SectionHeader,
  VerifiedBadge,
} from '../components/ui';
import {
  useCategories,
  useFeed,
  useSuggestedUsers,
  useToggleFollow,
  useTrendingTopics,
} from '../query/hooks';
import type {TabScreenProps} from '../navigation/types';
import {colors, font, radius, shadow, spacing, weight} from '../theme';
import {formatCount, useResponsive} from '../utils/responsive';

type Filter = 'all' | CategoryId;

const SHORTCUTS = [
  {key: 'Posts', label: 'Posts', icon: 'newspaper-outline'},
  {key: 'Users', label: 'Users', icon: 'people-outline'},
  {key: 'Communities', label: 'Communities', icon: 'school-outline'},
] as const;

export default function DiscoverScreen({navigation}: TabScreenProps<'Discover'>) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const {contentWidth, gridColumns} = useResponsive();
  const tileWidth = (contentWidth - spacing.lg * 2) / gridColumns;
  const {categories} = useCategories();
  const trending = useTrendingTopics();
  const suggested = useSuggestedUsers();
  const popular = useFeed({
    tab: 'forYou',
    sort: 'popular',
    category: filter === 'all' ? undefined : filter,
  });
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries(['trending']),
      qc.invalidateQueries(['suggested']),
      popular.refetch(),
    ]);
    setRefreshing(false);
  };

  const filters: {key: Filter; label: string}[] = [
    {key: 'all', label: 'All'},
    ...categories.map(c => ({key: c.id as Filter, label: c.label})),
  ];

  return (
    <Screen>
      <View style={styles.top}>
        <Logo />
        <Pressable
          style={styles.searchFake}
          onPress={() => navigation.navigate('Search')}
          accessibilityRole="search"
          accessibilityLabel="Search for topics, courses">
          <Icon name="search" size={18} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>
            Search for topics, courses...
          </Text>
        </Pressable>
        <IconButton
          name="options-outline"
          label="Filters"
          onPress={() => navigation.navigate('Search', {openFilters: true})}
        />
      </View>

      <ChipRow items={filters} value={filter} onChange={setFilter} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }>
        <View style={styles.shortcuts}>
          {SHORTCUTS.map(s => (
            <Pressable
              key={s.key}
              onPress={() => navigation.navigate(s.key)}
              style={({pressed}) => [styles.shortcut, pressed && styles.pressed]}
              accessibilityRole="button">
              <Icon name={s.icon} size={20} color={colors.primary} />
              <Text style={styles.shortcutText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Trending Topics" emoji="🔥" />
        {trending.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : trending.isError ? (
          <InlineRetry onRetry={() => trending.refetch()} />
        ) : trending.data?.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topics}>
            {trending.data.map(t => (
              <Pressable
                key={t.id}
                style={[styles.topic, {width: tileWidth}]}
                onPress={() => navigation.navigate('Search', {category: t.id})}
                accessibilityRole="button"
                accessibilityLabel={`${t.label}, ${t.postCount} posts this week`}>
                <View style={styles.topicIcon}>
                  <Icon name={t.icon} size={24} color={colors.primary} />
                </View>
                <Text style={styles.topicLabel} numberOfLines={2}>
                  {t.label}
                </Text>
                <Text style={styles.topicCount}>{formatCount(t.postCount)} posts</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.muted}>No trending topics this week yet.</Text>
        )}

        <SectionHeader title="Popular Content" />
        {popular.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : popular.isError ? (
          <ErrorState message={errorMessage(popular.error)} onRetry={() => popular.refetch()} />
        ) : popular.items.length ? (
          popular.items.slice(0, 6).map(c => <ContentRow key={c.id} item={c} />)
        ) : (
          <EmptyState
            icon="search-outline"
            title="Nothing here yet"
            message="No popular content in this category. Try another one."
            action={filter !== 'all' ? {label: 'Show all', onPress: () => setFilter('all')} : undefined}
          />
        )}

        {suggested.data?.length ? (
          <>
            <SectionHeader title="Suggested for you" onSeeAll={() => navigation.navigate('Users')} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.topics}>
              {suggested.data.map(u => (
                <SuggestedUserCard key={u.id} user={u} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <Pressable
          style={({pressed}) => [styles.banner, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Communities')}
          accessibilityRole="button">
          <View style={styles.bannerIcon}>
            <Icon name="trophy" size={22} color={colors.primary} />
          </View>
          <View style={styles.bannerBody}>
            <Text style={styles.bannerTitle}>Join Our Study Community</Text>
            <Text style={styles.bannerSub}>Ask • Share • Learn Together</Text>
          </View>
          <Icon name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function InlineRetry({onRetry}: {onRetry: () => void}) {
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" style={styles.inlineRetry}>
      <Icon name="refresh" size={16} color={colors.primary} />
      <Text style={styles.inlineRetryText}>Couldn't load. Tap to retry.</Text>
    </Pressable>
  );
}

function SuggestedUserCard({user}: {user: UserSummary}) {
  const follow = useToggleFollow();
  const {navigate} = useNavigation();
  return (
    <Pressable
      style={styles.userCard}
      accessibilityRole="button"
      accessibilityLabel={user.name}
      onPress={() => navigate('UserProfile', {userId: user.id})}>
      <Avatar uri={user.avatarUrl} name={user.name} size={56} />
      <View style={styles.userName}>
        <Text style={styles.userNameText} numberOfLines={1}>
          {user.name}
        </Text>
        {user.verified ? <VerifiedBadge size={12} /> : null}
      </View>
      <Text style={styles.userSub} numberOfLines={1}>
        {user.university ?? `@${user.username}`}
      </Text>
      <FollowButton following={user.isFollowing} onPress={() => follow.mutate(user)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {opacity: 0.7},
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchFake: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
  },
  searchPlaceholder: {color: colors.textMuted, fontSize: font.md, marginLeft: spacing.sm, flex: 1},
  scroll: {paddingBottom: spacing.xxl},
  loader: {marginVertical: spacing.lg},
  muted: {color: colors.textSecondary, paddingHorizontal: spacing.lg, fontSize: font.sm},
  shortcuts: {flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.md},
  shortcut: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    marginHorizontal: spacing.xs,
  },
  shortcutText: {
    marginLeft: 6,
    color: colors.primary,
    fontWeight: weight.semibold,
    fontSize: font.sm,
  },
  topics: {paddingHorizontal: spacing.lg},
  topic: {alignItems: 'center'},
  topicIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicLabel: {fontSize: font.xs, color: colors.text, marginTop: 6, textAlign: 'center'},
  topicCount: {fontSize: 10, color: colors.textMuted, marginTop: 2},
  inlineRetry: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg},
  inlineRetryText: {color: colors.primary, marginLeft: spacing.xs, fontSize: font.sm},
  userCard: {
    width: 140,
    alignItems: 'center',
    padding: spacing.md,
    marginRight: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...shadow,
  },
  userName: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  userNameText: {
    fontSize: font.sm,
    fontWeight: weight.bold,
    color: colors.text,
    marginRight: 2,
    flexShrink: 1,
  },
  userSub: {fontSize: font.xs, color: colors.textSecondary, marginVertical: spacing.xs},
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: {flex: 1, marginHorizontal: spacing.md},
  bannerTitle: {fontSize: font.md, fontWeight: weight.bold, color: colors.primary},
  bannerSub: {fontSize: font.xs, color: colors.textSecondary, marginTop: 2},
});
