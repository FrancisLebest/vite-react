import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CommunityRow, ContentRow, UserRow} from '../components/items';
import {
  BackHeader,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  IconButton,
  PillButton,
  Screen,
  SearchInput,
} from '../components/ui';
import {useApp} from '../context/AppContext';
import {contents, UNIVERSITIES} from '../data/mock';
import type {CategoryId, Community, ContentItem, User} from '../data/types';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';
import {useResponsive} from '../utils/responsive';

type ContentType = 'all' | 'posts' | 'users' | 'communities';
type Sort = 'relevant' | 'recent' | 'popular';
type FilterCategory = 'study-tips' | 'notes' | 'videos' | 'resources';

interface Filters {
  category: FilterCategory | CategoryId | null;
  university: string | null;
  sort: Sort;
}

const TYPE_ITEMS: {key: ContentType; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'posts', label: 'Posts'},
  {key: 'users', label: 'Users'},
  {key: 'communities', label: 'Communities'},
];

const FILTER_CATEGORIES: {key: FilterCategory; label: string; icon: string}[] =
  [
    {key: 'study-tips', label: 'Study Tips', icon: 'school-outline'},
    {key: 'notes', label: 'Notes', icon: 'book-outline'},
    {key: 'videos', label: 'Videos', icon: 'play-outline'},
    {key: 'resources', label: 'Resources', icon: 'image-outline'},
  ];

const SORTS: {key: Sort; label: string}[] = [
  {key: 'relevant', label: 'Most Relevant'},
  {key: 'recent', label: 'Most Recent'},
  {key: 'popular', label: 'Most Popular'},
];

type Result =
  | {
      kind: 'content';
      item: ContentItem;
      score: number;
      date: number;
      pop: number;
    }
  | {kind: 'user'; item: User; score: number; date: number; pop: number}
  | {
      kind: 'community';
      item: Community;
      score: number;
      date: number;
      pop: number;
    };

function relevance(text: string, q: string): number {
  if (!q) {
    return 1;
  }
  const t = text.toLowerCase();
  if (t.startsWith(q)) {
    return 3;
  }
  if (t.split(/\s+/).some(w => w.startsWith(q))) {
    return 2;
  }
  return t.includes(q) ? 1 : 0;
}

function contentMatchesCategory(
  c: ContentItem,
  cat: Filters['category'],
): boolean {
  if (!cat || cat === 'videos') {
    return true; // every content item is a video lesson
  }
  if (cat === 'resources') {
    return ['notes', 'assignments', 'science'].includes(c.category);
  }
  return c.category === cat;
}

