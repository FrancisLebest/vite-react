import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  ImageBackground,
  LayoutChangeEvent,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Avatar, Icon, IconButton, Logo, VerifiedBadge} from '../components/ui';
import {useApp} from '../context/AppContext';
import {videos as allVideos} from '../data/mock';
import type {Video} from '../data/types';
import type {TabScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {formatCount} from '../utils/responsive';

type FeedTab = 'forYou' | 'following';

export default function HomeScreen({navigation}: TabScreenProps<'Home'>) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const {state, unreadNotifications} = useApp();
  const [tab, setTab] = useState<FeedTab>('forYou');
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const data = useMemo(
    () =>
      tab === 'forYou'
        ? allVideos
        : allVideos.filter(v => state.following[v.authorId] || v.following),
    [tab, state.following],
  );

  const onLayout = (e: LayoutChangeEvent) =>
    setHeight(e.nativeEvent.layout.height);

  const onViewableItemsChanged = useRef(
    ({viewableItems}: {viewableItems: ViewToken[]}) => {
      if (viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {focused ? (
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
      ) : null}
      {height > 0 ? (
        <FlatList
          key={tab}
          data={data}
          keyExtractor={v => v.id}
          renderItem={({item, index}) => (
            <VideoCard
              video={item}
              height={height}
              active={index === activeIndex}
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={height}
          snapToAlignment="start"
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{itemVisiblePercentThreshold: 60}}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={[styles.emptyFeed, {height}]}>
              <Icon name="people-outline" size={48} color={colors.white} />
              <Text style={styles.emptyText}>
                Follow creators to see their videos here.
              </Text>
            </View>
          }
        />
      ) : null}

      {/* Overlay header */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={[styles.header, {paddingTop: insets.top + spacing.sm}]}
        pointerEvents="box-none">
        <Logo color={colors.white} size={32} />
        <View style={styles.tabs}>
          <FeedTabButton
            label="For You"
            active={tab === 'forYou'}
            onPress={() => setTab('forYou')}
          />
          <FeedTabButton
            label="Following"
            active={tab === 'following'}
            onPress={() => setTab('following')}
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
            badge={unreadNotifications}
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
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
      <View
        style={[styles.tabIndicator, active && styles.tabIndicatorActive]}
      />
    </Pressable>
  );
}

const VideoCard = React.memo(function VideoCard({
  video,
  height,
}: {
  video: Video;
  height: number;
  /** true when the card is the visible page — hook a video player's `paused` prop here */
  active: boolean;
}) {
  const {getUser, state, dispatch} = useApp();
  const navigation = useNavigation();
  const author = getUser(video.authorId);
  const liked = !!state.liked[video.id];
  const bookmarked = !!state.bookmarked[video.id];
  const following = !!state.following[video.authorId];
  const extraComments = state.comments[video.id]?.length ?? 0;

  // Double tap to like, with a heart burst animation.
  const heart = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const onTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (!liked) {
        dispatch({type: 'toggleLike', id: video.id});
      }
      heart.setValue(0);
      Animated.sequence([
        Animated.spring(heart, {
          toValue: 1,
          useNativeDriver: true,
          friction: 4,
        }),
        Animated.timing(heart, {
          toValue: 0,
          duration: 250,
          delay: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
    lastTap.current = now;
  }, [liked, dispatch, video.id, heart]);

  const onShare = () =>
    Share.share({message: `${video.caption} — watch on StudyHub`}).catch(
      () => undefined,
    );

  return (
    <Pressable
      onPress={onTap}
      style={{height}}
      accessibilityHint="Double tap to like">
      <ImageBackground
        source={{uri: video.cover}}
        style={styles.media}
        resizeMode="cover">
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
          style={styles.bottomShade}
          pointerEvents="none"
        />

        <View style={styles.tagChip}>
          <Icon name="school" size={14} color={colors.white} />
          <Text style={styles.tagText}>{video.tag}</Text>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.burst,
            {
              opacity: heart,
              transform: [
                {
                  scale: heart.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1.2],
                  }),
                },
              ],
            },
          ]}>
          <Icon name="heart" size={110} color={colors.white} />
        </Animated.View>

        {/* Right action rail */}
        <View style={styles.rail}>
          <Pressable
            onPress={() =>
              navigation.navigate('UserProfile', {userId: author.id})
            }
            accessibilityLabel={`Open ${author.name}'s profile`}>
            <View style={styles.railAvatar}>
              <Logo color={colors.white} size={24} />
            </View>
            <Pressable
              onPress={() =>
                dispatch({type: 'toggleFollow', userId: author.id})
              }
              accessibilityLabel={following ? 'Unfollow' : 'Follow'}
              style={[styles.plus, following && styles.plusFollowing]}>
              <Icon
                name={following ? 'checkmark' : 'add'}
                size={12}
                color={colors.white}
              />
            </Pressable>
          </Pressable>
          <RailAction
            icon={liked ? 'heart' : 'heart-outline'}
            color={liked ? colors.danger : colors.white}
            label={formatCount(video.likes + (liked ? 1 : 0))}
            a11y={liked ? 'Unlike' : 'Like'}
            onPress={() => dispatch({type: 'toggleLike', id: video.id})}
          />
          <RailAction
            icon="chatbubble-ellipses"
            label={formatCount(video.comments + extraComments)}
            a11y="Comments"
            onPress={() =>
              navigation.navigate('Comments', {
                targetId: video.id,
                baseCount: video.comments,
              })
            }
          />
          <RailAction
            icon={bookmarked ? 'bookmark' : 'bookmark-outline'}
            label={formatCount(video.bookmarks + (bookmarked ? 1 : 0))}
            a11y={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            onPress={() => dispatch({type: 'toggleBookmark', id: video.id})}
          />
          <RailAction
            icon="arrow-redo"
            label={formatCount(video.shares)}
            a11y="Share"
            onPress={onShare}
          />
        </View>

        {/* Caption */}
        <View style={styles.caption}>
          <View style={styles.authorRow}>
            <Pressable
              style={styles.authorTap}
              onPress={() =>
                navigation.navigate('UserProfile', {userId: author.id})
              }>
              <Avatar uri={author.avatar} size={40} ring />
              <Text style={styles.authorName} numberOfLines={1}>
                {author.name}
              </Text>
              {author.verified ? <VerifiedBadge size={16} /> : null}
            </Pressable>
            <Pressable
              onPress={() =>
                dispatch({type: 'toggleFollow', userId: author.id})
              }
              style={styles.followOutline}
              accessibilityRole="button">
              <Text style={styles.followOutlineText}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.captionText}>{video.caption}</Text>
          <Text style={styles.hashtags}>
            {video.hashtags.map(h => `#${h}`).join(' ')}
          </Text>
          <View style={styles.soundRow}>
            <Icon name="musical-notes" size={14} color={colors.white} />
            <Text style={styles.soundText} numberOfLines={1}>
              {video.sound}
            </Text>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
});

function RailAction({
  icon,
  label,
  onPress,
  color = colors.white,
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
      style={styles.railAction}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={a11y}>
      <Icon name={icon} size={32} color={color} style={styles.railIcon} />
      <Text style={styles.railLabel}>{label}</Text>
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
  media: {flex: 1, justifyContent: 'flex-end', backgroundColor: '#1d1a33'},
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
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
  tagChip: {
    position: 'absolute',
    top: 110,
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  tagText: {
    color: colors.white,
    fontSize: font.sm,
    fontWeight: weight.semibold,
    marginLeft: 6,
  },
  burst: {position: 'absolute', alignSelf: 'center', top: '38%'},
  rail: {
    position: 'absolute',
    right: spacing.md,
    bottom: 150,
    alignItems: 'center',
  },
  railAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  plus: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusFollowing: {backgroundColor: colors.success},
  railAction: {alignItems: 'center', marginTop: spacing.xl},
  railIcon: textShadow,
  railLabel: {
    color: colors.white,
    fontSize: font.sm,
    fontWeight: weight.semibold,
    marginTop: 2,
    ...textShadow,
  },
  caption: {
    paddingLeft: spacing.lg,
    paddingRight: 84,
    paddingBottom: spacing.xl,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  authorTap: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  authorName: {
    color: colors.white,
    fontSize: font.lg,
    fontWeight: weight.bold,
    marginHorizontal: spacing.sm,
    flexShrink: 1,
    ...textShadow,
  },
  followOutline: {
    borderWidth: 1.5,
    borderColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginLeft: spacing.sm,
  },
  followOutlineText: {
    color: colors.white,
    fontWeight: weight.semibold,
    fontSize: font.sm,
  },
  captionText: {color: colors.white, fontSize: font.md, ...textShadow},
  hashtags: {
    color: colors.white,
    fontSize: font.md,
    fontWeight: weight.semibold,
    marginTop: 2,
    ...textShadow,
  },
  soundRow: {flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm},
  soundText: {color: colors.white, fontSize: font.sm, marginLeft: 6},
  emptyFeed: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
  },
  emptyText: {
    color: colors.white,
    fontSize: font.lg,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
