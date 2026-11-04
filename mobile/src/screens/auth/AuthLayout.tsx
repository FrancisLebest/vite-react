import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {BackHeader, Logo, Screen} from '../../components/ui';
import {font, makeStyles, spacing, weight} from '../../theme';

export function AuthLayout({
  title,
  subtitle,
  back = true,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <Screen edges={['top', 'bottom']}>
      {back ? <BackHeader /> : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>
          <View style={styles.head}>
            <Logo size={40} />
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function FormError({message}: {message?: string | null}) {
  const styles = useStyles();
  if (!message) {
    return null;
  }
  return (
    <View style={styles.formError} accessibilityRole="alert">
      <Text style={styles.formErrorText}>{message}</Text>
    </View>
  );
}

export const useAuthStyles = makeStyles(c => ({
  submit: {marginTop: spacing.xl},
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  linkMuted: {color: c.textSecondary, fontSize: font.md},
  link: {color: c.primary, fontWeight: weight.semibold, fontSize: font.md},
  right: {alignSelf: 'flex-end', marginTop: spacing.sm, paddingVertical: 4},
}));

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  scroll: {padding: spacing.xl, paddingTop: spacing.sm, flexGrow: 1},
  head: {marginBottom: spacing.md},
  title: {
    fontSize: font.title,
    fontWeight: weight.bold,
    color: c.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: font.md,
    color: c.textSecondary,
    marginTop: spacing.xs,
  },
  formError: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: '#FDECEC',
  },
  formErrorText: {color: c.danger, fontSize: font.sm},
}));
