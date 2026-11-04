import React, {useState} from 'react';
import {Alert, FlatList, Pressable, RefreshControl, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {api, errorMessage, isApiError} from '../../api';
import type {ReportStatus, VerificationStatus} from '../../api/types';
import {UserRow} from '../../components/items';
import {
  BackHeader,
  ChipRow,
  EmptyState,
  ErrorState,
  ListFooter,
  LoadingState,
  PillButton,
  Screen,
} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {removeFromPages} from '../../query/cache';
import {useCursorList} from '../../query/hooks';
import {qk11} from '../../query/v11';
import {font, makeStyles, radius, spacing, useTheme, weight} from '../../theme';
import {timeAgo} from '../../utils/time';

type Section = 'reports' | 'verifications' | 'suspended';

/** Moderation console (Me.isAdmin only). */
export default function AdminScreen({navigation}: RootScreenProps<'Admin'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>('reports');
  const [reportStatus, setReportStatus] = useState<ReportStatus>('open');
  const [verifStatus, setVerifStatus] = useState<VerificationStatus>('pending');

  const reports = useCursorList(qk11.adminReports(reportStatus), c => api.admin.reports(reportStatus, c), {
    enabled: section === 'reports',
  });
  const verifs = useCursorList(qk11.adminVerifications(verifStatus), c => api.admin.verificationRequests(verifStatus, c), {
    enabled: section === 'verifications',
  });
  const suspended = useCursorList(qk11.adminSuspended(), api.admin.suspendedUsers, {enabled: section === 'suspended'});

  const decide = (id: string, approve: boolean) =>
    (approve ? api.admin.approve(id) : api.admin.reject(id))
      .then(() => removeFromPages(qc, [qk11.adminVerifications(verifStatus)], id))
      .catch(e => Alert.alert(t('Error'), errorMessage(e)));

  const unsuspend = (userId: string) =>
    api.admin
      .unsuspend(userId)
      .then(() => removeFromPages(qc, [qk11.adminSuspended()], userId))
      .catch(e => Alert.alert(t('Error'), errorMessage(e)));

  const list = section === 'reports' ? reports : section === 'verifications' ? verifs : suspended;
  const notAvailable = section === 'suspended' && isApiError(suspended.error) && suspended.error.status === 404;

  return (
    <Screen>
      <BackHeader title={t('Moderation')} />
      <ChipRow
        items={[
          {key: 'reports', label: t('Reports')},
          {key: 'verifications', label: t('Verification')},
          {key: 'suspended', label: t('Suspended')},
        ]}
        value={section}
        onChange={setSection}
      />
      {section === 'reports' ? (
        <ChipRow
          items={[
            {key: 'open', label: t('Open')},
            {key: 'reviewed', label: t('Reviewed')},
            {key: 'dismissed', label: t('Dismissed')},
          ]}
          value={reportStatus}
          onChange={setReportStatus}
          style={styles.sub}
        />
      ) : section === 'verifications' ? (
        <ChipRow
          items={[
            {key: 'pending', label: t('Pending')},
            {key: 'approved', label: t('Approved')},
            {key: 'rejected', label: t('Rejected')},
          ]}
          value={verifStatus}
          onChange={setVerifStatus}
          style={styles.sub}
        />
      ) : null}
      <FlatList<{id: string}>
        data={list.items as {id: string}[]}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.grow}
        onEndReached={list.loadMore}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({item}) => {
          if (section === 'reports') {
            const r = reports.items.find(x => x.id === item.id)!;
            return (
              <Pressable
                style={({pressed}) => [styles.card, pressed && styles.pressed]}
                accessibilityRole="button"
                onPress={() => navigation.navigate('ReportDetail', {reportId: r.id})}>
                <View style={styles.cardHead}>
                  <Text style={styles.pill}>{t(r.targetType)}</Text>
                  <Text style={[styles.pill, styles.reason]}>{t(r.reason)}</Text>
                  <Text style={styles.time}>{timeAgo(r.createdAt)}</Text>
                </View>
                <Text style={styles.preview} numberOfLines={2}>
                  {r.targetPreview ?? t('(content unavailable)')}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {r.targetAuthor ? t('By @{user}', {user: r.targetAuthor.username}) : ''}
                  {r.reporter ? ` · ${t('Reported by @{user}', {user: r.reporter.username})}` : ''}
                </Text>
              </Pressable>
            );
          }
          if (section === 'verifications') {
            const v = verifs.items.find(x => x.id === item.id)!;
            return (
              <View>
                <UserRow
                  user={v.user}
                  compact
                  right={
                    v.status === 'pending' ? (
                      <View style={styles.row}>
                        <PillButton small title={t('Approve')} onPress={() => decide(v.id, true)} />
                        <PillButton small variant="soft" title={t('Reject')} style={styles.ml} onPress={() => decide(v.id, false)} />
                      </View>
                    ) : (
                      <Text style={styles.time}>{t(v.status === 'approved' ? 'Approved' : 'Rejected')}</Text>
                    )
                  }
                />
                {v.message ? <Text style={styles.message}>“{v.message}”</Text> : null}
              </View>
            );
          }
          const u = suspended.items.find(x => x.id === item.id)!;
          return (
            <UserRow
              user={u}
              compact
              right={<PillButton small variant="outline" title={t('Unsuspend')} onPress={() => unsuspend(u.id)} />}
            />
          );
        }}
        ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : notAvailable ? (
            <EmptyState
              icon="construct-outline"
              title={t('Not available yet')}
              message={t('This server does not list suspended accounts. Unsuspend from a report or a profile.')}
            />
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState icon="checkmark-done-outline" title={t('Nothing to review')} />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  sub: {paddingBottom: spacing.sm},
  grow: {flexGrow: 1, paddingBottom: spacing.xl},
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  pressed: {opacity: 0.7},
  cardHead: {flexDirection: 'row', alignItems: 'center'},
  pill: {
    fontSize: font.xs,
    fontWeight: weight.bold,
    color: c.primary,
    backgroundColor: c.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginRight: spacing.xs,
    textTransform: 'capitalize',
  },
  reason: {color: c.danger, backgroundColor: c.dangerSoft},
  time: {fontSize: font.xs, color: c.textMuted, marginLeft: 'auto'},
  preview: {fontSize: font.md, color: c.text, marginTop: spacing.sm},
  meta: {fontSize: font.xs, color: c.textSecondary, marginTop: spacing.xs},
  row: {flexDirection: 'row'},
  ml: {marginLeft: spacing.xs},
  message: {fontSize: font.sm, color: c.textSecondary, paddingHorizontal: spacing.lg, marginTop: -spacing.sm, marginBottom: spacing.md, fontStyle: 'italic'},
}));
