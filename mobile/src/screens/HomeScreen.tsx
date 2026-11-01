import React, {useCallback, useRef, useState} from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {errorMessage} from '../api';
import type {FeedTab, Post} from '../api/types';
import {ErrorState, Icon, IconButton, LoadingState, Logo, PillButton} from '../components/ui';
import {VideoFeedItem} from '../components/VideoFeedItem';
import {useFeed} from '../query/hooks';
import {useUnreadCounts} from '../query/messaging';
import type {TabScreenProps} from '../navigation/types';
import {colors, font, spacing, weight} from '../theme';
import {useAppActive} from '../utils/hooks';

const HEADER_HEIGHT = 56;

export default function HomeScreen({navigation}: TabScreenProps<'Home'>) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const unread = useUnreadCounts();
  const [tab, setTab] = useState<FeedTab>('forYou');
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const listRef = useRef<FlatList<Post>>(null);

  const feed = useFeed({tab, type: 'video'});
  const topInset = insets.top + HEADER_HEIGHT;

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  const onViewableItemsChanged = useRef(({viewableItems}: {viewableItems: ViewToken[]}) => {
    if (viewableItems[0]?.index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const switchTab = (t: FeedTab) => {
    if (t === tab) {
      listRef.current?.scrollToOffset({offset: 0, animated: true});
      return;
    }
    setActiveIndex(0);
    setTab(t);
  };

  const toggleMute = useCallback(() => setMuted(m => !m), []);
  const canPlay = focused && appActive;

  const renderItem = useCallback(
    ({item, index}: {item: Post; index: number}) => (
      <VideoFeedItem
        post={item}
        height={height}
        active={index === activeIndex}
        mounted={Math.abs(index - activeIndex) <= 1}
        canPlay={canPlay}
        muted={muted}
        onToggleMute={toggleMute}
        topInset={topInset}
      />
    ),
    [height, activeIndex, canPlay, muted, toggleMute, topInset],
  );

  let body: React.ReactNode = null;
  if (height > 0) {
    if (feed.isLoading) {
      body = <LoadingState dark label="Loading videos" />;
    } else if (feed.isError && !feed.items.length) {
      body = (
        <ErrorState
          dark
          message={errorMessage(feed.error)}
          onRetry={() => feed.refetch()}
        />
      );
    } else {
      body = (
        <FlatList
          ref={listRef}
          key={tab}
          data={feed.items}
          keyExtractor={p => p.id}
          renderItem={renderItem}
          extraData={activeIndex}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={height}
          snapToAlignment="start"
          getItemLayout={(_, index) => ({length: height, offset: height * index, index})}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{itemVisiblePercentThreshold: 60}}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          onEndReached={feed.loadMore}
          onEndReachedThreshold={2}
          refreshControl={
            <RefreshControl
              refreshing={feed.refreshing}
              onRefresh={feed.refresh}
              tintColor={colors.white}
              colors={[colors.primary]}
              progressViewOffset={topInset}
            />
          }
          ListEmptyComponent={
            <View style={[styles.emptyFeed, {height}]}>
              <Icon
                name={tab === 'following' ? 'people-outline' : 'videocam-outline'}
                size={48}
                color={colors.white}
              />
              <Text style={styles.emptyText}>
                {tab === 'following'
                  ? 'Follow creators to see their videos here.'
                  : 'No videos yet. Be the first to share one!'}
              </Text>
              <PillButton
                small
                variant="outline"
                title={tab === 'following' ? 'Find people' : 'Record a video'}
                style={styles.emptyBtn}
                onPress={() =>
                  tab === 'following'
                    ? navigation.navigate('Users')
                    : navigation.navigate('CreateVideo')
                }
              />
            </View>
          }
        />
      );
    }
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {focused ? (
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      ) : null}
      {body}

      {/* Overlay header */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={[styles.header, {paddingTop: insets.top + spacing.sm}]}
        pointerEvents="box-none">
        <Logo color={colors.white} size={32} />
        <View style={styles.tabs} accessibilityRole="tablist">
          <FeedTabButton label="For You" active={tab === 'forYou'} onPress={() => switchTab('forYou')} />
          <FeedTabButton
            label="Following"
            active={tab === 'following'}
            onPress={() => switchTab('following')}
          />
        </View>
        <View style={styles.headerRight}>
          <IconButton
            name="search"
            color={colors.white}
            label="Search"
            onPress={() => navigation.navigate('Search')}
          />
          <IconButton
            name="notifications-outline"
            color={colors.white}
            label="Notifications"
            badge={unread.notifications}
            onPress={() => navigation.navigate('Notifications')}
            style={styles.bell}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

function FeedTabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{selected: active}}
      style={styles.tabBtn}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} />
    </Pressable>
  );
}

const textShadow = {
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: {width: 0, height: 1},
  textShadowRadius: 3,
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.black},
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  tabs: {flexDirection: 'row', alignItems: 'center'},
  tabBtn: {alignItems: 'center', paddingHorizontal: spacing.md},
  tabText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: font.lg,
    fontWeight: weight.semibold,
    ...textShadow,
  },
  tabTextActive: {color: colors.white, fontWeight: weight.bold},
  tabIndicator: {
    height: 3,
    width: 26,
    borderRadius: 2,
    marginTop: 4,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {backgroundColor: colors.white},
  headerRight: {flexDirection: 'row', alignItems: 'center'},
  bell: {marginLeft: spacing.sm},
  emptyFeed: {alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl},
  emptyText: {
    color: colors.white,
    fontSize: font.lg,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  emptyBtn: {marginTop: spacing.lg, borderColor: colors.white},
});
