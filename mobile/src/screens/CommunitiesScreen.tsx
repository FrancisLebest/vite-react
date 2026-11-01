import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {errorMessage} from '../api';
import type {Community, CommunityKind} from '../api/types';
import {CommunityCard, CommunityRow} from '../components/items';
import {
  BackHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListFooter,
  LoadingState,
  PillButton,
  Screen,
  SectionHeader,
} from '../components/ui';
import {useCommunities} from '../query/hooks';
import {useUnreadCounts} from '../query/messaging';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {useResponsive} from '../utils/responsive';

type KindFilter = 'all' | CommunityKind;

export default function CommunitiesScreen({
  navigation,
}: RootScreenProps<'Communities'>) {
  const unread = useUnreadCounts();
  const {contentWidth} = useResponsive();
  const listRef = useRef<FlatList<Community>>(null);
  const [kind, setKind] = useState<KindFilter>('all');

  const popular = useCommunities({sort: 'popular'});
  const mine = useCommunities({mine: true, sort: 'recent'});
  const all = useCommunities({
    sort: 'recent',
    kind: kind === 'all' ? undefined : kind,
  });

  const cardWidth = Math.max(
    Math.min((contentWidth - spacing.lg) / 2.6, 160),
    120,
  );

  const refresh = async () => {
    await Promise.all([popular.refetch(), mine.refetch(), all.refresh()]);
  };

  const header = (
    <View>
      <LinearGradient
        colors={[colors.primaryLight, colors.primary]}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.hero}>
        <View style={styles.heroBody}>
          <Text style={styles.heroTitle}>
            Find Your University or School Community
          </Text>
          <Text style={styles.heroSub}>
            Join and connect with students like you
          </Text>
          <PillButton
            small
            title="Explore Communities"
            variant="outline"
            icon="arrow-forward"
            style={styles.heroBtn}
            onPress={() =>
              all.items.length &&
              listRef.current?.scrollToIndex({index: 0, animated: true})
            }
          />
        </View>
        <Icon name="school" size={84} color="rgba(255,255,255,0.9)" />
      </LinearGradient>

      <SectionHeader title="Popular Communities" />
      {popular.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : popular.isError ? (
        <ErrorState
          message={errorMessage(popular.error)}
          onRetry={() => popular.refetch()}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}>
          {popular.items.slice(0, 10).map(c => (
            <CommunityCard key={c.id} community={c} width={cardWidth} />
          ))}
        </ScrollView>
      )}

      <SectionHeader title="My Communities" />
      {mine.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : mine.items.length ? (
        mine.items.map(c => <CommunityRow key={c.id} community={c} />)
      ) : (
        <EmptyState
          icon="people-outline"
          title="You haven't joined any community"
          message="Join a community to see it here."
        />
      )}
      {mine.hasNextPage ? (
        <PillButton
          small
          variant="soft"
          title="Show more"
          onPress={mine.loadMore}
          style={styles.more}
        />
      ) : null}

      <SectionHeader title="All Communities" />
      <ChipRow
        items={[
          {key: 'all', label: 'All'},
          {key: 'university', label: 'Universities'},
          {key: 'faculty', label: 'Faculties'},
          {key: 'topic', label: 'Topics'},
        ]}
        value={kind}
        onChange={setKind}
        style={styles.kinds}
      />
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader
        title="Communities"
        right={
          <>
            <IconButton
              name="search"
              label="Search communities"
              onPress={() =>
                navigation.navigate('Search', {type: 'communities'})
              }
            />
            <IconButton
              name="notifications-outline"
              label="Notifications"
              badge={unread.notifications}
              onPress={() => navigation.navigate('Notifications')}
              style={styles.ml}
            />
          </>
        }
      />
      <FlatList
        ref={listRef}
        data={all.items}
        keyExtractor={c => c.id}
        renderItem={({item}) => <CommunityRow community={item} />}
        ListHeaderComponent={header}
        onEndReached={all.loadMore}
        onEndReachedThreshold={0.5}
        onScrollToIndexFailed={() => undefined}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={all.refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          all.isLoading ? (
            <LoadingState />
          ) : all.isError ? (
            <ErrorState
              message={errorMessage(all.error)}
              onRetry={() => all.refetch()}
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No communities yet"
              message="Create the first one!"
            />
          )
        }
        ListFooterComponent={<ListFooter loading={all.isFetchingNextPage} />}
      />
      <View style={styles.footer}>
        <PillButton
          title="Create a Community"
          icon="add-circle"
          onPress={() => navigation.navigate('CreateCommunity')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ml: {marginLeft: spacing.sm},
  scroll: {paddingBottom: spacing.xl},
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  heroBody: {flex: 1, marginRight: spacing.sm},
  heroTitle: {color: colors.white, fontSize: font.xl, fontWeight: weight.bold},
  heroSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: font.sm,
    marginTop: spacing.xs,
  },
  heroBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    borderColor: colors.white,
  },
  cards: {paddingHorizontal: spacing.lg, paddingBottom: spacing.sm},
  more: {alignSelf: 'center', marginTop: spacing.sm},
  kinds: {paddingBottom: spacing.sm},
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
