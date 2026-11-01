import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useInfiniteQuery, useQuery} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {api, errorMessage} from '../api';
import type {
  CategoryId,
  Community,
  Post,
  SearchPage,
  SearchParams,
  SearchSort,
  SearchType,
  UserSummary,
} from '../api/types';
import {CommunityRow, ContentRow, UserRow} from '../components/items';
import {
  BackHeader,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListFooter,
  LoadingState,
  PillButton,
  Screen,
  SearchInput,
} from '../components/ui';
import {categoryLabel} from '../constants/categories';
import {useCategories, useTrendingHashtags, useUniversities} from '../query/hooks';
import {qk} from '../query/keys';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {useDebounced} from '../utils/hooks';
import {useResponsive} from '../utils/responsive';

interface Filters {
  category: CategoryId | null;
  university: string | null;
  sort: SearchSort;
}

const TYPE_ITEMS: {key: SearchType; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'posts', label: 'Posts'},
  {key: 'users', label: 'Users'},
  {key: 'communities', label: 'Communities'},
];

const SORTS: {key: SearchSort; label: string}[] = [
  {key: 'relevant', label: 'Most Relevant'},
  {key: 'recent', label: 'Most Recent'},
  {key: 'popular', label: 'Most Popular'},
];

type Row =
  | {kind: 'header'; id: string; title: string}
  | {kind: 'post'; id: string; item: Post}
  | {kind: 'user'; id: string; item: UserSummary}
  | {kind: 'community'; id: string; item: Community};

