import React from 'react';
import {Linking, Text, View} from 'react-native';
import {useAuth} from '../../auth/AuthContext';
import {IconAvatar, Logo, PillButton, Screen} from '../../components/ui';
import {t} from '../../i18n';
import {font, makeStyles, spacing, weight} from '../../theme';

/** Shown on ACCOUNT_SUSPENDED (any request, refresh or socket handshake). */
export default function SuspendedScreen() {
  const styles = useStyles();
  const {suspendedReason, logout} = useAuth();
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.wrap}>
        <Logo size={40} />
        <IconAvatar name="ban-outline" size={72} />
        <Text style={styles.title} accessibilityRole="header">
          {t('Your account is suspended')}
        </Text>
        <Text style={styles.text}>
          {t('You cannot use StudyHub while your account is suspended.')}
        </Text>
        {suspendedReason ? (
          <Text style={styles.reason}>{t('Reason: {reason}', {reason: suspendedReason})}</Text>
        ) : null}
        <PillButton
          title={t('Contact support')}
          variant="outline"
          icon="mail-outline"
          style={styles.btn}
          onPress={() => Linking.openURL('mailto:support@studyhub.app').catch(() => undefined)}
        />
        <PillButton title={t('Sign out')} style={styles.btn} onPress={logout} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl},
  title: {fontSize: font.xxl, fontWeight: weight.bold, color: c.text, marginTop: spacing.lg, textAlign: 'center'},
  text: {fontSize: font.md, color: c.textSecondary, textAlign: 'center', marginTop: spacing.sm},
  reason: {fontSize: font.md, color: c.text, textAlign: 'center', marginTop: spacing.md},
  btn: {alignSelf: 'stretch', marginTop: spacing.md},
}));