export default function SearchScreen({route}: RootScreenProps<'Search'>) {
  const {state, getUser} = useApp();
  const [query, setQuery] = useState(route.params?.query ?? '');
  const [type, setType] = useState<ContentType>('all');
  const [filters, setFilters] = useState<Filters>({
    category: route.params?.category ?? null,
    university: null,
    sort: 'relevant',
  });
  const [sheetOpen, setSheetOpen] = useState(
    route.params !== undefined && !route.params.category && !route.params.query,
  );

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const uni = filters.university;
    const out: Result[] = [];

    if (type === 'all' || type === 'posts') {
      contents.forEach(c => {
        const author = getUser(c.authorId);
        const score = Math.max(
          relevance(c.title, q),
          relevance(author.name, q) - 1,
        );
        if (
          score > 0 &&
          contentMatchesCategory(c, filters.category) &&
          (!uni || author.university === uni)
        ) {
          out.push({
            kind: 'content',
            item: c,
            score,
            date: c.createdAt,
            pop: c.views,
          });
        }
      });
    }
    if ((type === 'all' || type === 'users') && !filters.category) {
      state.users
        .filter(u => u.id !== 'me')
        .forEach(u => {
          const score = Math.max(relevance(u.name, q), relevance(u.handle, q));
          if (score > 0 && (!uni || u.university === uni)) {
            out.push({kind: 'user', item: u, score, date: 0, pop: u.followers});
          }
        });
    }
    if ((type === 'all' || type === 'communities') && !filters.category) {
      state.communities.forEach(k => {
        const score = Math.max(
          relevance(k.name, q),
          relevance(k.description, q) - 1,
        );
        if (score > 0 && (!uni || k.name === uni || k.kind !== 'university')) {
          out.push({
            kind: 'community',
            item: k,
            score,
            date: 0,
            pop: k.members,
          });
        }
      });
    }

    const sorters: Record<Sort, (a: Result, b: Result) => number> = {
      relevant: (a, b) => b.score - a.score || b.pop - a.pop,
      recent: (a, b) => b.date - a.date || b.score - a.score,
      popular: (a, b) => b.pop - a.pop,
    };
    return out.sort(sorters[filters.sort]);
  }, [query, type, filters, state.users, state.communities, getUser]);

  const activeFilters =
    (filters.category ? 1 : 0) +
    (filters.university ? 1 : 0) +
    (filters.sort !== 'relevant' ? 1 : 0);

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
          autoFocus={!route.params?.category}
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search posts, users, communities"
          style={styles.search}
        />
      </BackHeader>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Search Results</Text>
        <Text style={styles.summaryCount}>
          {results.length} result{results.length === 1 ? '' : 's'}
        </Text>
      </View>
      <ChipRow
        items={TYPE_ITEMS}
        value={type}
        onChange={setType}
        style={styles.chips}
      />

      <FlatList
        data={results}
        keyExtractor={r => `${r.kind}-${r.item.id}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        renderItem={({item}) =>
          item.kind === 'content' ? (
            <ContentRow item={item.item} />
          ) : item.kind === 'user' ? (
            <UserRow user={item.item} compact />
          ) : (
            <CommunityRow community={item.item} showChevron={false} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="No results found"
            message="Try a different keyword or clear your filters."
            action={
              activeFilters
                ? {
                    label: 'Clear filters',
                    onPress: () =>
                      setFilters({
                        category: null,
                        university: null,
                        sort: 'relevant',
                      }),
                  }
                : undefined
            }
          />
        }
      />

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
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
  type: ContentType;
  filters: Filters;
  onApply: (type: ContentType, filters: Filters) => void;
}) {
  const insets = useSafeAreaInsets();
  const {contentWidth} = useResponsive();
  const [draftType, setDraftType] = useState(type);
  const [draft, setDraft] = useState(filters);
  const [uniOpen, setUniOpen] = useState(false);

  // Reset draft each time the sheet opens.
  const onShow = () => {
    setDraftType(type);
    setDraft(filters);
    setUniOpen(false);
  };

  const tileWidth = (contentWidth - spacing.xl * 2 - spacing.sm * 3) / 4;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={onShow}
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close filters"
      />
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
            {FILTER_CATEGORIES.map((c, i) => {
              const active = draft.category === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() =>
                    setDraft(d => ({...d, category: active ? null : c.key}))
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: active}}
                  style={[
                    styles.catTile,
                    {
                      width: tileWidth,
                      marginRight:
                        i < FILTER_CATEGORIES.length - 1 ? spacing.sm : 0,
                    },
                    active && styles.catTileActive,
                  ]}>
                  <Icon
                    name={c.icon}
                    size={24}
                    color={active ? colors.white : colors.primary}
                  />
                  <Text
                    style={[styles.catLabel, active && styles.catLabelActive]}
                    numberOfLines={1}>
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
            <Text style={styles.selectText}>
              {draft.university ?? 'All Universities'}
            </Text>
            <Icon
              name={uniOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.text}
            />
          </Pressable>
          {uniOpen ? (
            <View style={styles.options}>
              {[null, ...UNIVERSITIES].map(u => (
                <Pressable
                  key={u ?? 'all'}
                  style={styles.option}
                  onPress={() => {
                    setDraft(d => ({...d, university: u}));
                    setUniOpen(false);
                  }}>
                  <Text
                    style={[
                      styles.optionText,
                      draft.university === u && styles.optionActive,
                    ]}>
                    {u ?? 'All Universities'}
                  </Text>
                  {draft.university === u ? (
                    <Icon name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
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
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                    numberOfLines={1}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <PillButton
            title="Apply Filters"
            onPress={() => onApply(draftType, draft)}
            style={styles.apply}
          />
          <Pressable
            onPress={() => {
              setDraftType('all');
              setDraft({category: null, university: null, sort: 'relevant'});
            }}
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
  summaryTitle: {
    fontSize: font.lg,
    fontWeight: weight.bold,
    color: colors.text,
  },
  summaryCount: {fontSize: font.sm, color: colors.textSecondary},
  chips: {paddingBottom: spacing.sm},
  list: {paddingTop: spacing.xs, paddingBottom: spacing.xxl},
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
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
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
  selectText: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: font.md,
    color: colors.text,
  },
  options: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionText: {fontSize: font.md, color: colors.text},
  optionActive: {color: colors.primary, fontWeight: weight.semibold},
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  segmentActive: {backgroundColor: colors.primary},
  segmentText: {
    fontSize: font.sm,
    color: colors.text,
    fontWeight: weight.medium,
  },
  segmentTextActive: {color: colors.white, fontWeight: weight.semibold},
  apply: {marginTop: spacing.xxl},
  reset: {alignItems: 'center', paddingVertical: spacing.md},
  resetText: {color: colors.textSecondary, fontSize: font.md},
});
