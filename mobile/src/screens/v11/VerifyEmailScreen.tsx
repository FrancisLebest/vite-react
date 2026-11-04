import React, {useEffect, useState} from 'react';
import {Alert, Pressable, Text, View} from 'react-native';
import {api, errorMessage, isApiError} from '../../api';
import {useAuth} from '../../auth/AuthContext';
import {PillButton, TextField} from '../../components/ui';
import {t} from '../../i18n';
import type {RootScreenProps} from '../../navigation/types';
import {makeStyles, spacing} from '../../theme';
import {validators} from '../../utils/validation';
import {AuthLayout, FormError, useAuthStyles} from '../auth/AuthLayout';

export const RESEND_COOLDOWN_S = 60;

/** 6-digit email code (after sign-up, or from the "verify your email" banner). */
export default function VerifyEmailScreen({navigation}: RootScreenProps<'VerifyEmail'>) {
  const authStyles = useAuthStyles();
  const styles = useStyles();
  const {me, setMe, pendingSetup, completeSetup} = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const done = () => {
    if (pendingSetup) {
      completeSetup();
      navigation.reset({index: 0, routes: [{name: 'Tabs'}]});
    } else {
      navigation.goBack();
    }
  };

  const submit = async () => {
    const e = validators.code(code);
    setError(e);
    setFormError(null);
    if (e) {
      return;
    }
    setLoading(true);
    try {
      setMe(await api.verification.verifyEmail(code.trim()));
      Alert.alert(t('Email verified'), t('Thanks! Your email address is confirmed.'));
      done();
    } catch (err) {
      setLoading(false);
      setFormError(
        isApiError(err) && err.status === 400
          ? t('This code is invalid or has expired.')
          : errorMessage(err),
      );
    }
  };

  const resend = async () => {
    setCooldown(RESEND_COOLDOWN_S);
    try {
      await api.verification.resendEmail();
      Alert.alert(t('Code sent'), t('A new code was sent to {email}.', {email: me?.email ?? ''}));
    } catch (e) {
      if (isApiError(e) && e.code === 'CONFLICT') {
        done();
      } else {
        Alert.alert(t('Error'), errorMessage(e));
      }
    }
  };

  return (
    <AuthLayout
      back={!pendingSetup}
      title={t('Verify your email')}
      subtitle={t('Enter the 6-digit code we sent to {email}.', {email: me?.email ?? ''})}>
      <TextField
        label={t('6-digit code')}
        value={code}
        onChangeText={v => {
          setCode(v.replace(/\D/g, '').slice(0, 6));
          setError(null);
        }}
        error={error}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        maxLength={6}
        onSubmitEditing={submit}
      />
      <FormError message={formError} />
      <PillButton title={t('Verify')} onPress={submit} loading={loading} style={authStyles.submit} />
      <View style={authStyles.linkRow}>
        <Text style={authStyles.linkMuted}>{t("Didn't get it?")} </Text>
        <Pressable accessibilityRole="button" disabled={cooldown > 0} onPress={resend}>
          <Text style={[authStyles.link, cooldown > 0 && styles.disabled]}>
            {cooldown > 0 ? t('Resend in {s}s', {s: cooldown}) : t('Resend code')}
          </Text>
        </Pressable>
      </View>
      {pendingSetup ? (
        <Pressable onPress={done} accessibilityRole="button" style={styles.later}>
          <Text style={authStyles.linkMuted}>{t("I'll do it later")}</Text>
        </Pressable>
      ) : null}
    </AuthLayout>
  );
}

const useStyles = makeStyles(c => ({
  disabled: {color: c.textMuted},
  later: {alignItems: 'center', marginTop: spacing.lg},
}));
