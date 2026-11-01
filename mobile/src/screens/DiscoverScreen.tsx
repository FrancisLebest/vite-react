import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ContentRow} from '../components/items';
import {
  ChipRow,
  EmptyState,
  Icon,
  IconButton,
  Logo,
  Screen,
  SectionHeader,
} from '../components/ui';
import {categories, contents, trendingTopics} from '../data/mock';
import type {CategoryId} from '../data/types';
import type {TabScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {useResponsive} from '../utils/responsive';

type Filter = 'all' | CategoryId;

const FILTERS: {key: Filter; label: string}[] = [
  {key: 'all', label: 'All'},
  ...categories
    .filter(c =>
      [
        'study-tips',
        'exams',
        'assignments',
        'math',
        'science',
        'programming',
      ].includes(c.id),
    )
    .map(c => ({key: c.id as Filter, label: c.label})),
];

const SHORTCUTS = [
  {key: 'Posts', label: 'Posts', icon: 'newspaper-outline'},
  {key: 'Users', label: 'Users', icon: 'people-outline'},
  {key: 'Communities', label: 'Communities', icon: 'school-outline'},
] as const;

export default function DiscoverScreen({
  navigation,
}: TabScreenProps<'Discover'>) {
  const [filter, setFilter] = useState<Filter>('all');
  const {contentWidth, gridColumns} = useResponsive();
  const tileWidth = (contentWidth - spacing.lg * 2) / gridColumns;

  const popular = useMemo(
    () =>
      contents
        .filter(c => filter === 'all' || c.category === filter)
        .sort((a, b) => b.views - a.views)
        .slice(0, 6),
    [filter],
  );

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
          onPress={() => navigation.navigate('Search', {})}
        />
      </View>

      <ChipRow items={FILTERS} value={filter} onChange={setFilter} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        <View style={styles.shortcuts}>
          {SHORTCUTS.map(s => (
            <Pressable
              key={s.key}
              onPress={() => navigation.navigate(s.key)}
              style={({pressed}) => [
                styles.shortcut,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button">
              <Icon name={s.icon} size={20} color={colors.primary} />
              <Text style={styles.shortcutText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader
          title="Trending Topics"
          emoji="🔥"
          onSeeAll={() => navigation.navigate('Search', {})}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topics}>
          {trendingTopics.map(t => (
            <Pressable
              key={t.id}
              style={[styles.topic, {width: tileWidth}]}
              onPress={() => navigation.navigate('Search', {category: t.id})}
              accessibilityRole="button"
              accessibilityLabel={t.label}>
              <View style={styles.topicIcon}>
                <Icon name={t.icon} size={24} color={colors.primary} />
              </View>
              <Text style={styles.topicLabel} numberOfLines={2}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <SectionHeader title="Popular Content" />
        {popular.length ? (
          popular.map(c => <ContentRow key={c.id} item={c} />)
        ) : (
          <EmptyState
            icon="search-outline"
            title="Nothing here yet"
            message="No popular content in this category. Try another one."
            action={{label: 'Show all', onPress: () => setFilter('all')}}
          />
        )}

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
  searchPlaceholder: {
    color: colors.textMuted,
    fontSize: font.md,
    marginLeft: spacing.sm,
    flex: 1,
  },
  scroll: {paddingBottom: spacing.xxl},
  shortcuts: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
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
  topicLabel: {
    fontSize: font.xs,
    color: colors.text,
    marginTop: 6,
    textAlign: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
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
  bannerTitle: {
    fontSize: font.md,
    fontWeight: weight.bold,
    color: colors.primary,
  },
  bannerSub: {fontSize: font.xs, color: colors.textSecondary, marginTop: 2},
});
