import React, {useState} from 'react';
import {RefreshControl, ScrollView, Text, View} from 'react-native';
import {errorMessage} from '../../api';
import type {AnalyticsRange, AnalyticsTotals} from '../../api/types';
import {BarChart, LineChart} from '../../components/Charts';
import {ContentRow} from '../../components/items';
import {BackHeader, ChipRow, EmptyState, ErrorState, Icon, LoadingState, Screen, SectionHeader} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {useAnalytics} from '../../query/v11';
import {font, makeStyles, radius, shadowFor, spacing, useTheme, weight} from '../../theme';
import {formatCount} from '../../utils/responsive';
import {dayLabel} from '../../utils/time';

const METRICS: {key: keyof AnalyticsTotals; label: string; icon: string}[] = [
  {key: 'views', label: 'Views', icon: 'eye-outline'},
  {key: 'likes', label: 'Likes', icon: 'heart-outline'},
  {key: 'comments', label: 'Comments', icon: 'chatbubble-outline'},
  {key: 'shares', label: 'Shares', icon: 'arrow-redo-outline'},
  {key: 'newFollowers', label: 'New followers', icon: 'person-add-outline'},
];

/** GET /me/analytics?range= */
export default function AnalyticsScreen(_p: RootScreenProps<'Analytics'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const [range, setRange] = useState<AnalyticsRange>('28d');
  const q = useAnalytics(range);
  const a = q.data;
  const series = (k: keyof AnalyticsTotals) => (a?.daily ?? []).map(d => ({label: dayLabel(d.date), value: d[k]}));

  return (
    <Screen>
      <BackHeader title={t('Analytics')} />
      <ChipRow
        items={[
          {key: '7d', label: t('7 days')},
          {key: '28d', label: t('28 days')},
          {key: '90d', label: t('90 days')},
        ]}
        value={range}
        onChange={setRange}
        style={styles.chips}
      />
      {q.isLoading ? (
        <LoadingState />
      ) : !a ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}>
          <Text style={styles.period}>
            {dayLabel(a.from)} – {dayLabel(a.to)} · {t('{count} followers', {count: a.followerCount})} ·{' '}
            {t('{count} posts', {count: a.postCount})}
          </Text>
          <View style={styles.tiles}>
            {METRICS.map(m => (
              <View key={m.key} style={styles.tile} accessible accessibilityLabel={`${t(m.label)}: ${a.totals[m.key]}`}>
                <Icon name={m.icon} size={18} color={colors.primary} />
                <Text style={styles.tileValue}>{formatCount(a.totals[m.key])}</Text>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {t(m.label)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Views')}</Text>
            <LineChart data={series('views')} label={t('Views')} color={colors.chart[0]} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Likes')}</Text>
            <BarChart data={series('likes')} label={t('Likes')} color={colors.chart[2]} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('New followers')}</Text>
            <BarChart data={series('newFollowers')} label={t('New followers')} color={colors.chart[1]} />
          </View>

          <SectionHeader title={t('Top posts')} />
          {a.topPosts.length ? (
            a.topPosts.map(tp => (
              <View key={tp.post.id}>
                <ContentRow item={tp.post} />
                <Text style={styles.topMeta}>
                  {t('{views} views · {likes} likes · {comments} comments in this period', {
                    views: formatCount(tp.views),
                    likes: formatCount(tp.likes),
                    comments: formatCount(tp.comments),
                  })}
                </Text>
              </View>
            ))
          ) : (
            <EmptyState icon="bar-chart-outline" title={t('No activity in this period')} />
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  chips: {paddingBottom: spacing.sm},
  scroll: {paddingBottom: spacing.xxxl},
  period: {fontSize: font.sm, color: c.textSecondary, paddingHorizontal: spacing.lg},
  tiles: {flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, marginTop: spacing.sm},
  tile: {
    width: '30%',
    flexGrow: 1,
    margin: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: c.primaryTint,
    borderWidth: 1,
    borderColor: c.border,
  },
  tileValue: {fontSize: font.xxl, fontWeight: weight.bold, color: c.text, marginTop: spacing.xs},
  tileLabel: {fontSize: font.xs, color: c.textSecondary},
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    ...shadowFor(c),
  },
  cardTitle: {fontSize: font.md, fontWeight: weight.bold, color: c.text},
  topMeta: {fontSize: font.xs, color: c.textMuted, paddingHorizontal: spacing.lg, marginTop: -spacing.sm, marginBottom: spacing.md},
}));
