import React, {useRef} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {CommunityCard, CommunityRow} from '../components/items';
import {
  BackHeader,
  EmptyState,
  Icon,
  IconButton,
  PillButton,
  Screen,
  SectionHeader,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {useResponsive} from '../utils/responsive';

export default function CommunitiesScreen({
  navigation,
}: RootScreenProps<'Communities'>) {
  const {state, unreadNotifications} = useApp();
  const {contentWidth} = useResponsive();
  const scrollRef = useRef<ScrollView>(null);
  const popularY = useRef(0);

  const mine = state.communities.filter(c => state.joined[c.id]);
  const universities = state.communities.filter(c => c.kind !== 'topic');
  const popularTopics = state.communities
    .filter(c => c.kind === 'topic' && !state.joined[c.id])
    .sort((a, b) => b.members - a.members);

  // ~2.6 cards visible on phones, more on tablets
  const cardWidth = Math.max(
    Math.min((contentWidth - spacing.lg) / 2.6, 160),
    120,
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
              onPress={() => navigation.navigate('Search', {})}
            />
            <IconButton
              name="notifications-outline"
              label="Notifications"
              badge={unreadNotifications}
              onPress={() => navigation.navigate('Notifications')}
              style={styles.ml}
            />
          </>
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
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
                scrollRef.current?.scrollTo({
                  y: popularY.current,
                  animated: true,
                })
              }
            />
          </View>
          <Icon name="school" size={84} color="rgba(255,255,255,0.9)" />
        </LinearGradient>

        <View onLayout={e => (popularY.current = e.nativeEvent.layout.y)}>
          <SectionHeader title="Popular Communities" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cards}>
            {universities.map(c => (
              <CommunityCard key={c.id} community={c} width={cardWidth} />
            ))}
          </ScrollView>
        </View>

        <SectionHeader title="My Communities" />
        {mine.length ? (
          mine.map(c => <CommunityRow key={c.id} community={c} />)
        ) : (
          <EmptyState
            icon="people-outline"
            title="You haven't joined any community"
            message="Join a community to see it here."
          />
        )}

        {popularTopics.length ? (
          <>
            <SectionHeader title="Discover Topics" />
            {popularTopics.map(c => (
              <CommunityRow key={c.id} community={c} />
            ))}
          </>
        ) : null}
      </ScrollView>
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
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
