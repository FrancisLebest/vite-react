import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {PostCard} from '../components/items';
import {
  BackHeader,
  EmptyState,
  Icon,
  PillButton,
  Screen,
  SectionHeader,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {formatCount} from '../utils/responsive';

export default function CommunityDetailScreen({
  route,
  navigation,
}: RootScreenProps<'CommunityDetail'>) {
  const {state, dispatch} = useApp();
  const community = state.communities.find(
    c => c.id === route.params.communityId,
  );

  if (!community) {
    return (
      <Screen>
        <BackHeader title="Community" />
        <EmptyState
          icon="alert-circle-outline"
          title="This community no longer exists"
        />
      </Screen>
    );
  }

  const joined = !!state.joined[community.id];
  // Demo: show posts from the community's category of interest.
  const posts = state.posts.slice(0, 3);

  return (
    <Screen>
      <BackHeader title={community.name} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <LinearGradient
          colors={[community.color, colors.primaryDark]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name={community.icon} size={36} color={community.color} />
          </View>
          <Text style={styles.title}>{community.name}</Text>
          <Text style={styles.members}>
            {formatCount(community.members + (joined ? 1 : 0))} Members
          </Text>
        </LinearGradient>

        <Text style={styles.description}>{community.description}</Text>

        <View style={styles.actions}>
          <PillButton
            title={joined ? 'Joined' : 'Join Community'}
            icon={joined ? 'checkmark' : 'add'}
            variant={joined ? 'soft' : 'solid'}
            style={styles.flex}
            onPress={() =>
              dispatch({type: 'toggleJoin', communityId: community.id})
            }
          />
          {joined ? (
            <PillButton
              title="Post"
              icon="create-outline"
              variant="outline"
              style={styles.post}
              onPress={() => navigation.navigate('CreatePost')}
            />
          ) : null}
        </View>

        <SectionHeader title="Recent Discussions" />
        {joined ? (
          posts.map(p => <PostCard key={p.id} post={p} />)
        ) : (
          <EmptyState
            icon="lock-closed-outline"
            title="Join to see discussions"
            message="Members can read and post in this community."
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  scroll: {paddingBottom: spacing.xxxl},
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    padding: spacing.xl,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.white,
    fontSize: font.xxl,
    fontWeight: weight.bold,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  members: {color: 'rgba(255,255,255,0.85)', fontSize: font.md, marginTop: 4},
  description: {
    fontSize: font.md,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  post: {marginLeft: spacing.md},
});
