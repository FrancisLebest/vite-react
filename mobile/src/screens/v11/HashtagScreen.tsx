import React, {useState} from 'react';
import {FlatList, RefreshControl, Share, Text, View} from 'react-native';
import {errorMessage} from '../../api';
import {ContentRow, PostCard} from '../../components/items';
import {
  BackHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  IconButton,
  ListFooter,
  LoadingState,
  Screen,
} from '../../components/ui';
import {t} from '../../i18n';
import {shareUrl} from '../../linking';
import type {RootScreenProps} from '../../navigation/types';
import {useHashtag} from '../../query/v11';
import {font, makeStyles, spacing, useTheme, weight} from '../../theme';
import {formatCount} from '../../utils/responsive';

/** GET /hashtags/:tag — every visible post with this tag. */
export default function HashtagScreen({route}: RootScreenProps<'Hashtag'>) {
  const tag = route.params.tag.replace(/^#/, '').toLowerCase();
  const styles = useStyles();
  const {colors} = useTheme();
  const [sort, setSort] = useState<'popular' | 'recent'>('popular');
  const list = useHashtag(tag, sort);
  const total = (list.data?.pages[0] as {postCount?: number} | undefined)?.postCount;

  return (
    <Screen>
      <BackHeader
        title={`#${tag}`}
        right={
          <IconButton
            name="share-social-outline"
            label={t('Share hashtag')}
            onPress={() => Share.share({message: shareUrl.hashtag(tag)}).catch(() => undefined)}
          />
        }
      />
      <FlatList
        data={list.items}
        keyExtractor={p => p.id}
        renderItem={({item}) => (item.type === 'video' ? <ContentRow item={item} /> : <PostCard post={item} />)}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.grow}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Text style={styles.hash}>#</Text>
              <View>
                <Text style={styles.tag}>{tag}</Text>
                <Text style={styles.count}>
                  {total != null ? t('{count} posts', {count: total}) : ' '}
                  {total != null ? ` · ${formatCount(total)}` : ''}
                </Text>
              </View>
            </View>
            <ChipRow
              items={[
                {key: 'popular', label: t('Popular')},
                {key: 'recent', label: t('Latest')},
              ]}
              value={sort}
              onChange={setSort}
              style={styles.chips}
            />
          </View>
        }
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState icon="pricetag-outline" title={t('No posts with #{tag} yet', {tag})} />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  grow: {flexGrow: 1, paddingBottom: spacing.xl},
  hero: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md},
  hash: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.primarySoft,
    color: c.primary,
    fontSize: 34,
    fontWeight: weight.bold,
    textAlign: 'center',
    lineHeight: 64,
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  tag: {fontSize: font.xxl, fontWeight: weight.bold, color: c.text},
  count: {fontSize: font.sm, color: c.textSecondary, marginTop: 2},
  chips: {paddingBottom: spacing.sm},
}));
