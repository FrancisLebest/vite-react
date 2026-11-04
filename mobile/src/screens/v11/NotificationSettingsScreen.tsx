import React from 'react';
import {Alert, ScrollView, Text} from 'react-native';
import {errorMessage} from '../../api';
import type {NotificationPrefs} from '../../api/types';
import {SectionLabel, SwitchRow} from '../../components/SettingRow';
import {BackHeader, ErrorState, LoadingState, Screen} from '../../components/ui';
import {t} from '../../i18n';
import {isPushAvailable} from '../../push/firebase';
import type {RootScreenProps} from '../../navigation/types';
import {useSettings, useUpdateSettings} from '../../query/v11';
import {font, makeStyles, spacing} from '../../theme';

const ROWS: {key: Exclude<keyof NotificationPrefs, 'push'>; icon: string; label: string; hint?: string}[] = [
  {key: 'likes', icon: 'heart-outline', label: 'Likes and reposts', hint: 'Likes on posts and comments, reposts'},
  {key: 'comments', icon: 'chatbubble-outline', label: 'Comments'},
  {key: 'replies', icon: 'return-down-forward-outline', label: 'Replies'},
  {key: 'mentions', icon: 'at-outline', label: 'Mentions'},
  {key: 'follows', icon: 'person-add-outline', label: 'New followers'},
  {key: 'followRequests', icon: 'lock-closed-outline', label: 'Follow requests'},
  {key: 'messages', icon: 'mail-outline', label: 'Messages', hint: 'Push only'},
  {key: 'communityJoins', icon: 'people-outline', label: 'Community joins'},
  {key: 'events', icon: 'calendar-outline', label: 'Community events'},
];

/** PUT /users/me/settings { notifications } — disabling a type removes both the in-app and push notification. */
export default function NotificationSettingsScreen(_p: RootScreenProps<'NotificationSettings'>) {
  const styles = useStyles();
  const settings = useSettings();
  const update = useUpdateSettings();
  const set = (key: keyof NotificationPrefs, v: boolean) =>
    update.mutate(
      {notifications: {[key]: v}},
      {onError: e => Alert.alert(t("Couldn't save"), errorMessage(e))},
    );
  const prefs = settings.data?.notifications;
  return (
    <Screen>
      <BackHeader title={t('Notifications')} />
      {settings.isLoading ? (
        <LoadingState />
      ) : !prefs ? (
        <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <SwitchRow
            icon="notifications-outline"
            label={t('Push notifications')}
            hint={
              isPushAvailable()
                ? t('Master switch for notifications on this phone')
                : t('Push is not configured in this build')
            }
            value={prefs.push}
            onChange={v => set('push', v)}
          />
          <SectionLabel>{t('Notify me about')}</SectionLabel>
          {ROWS.map(r => (
            <SwitchRow
              key={r.key}
              icon={r.icon}
              label={t(r.label)}
              hint={r.hint ? t(r.hint) : undefined}
              value={prefs[r.key]}
              onChange={v => set(r.key, v)}
            />
          ))}
          <Text style={styles.note}>
            {t('Turning a type off hides it from your inbox too, not only from push.')}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  scroll: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl},
  note: {fontSize: font.xs, color: c.textMuted, marginTop: spacing.lg},
}));
