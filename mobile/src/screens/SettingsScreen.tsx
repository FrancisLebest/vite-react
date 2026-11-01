import React, {useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {errorMessage} from '../api';
import {useAuth} from '../auth/AuthContext';
import {confirmDestructive} from '../components/Sheet';
import {Avatar, BackHeader, Icon, Screen} from '../components/ui';
import {API_ORIGIN} from '../config';
import type {RootScreenProps} from '../navigation/types';
import {colors, font, radius, spacing, weight} from '../theme';

export default function SettingsScreen({
  navigation,
}: RootScreenProps<'Settings'>) {
  const {me, logout, deleteAccount} = useAuth();
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    if (
      await confirmDestructive(
        'Log out?',
        'You can sign back in at any time.',
        'Log out',
      )
    ) {
      setBusy(true);
      await logout();
    }
  };

  const onDelete = async () => {
    const ok = await confirmDestructive(
      'Delete your account?',
      'Your profile, videos, posts, comments and messages will be permanently deleted. This cannot be undone.',
      'Delete account',
    );
    if (!ok) {
      return;
    }
    const sure = await confirmDestructive(
      'Are you absolutely sure?',
      `@${me?.username} will be deleted forever.`,
      'Delete forever',
    );
    if (!sure) {
      return;
    }
    setBusy(true);
    try {
      await deleteAccount();
    } catch (e) {
      setBusy(false);
      Alert.alert("Couldn't delete the account", errorMessage(e));
    }
  };

  return (
    <Screen>
      <BackHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Avatar uri={me?.avatarUrl} name={me?.name} size={52} />
          <View style={styles.cardBody}>
            <Text style={styles.name}>{me?.name}</Text>
            <Text style={styles.sub}>{me?.email}</Text>
          </View>
        </View>

        <Text style={styles.section}>Account</Text>
        <Row
          icon="create-outline"
          label="Edit profile"
          onPress={() => navigation.navigate('EditProfile')}
        />
        <Row
          icon="key-outline"
          label="Change password"
          onPress={() => navigation.navigate('ChangePassword')}
        />
        <Row
          icon="ban-outline"
          label="Blocked accounts"
          onPress={() => navigation.navigate('BlockedUsers')}
        />

        <Text style={styles.section}>Session</Text>
        <Row
          icon="log-out-outline"
          label="Log out"
          onPress={onLogout}
          disabled={busy}
        />
        <Row
          icon="trash-outline"
          label="Delete account"
          destructive
          onPress={onDelete}
          disabled={busy}
        />
        <Text style={styles.footer}>StudyHub · {API_ORIGIN}</Text>
      </ScrollView>
    </Screen>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({pressed}) => [
        styles.row,
        (pressed || disabled) && styles.pressed,
      ]}>
      <Icon
        name={icon}
        size={22}
        color={destructive ? colors.danger : colors.primary}
      />
      <Text style={[styles.rowText, destructive && styles.danger]}>
        {label}
      </Text>
      {!destructive ? (
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {padding: spacing.lg},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
  },
  cardBody: {marginLeft: spacing.md, flex: 1},
  name: {fontSize: font.lg, fontWeight: weight.bold, color: colors.text},
  sub: {fontSize: font.sm, color: colors.textSecondary},
  section: {
    fontSize: font.sm,
    fontWeight: weight.semibold,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {opacity: 0.6},
  rowText: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: font.md,
    color: colors.text,
  },
  danger: {color: colors.danger},
  footer: {
    fontSize: font.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
