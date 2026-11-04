import React from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import {errorMessage} from '../../api';
import type {DmPolicy} from '../../api/types';
import {useAuth} from '../../auth/AuthContext';
import {NavRow, SectionLabel, SwitchRow} from '../../components/SettingRow';
import {BackHeader, ErrorState, Icon, LoadingState, Screen} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {useFollowRequestCount, useSettings, useUpdateSettings} from '../../query/v11';
import {font, makeStyles, spacing, useTheme} from '../../theme';

const POLICIES: {key: DmPolicy; label: string; hint: string}[] = [
  {key: 'everyone', label: 'Everyone', hint: 'Anyone can send you a message.'},
  {key: 'followers', label: 'People who follow me', hint: 'Only your followers can message you.'},
  {key: 'nobody', label: 'Nobody', hint: 'No new conversations. Existing ones stay open.'},
];

export default function PrivacySettingsScreen({navigation}: RootScreenProps<'PrivacySettings'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  const {refreshMe} = useAuth();
  const settings = useSettings();
  const update = useUpdateSettings();
  const requests = useFollowRequestCount();

  const patch = (p: Parameters<typeof update.mutate>[0]) =>
    update.mutate(p, {
      onSuccess: () => refreshMe(),
      onError: e => Alert.alert(t("Couldn't save"), errorMessage(e)),
    });

  return (
    <Screen>
      <BackHeader title={t('Privacy')} />
      {settings.isLoading ? (
        <LoadingState />
      ) : !settings.data ? (
        <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <SectionLabel>{t('Account')}</SectionLabel>
          <SwitchRow
            icon="lock-closed-outline"
            label={t('Private account')}
            hint={t('Only approved followers see your posts. Your profile stays visible.')}
            value={settings.data.isPrivate}
            onChange={v => {
              if (!v && (requests.data?.count ?? 0) > 0) {
                Alert.alert(
                  t('Make account public?'),
                  t('Pending follow requests will be accepted automatically.'),
                  [
                    {text: t('Cancel'), style: 'cancel'},
                    {text: t('Make public'), onPress: () => patch({isPrivate: false})},
                  ],
                );
              } else {
                patch({isPrivate: v});
              }
            }}
          />
          <NavRow
            icon="person-add-outline"
            label={t('Follow requests')}
            badge={requests.data?.count}
            onPress={() => navigation.navigate('FollowRequests')}
          />
          <NavRow icon="ban-outline" label={t('Blocked accounts')} onPress={() => navigation.navigate('BlockedUsers')} />

          <SectionLabel>{t('Who can message me')}</SectionLabel>
          {POLICIES.map(p => {
            const on = settings.data!.dmPolicy === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => patch({dmPolicy: p.key})}
                accessibilityRole="radio"
                accessibilityState={{selected: on}}
                style={styles.radio}>
                <Icon
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={on ? colors.primary : colors.textMuted}
                />
                <View style={styles.radioBody}>
                  <Text style={styles.radioLabel}>{t(p.label)}</Text>
                  <Text style={styles.radioHint}>{t(p.hint)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  scroll: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl},
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  radioBody: {flex: 1, marginLeft: spacing.md},
  radioLabel: {fontSize: font.md, color: c.text},
  radioHint: {fontSize: font.xs, color: c.textSecondary, marginTop: 2},
}));