export default function SearchScreen({route, navigation}: RootScreenProps<'Search'>) {
  const [query, setQuery] = useState(route.params?.query ?? '');
  const [type, setType] = useState<SearchType>(route.params?.type ?? 'all');
  const [filters, setFilters] = useState<Filters>({
    category: route.params?.category ?? null,
    university: null,
    sort: 'relevant',
  });
  const [sheetOpen, setSheetOpen] = useState(!!route.params?.openFilters);
  const q = useDebounced(query.trim(), 350);
  const hashtags = useTrendingHashtags();

  const params: SearchParams = {
    q,
    type,
    category: filters.category ?? undefined,
    university: filters.university ?? undefined,
    sort: filters.sort,
  };
  const enabled = q.length > 0 || !!filters.category || !!filters.university;
  const {type: _t, ...base} = params;

  const all = useQuery({
    queryKey: [...qk.search(params), 'all'],
    queryFn: () => api.search.all(base),
    enabled: enabled && type === 'all',
    keepPreviousData: true,
  });
  const paged = useInfiniteQuery<SearchPage<Post | UserSummary | Community>>({
    queryKey: [...qk.search(params), 'paged'],
    queryFn: ({pageParam}) => {
      const cursor = pageParam as string | undefined;
      if (type === 'posts') {
        return api.search.posts(base, cursor);
      }
      if (type === 'users') {
        return api.search.users(base, cursor);
      }
      return api.search.communities(base, cursor);
    },
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled: enabled && type !== 'all',
    keepPreviousData: true,
  });

  const active = type === 'all' ? all : paged;
  const total =
    type === 'all' ? all.data?.total : paged.data?.pages[0]?.total;

  const rows = useMemo<Row[]>(() => {
    if (type === 'all') {
      const d = all.data;
      if (!d) {
        return [];
      }
      const out: Row[] = [];
      if (d.posts.length) {
        out.push({kind: 'header', id: 'h-posts', title: 'Posts & videos'});
        d.posts.forEach(p => out.push({kind: 'post', id: `p-${p.id}`, item: p}));
      }
      if (d.users.length) {
        out.push({kind: 'header', id: 'h-users', title: 'People'});
        d.users.forEach(u => out.push({kind: 'user', id: `u-${u.id}`, item: u}));
      }
      if (d.communities.length) {
        out.push({kind: 'header', id: 'h-comm', title: 'Communities'});
        d.communities.forEach(c => out.push({kind: 'community', id: `c-${c.id}`, item: c}));
      }
      return out;
    }
    const kind = type === 'posts' ? 'post' : type === 'users' ? 'user' : 'community';
    const seen = new Set<string>();
    const out: Row[] = [];
    paged.data?.pages.forEach(p =>
      p.items.forEach(i => {
        if (!seen.has(i.id)) {
          seen.add(i.id);
          out.push({kind, id: `${kind}-${i.id}`, item: i} as Row);
        }
      }),
    );
    return out;
  }, [type, all.data, paged.data]);

  const activeFilters =
    (filters.category ? 1 : 0) + (filters.university ? 1 : 0) + (filters.sort !== 'relevant' ? 1 : 0);
  const clearFilters = () => setFilters({category: null, university: null, sort: 'relevant'});

  let content: React.ReactNode;
  if (!enabled) {
    content = (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.suggest}>
        <Text style={styles.suggestTitle}>Trending hashtags</Text>
        {hashtags.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.wrap}>
            {(hashtags.data ?? []).map(h => (
              <Chip key={h.tag} label={`#${h.tag}`} onPress={() => setQuery(`#${h.tag}`)} />
            ))}
          </View>
        )}
        {!hashtags.isLoading && !hashtags.data?.length ? (
          <Text style={styles.summaryCount}>Search posts, people and communities.</Text>
        ) : null}
      </ScrollView>
    );
  } else if (active.isLoading) {
    content = <LoadingState label="Searching" />;
  } else if (active.isError && !rows.length) {
    content = <ErrorState message={errorMessage(active.error)} onRetry={() => active.refetch()} />;
  } else {
    content = (
      <FlatList
        data={rows}
        keyExtractor={r => r.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (type !== 'all' && paged.hasNextPage && !paged.isFetchingNextPage) {
            paged.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        renderItem={({item}) =>
          item.kind === 'header' ? (
            <Text style={styles.groupTitle}>{item.title}</Text>
          ) : item.kind === 'post' ? (
            <ContentRow item={item.item} />
          ) : item.kind === 'user' ? (
            <UserRow user={item.item} compact />
          ) : (
            <CommunityRow community={item.item} showChevron={false} />
          )
        }
        ListFooterComponent={
          <ListFooter
            loading={type !== 'all' && paged.isFetchingNextPage}
            error={type !== 'all' && paged.isError}
            onRetry={() => paged.fetchNextPage()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="No results found"
            message="Try a different keyword or clear your filters."
            action={activeFilters ? {label: 'Clear filters', onPress: clearFilters} : undefined}
          />
        }
      />
    );
  }

  return (
    <Screen>
      <BackHeader
        right={
          <IconButton
            name={activeFilters ? 'funnel' : 'funnel-outline'}
            label="Filter results"
            color={colors.primary}
            badge={activeFilters}
            onPress={() => setSheetOpen(true)}
          />
        }>
        <SearchInput
          autoFocus={!route.params?.category && !route.params?.openFilters}
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search posts, users, communities"
          style={styles.search}
        />
      </BackHeader>

      {enabled ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {filters.category && !q ? categoryLabel(filters.category) : 'Search Results'}
          </Text>
          <Text style={styles.summaryCount}>
            {active.isFetching && !active.isFetchingNextPage ? 'Searching…' : total != null ? `${total} result${total === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
      ) : null}
      <ChipRow items={TYPE_ITEMS} value={type} onChange={setType} style={styles.chips} />

      {content}

      <FilterSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          if (route.params?.openFilters) {
            navigation.setParams({openFilters: false});
          }
        }}
        type={type}
        filters={filters}
        onApply={(t, f) => {
          setType(t);
          setFilters(f);
          setSheetOpen(false);
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Filter bottom sheet                                                 */
/* ------------------------------------------------------------------ */

function FilterSheet({
  visible,
  onClose,
  type,
  filters,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  type: SearchType;
  filters: Filters;
  onApply: (type: SearchType, filters: Filters) => void;
}) {
  const insets = useSafeAreaInsets();
  const {contentWidth} = useResponsive();
  const {categories} = useCategories();
  const [draftType, setDraftType] = useState(type);
  const [draft, setDraft] = useState(filters);
  const [uniOpen, setUniOpen] = useState(false);
  const universities = useUniversities('');

  // Reset draft each time the sheet opens.
  const onShow = () => {
    setDraftType(type);
    setDraft(filters);
    setUniOpen(false);
  };

  const perRow = contentWidth >= 500 ? 5 : 4;
  const tileWidth = (contentWidth - spacing.xl * 2 - spacing.sm * (perRow - 1)) / perRow;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={onShow}
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[styles.sheet, {paddingBottom: insets.bottom + spacing.lg}]}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
          <View style={styles.sheetHeader}>
            <Icon name="funnel-outline" size={22} color={colors.primary} />
            <Text style={styles.sheetTitle}>Filter Results</Text>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>

          <Text style={styles.label}>Content Type</Text>
          <View style={styles.wrap}>
            {TYPE_ITEMS.map(t => (
              <Chip
                key={t.key}
                label={t.label}
                active={draftType === t.key}
                onPress={() => setDraftType(t.key)}
              />
            ))}
          </View>

          <Text style={styles.label}>Category</Text>
          <View style={styles.wrap}>
            {categories.map((c, i) => {
              const active = draft.category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setDraft(d => ({...d, category: active ? null : c.id}))}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: active}}
                  accessibilityLabel={c.label}
                  style={[
                    styles.catTile,
                    {
                      width: tileWidth,
                      marginRight: (i + 1) % perRow === 0 ? 0 : spacing.sm,
                    },
                    active && styles.catTileActive,
                  ]}>
                  <Icon name={c.icon} size={24} color={active ? colors.white : colors.primary} />
                  <Text style={[styles.catLabel, active && styles.catLabelActive]} numberOfLines={1}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>University / Institute</Text>
          <Pressable
            style={styles.select}
            onPress={() => setUniOpen(o => !o)}
            accessibilityRole="button"
            accessibilityState={{expanded: uniOpen}}>
            <Icon name="business-outline" size={18} color={colors.primary} />
            <Text style={styles.selectText}>{draft.university ?? 'All Universities'}</Text>
            <Icon name={uniOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
          </Pressable>
          {uniOpen ? (
            <View style={styles.options}>
              {universities.isLoading ? (
                <ActivityIndicator color={colors.primary} style={styles.optionLoader} />
              ) : (
                [null, ...(universities.data ?? [])].map(u => (
                  <Pressable
                    key={u ?? 'all'}
                    style={styles.option}
                    accessibilityRole="radio"
                    accessibilityState={{selected: draft.university === u}}
                    onPress={() => {
                      setDraft(d => ({...d, university: u}));
                      setUniOpen(false);
                    }}>
                    <Text style={[styles.optionText, draft.university === u && styles.optionActive]}>
                      {u ?? 'All Universities'}
                    </Text>
                    {draft.university === u ? (
                      <Icon name="checkmark" size={18} color={colors.primary} />
                    ) : null}
                  </Pressable>
                ))
              )}
            </View>
          ) : null}

          <Text style={styles.label}>Sort By</Text>
          <View style={styles.segment}>
            {SORTS.map(s => {
              const active = draft.sort === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setDraft(d => ({...d, sort: s.key}))}
                  accessibilityRole="radio"
                  accessibilityState={{selected: active}}
                  style={[styles.segmentItem, active && styles.segmentActive]}>
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <PillButton title="Apply Filters" onPress={() => onApply(draftType, draft)} style={styles.apply} />
          <Pressable
            onPress={() => {
              setDraftType('all');
              setDraft({category: null, university: null, sort: 'relevant'});
            }}
            accessibilityRole="button"
            style={styles.reset}>
            <Text style={styles.resetText}>Reset filters</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  search: {flex: 1, marginLeft: spacing.xs},
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  summaryTitle: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text},
  summaryCount: {fontSize: font.sm, color: colors.textSecondary},
  chips: {paddingBottom: spacing.sm},
  list: {paddingTop: spacing.xs, paddingBottom: spacing.xxl, flexGrow: 1},
  groupTitle: {
    fontSize: font.md,
    fontWeight: weight.bold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  suggest: {padding: spacing.lg},
  suggestTitle: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text, marginBottom: spacing.md},
  backdrop: {flex: 1, backgroundColor: colors.overlay},
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  sheetContent: {paddingHorizontal: spacing.xl, paddingTop: spacing.md},
  sheetHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm},
  sheetTitle: {
    flex: 1,
    fontSize: font.xl,
    fontWeight: weight.bold,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  label: {
    fontSize: font.lg,
    fontWeight: weight.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  wrap: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start'},
  catTile: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryTint,
  },
  catTileActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  catLabel: {fontSize: font.xs, color: colors.text, marginTop: 6},
  catLabelActive: {color: colors.white, fontWeight: weight.semibold},
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  selectText: {flex: 1, marginLeft: spacing.sm, fontSize: font.md, color: colors.text},
  options: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  optionLoader: {margin: spacing.md},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionText: {fontSize: font.md, color: colors.text},
  optionActive: {color: colors.primary, fontWeight: weight.semibold},
  segment: {flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4},
  segmentItem: {flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill},
  segmentActive: {backgroundColor: colors.primary},
  segmentText: {fontSize: font.sm, color: colors.text, fontWeight: weight.medium},
  segmentTextActive: {color: colors.white, fontWeight: weight.semibold},
  apply: {marginTop: spacing.xxl},
  reset: {alignItems: 'center', paddingVertical: spacing.md},
  resetText: {color: colors.textSecondary, fontSize: font.md},
});
