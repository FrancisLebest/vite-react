import React, {useState} from 'react';
import {Alert, ScrollView, Text, View} from 'react-native';
import {InfiniteData, useQueryClient} from '@tanstack/react-query';
import {api, errorMessage} from '../../api';
import type {Page, Report} from '../../api/types';
import {UserRow} from '../../components/items';
import {confirmDestructive} from '../../components/Sheet';
import {BackHeader, EmptyState, PillButton, Screen, TextField} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {font, makeStyles, radius, spacing, weight} from '../../theme';
import {formatDateTime} from '../../utils/time';

function findReport(qc: ReturnType<typeof useQueryClient>, id: string): Report | undefined {
  for (const [, data] of qc.getQueriesData<InfiniteData<Page<Report>>>(['admin', 'reports'])) {
    for (const p of data?.pages ?? []) {
      const r = p.items.find(i => i.id === id);
      if (r) {
        return r;
      }
    }
  }
  return undefined;
}

/** Report detail with moderation actions: dismiss, remove content, suspend user. */
export default function ReportDetailScreen({route, navigation}: RootScreenProps<'ReportDetail'>) {
  const styles = useStyles();
  const qc = useQueryClient();
  const [report, setReport] = useState(() => findReport(qc, route.params.reportId));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!report) {
    return (
      <Screen>
        <BackHeader title={t('Report')} />
        <EmptyState icon="alert-circle-outline" title={t('Report not found')} />
      </Screen>
    );
  }

  const act = async (kind: 'dismiss' | 'none' | 'remove_content' | 'suspend_user') => {
    if (kind === 'remove_content' || kind === 'suspend_user') {
      const ok = await confirmDestructive(
        kind === 'remove_content' ? t('Remove this content?') : t('Suspend this user?'),
        kind === 'remove_content'
          ? t('The reported content is deleted for everyone.')
          : t('They are signed out everywhere and cannot use StudyHub until unsuspended.'),
        kind === 'remove_content' ? t('Remove content') : t('Suspend user'),
      );
      if (!ok) {
        return;
      }
    }
    setBusy(true);
    try {
      const r =
        kind === 'dismiss'
          ? await api.admin.dismiss(report.id, note.trim() || undefined)
          : await api.admin.resolve(report.id, kind, note.trim() || undefined);
      setReport(r);
      qc.invalidateQueries(['admin', 'reports']);
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('Error'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = report.status === 'open';
  return (
    <Screen>
      <BackHeader title={t('Report')} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.k}>{t('Target')}</Text>
          <Text style={styles.v}>
            {t(report.targetType)} · {report.targetId}
          </Text>
          <Text style={styles.k}>{t('Reason')}</Text>
          <Text style={styles.v}>{t(report.reason)}</Text>
          {report.details ? (
            <>
              <Text style={styles.k}>{t('Details')}</Text>
              <Text style={styles.v}>{report.details}</Text>
            </>
          ) : null}
          <Text style={styles.k}>{t('Content')}</Text>
          <Text style={styles.quote}>{report.targetPreview ?? t('(content unavailable)')}</Text>
          <Text style={styles.k}>{t('Reported')}</Text>
          <Text style={styles.v}>{formatDateTime(report.createdAt)}</Text>
          {!open ? (
            <>
              <Text style={styles.k}>{t('Status')}</Text>
              <Text style={styles.v}>
                {t(report.status)}
                {report.resolution ? ` · ${t(report.resolution)}` : ''}
                {report.resolvedBy ? ` · @${report.resolvedBy.username}` : ''}
              </Text>
              {report.note ? <Text style={styles.v}>{report.note}</Text> : null}
            </>
          ) : null}
        </View>
        {report.targetAuthor ? (
          <>
            <Text style={styles.section}>{t('Author')}</Text>
            <UserRow user={report.targetAuthor} compact right={null} />
          </>
        ) : null}
        {report.reporter ? (
          <>
            <Text style={styles.section}>{t('Reporter')}</Text>
            <UserRow user={report.reporter} compact right={null} />
          </>
        ) : null}
        {open ? (
          <>
            <TextField label={t('Note (optional)')} value={note} onChangeText={setNote} multiline maxLength={500} />
            <PillButton title={t('Mark reviewed, no action')} variant="soft" loading={busy} style={styles.btn} onPress={() => act('none')} />
            <PillButton title={t('Remove content')} icon="trash-outline" style={styles.btn} loading={busy} onPress={() => act('remove_content')} />
            <PillButton title={t('Suspend user')} icon="ban-outline" style={styles.btn} loading={busy} onPress={() => act('suspend_user')} />
            <PillButton title={t('Dismiss')} variant="outline" style={styles.btn} loading={busy} onPress={() => act('dismiss')} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  scroll: {padding: spacing.lg, paddingBottom: spacing.xxxl},
  card: {padding: spacing.md, borderRadius: radius.md, backgroundColor: c.primaryTint, borderWidth: 1, borderColor: c.border},
  k: {fontSize: font.xs, color: c.textSecondary, marginTop: spacing.sm, textTransform: 'uppercase', fontWeight: weight.semibold},
  v: {fontSize: font.md, color: c.text, marginTop: 2},
  quote: {fontSize: font.md, color: c.text, marginTop: 2, fontStyle: 'italic'},
  section: {fontSize: font.sm, fontWeight: weight.bold, color: c.textSecondary, marginTop: spacing.lg},
  btn: {marginTop: spacing.md},
}));
