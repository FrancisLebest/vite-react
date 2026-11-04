import React, {useState} from 'react';
import {Alert, ScrollView, Text, View} from 'react-native';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {api, errorMessage, isApiError} from '../../api';
import {useAuth} from '../../auth/AuthContext';
import {BackHeader, IconAvatar, LoadingState, PillButton, Screen, TextField, VerifiedBadge} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {qk11} from '../../query/v11';
import {font, makeStyles, radius, spacing, weight} from '../../theme';
import {timeAgo} from '../../utils/time';

const STATUS_LABEL = {pending: 'Pending review', approved: 'Approved', rejected: 'Not approved'} as const;

/** POST/GET /me/verification-request */
export default function RequestVerificationScreen(_p: RootScreenProps<'RequestVerification'>) {
  const styles = useStyles();
  const qc = useQueryClient();
  const {me} = useAuth();
  const latest = useQuery({queryKey: qk11.verificationRequest(), queryFn: api.verification.latest});
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    try {
      const r = await api.verification.request(message.trim() || undefined);
      qc.setQueryData(qk11.verificationRequest(), r);
    } catch (e) {
      Alert.alert(
        t('Request not sent'),
        isApiError(e) && e.code === 'CONFLICT'
          ? t('You are already verified or a request is pending.')
          : errorMessage(e),
      );
    } finally {
      setSending(false);
    }
  };

  const req = latest.data;
  const canRequest = !me?.verified && (!req || req.status === 'rejected');

  return (
    <Screen>
      <BackHeader title={t('Verification')} />
      {latest.isLoading ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <IconAvatar name="checkmark-circle" size={64} />
            <Text style={styles.title}>{t('Get the verified badge')}</Text>
            <Text style={styles.text}>
              {t('Verified badges are for professors, official university accounts and well-known student creators.')}
            </Text>
          </View>
          {me?.verified ? (
            <View style={styles.status}>
              <VerifiedBadge size={18} />
              <Text style={styles.statusText}>{t('Your account is verified.')}</Text>
            </View>
          ) : null}
          {req ? (
            <View style={styles.status}>
              <Text style={styles.statusText}>
                {t(STATUS_LABEL[req.status])} · {timeAgo(req.createdAt)}
              </Text>
            </View>
          ) : null}
          {canRequest ? (
            <>
              <TextField
                label={t('Why should we verify you? (optional)')}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
                hint={`${message.length}/500`}
              />
              <PillButton title={t('Send request')} loading={sending} onPress={submit} style={styles.btn} />
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  scroll: {padding: spacing.lg},
  hero: {alignItems: 'center', padding: spacing.lg},
  title: {fontSize: font.xl, fontWeight: weight.bold, color: c.text, marginTop: spacing.md},
  text: {fontSize: font.md, color: c.textSecondary, textAlign: 'center', marginTop: spacing.xs},
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: c.primaryTint,
    marginTop: spacing.md,
  },
  statusText: {fontSize: font.md, color: c.text, marginLeft: spacing.xs, fontWeight: weight.semibold},
  btn: {marginTop: spacing.xl},
}));
