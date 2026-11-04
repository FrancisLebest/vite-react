import React from 'react';
import {Pressable, Switch, Text, View} from 'react-native';
import {font, makeStyles, spacing, useTheme} from '../theme';
import {Icon} from './ui';

export function SwitchRow({
  icon,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  icon?: string;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      {icon ? <Icon name={icon} size={22} color={colors.primary} /> : null}
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{false: colors.border, true: colors.primaryLight}}
        thumbColor={value ? colors.primary : colors.surface}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

export function NavRow({
  icon,
  label,
  value,
  onPress,
  destructive,
  badge,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
  badge?: number;
}) {
  const styles = useStyles();
  const {colors} = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={destructive ? colors.danger : colors.primary} />
      <View style={styles.body}>
        <Text style={[styles.label, destructive && styles.danger]}>{label}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {!destructive ? <Icon name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export function SectionLabel({children}: {children: string}) {
  const styles = useStyles();
  return (
    <Text style={styles.section} accessibilityRole="header">
      {children}
    </Text>
  );
}

const useStyles = makeStyles(c => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.6},
  body: {flex: 1, marginHorizontal: spacing.md},
  label: {fontSize: font.md, color: c.text},
  hint: {fontSize: font.xs, color: c.textSecondary, marginTop: 2},
  danger: {color: c.danger},
  value: {fontSize: font.sm, color: c.textSecondary, marginRight: spacing.xs},
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  badgeText: {color: c.onPrimary, fontSize: 11, fontWeight: '700'},
  section: {
    fontSize: font.sm,
    fontWeight: '600',
    color: c.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
}));
