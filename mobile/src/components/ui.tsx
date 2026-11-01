import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {
  MAX_CONTENT_WIDTH,
  colors,
  font,
  radius,
  spacing,
  weight,
} from '../theme';

export {Icon};

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */

export function Logo({
  size = 30,
  color = colors.primary,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Icon
      name="school"
      size={size}
      color={color}
      accessibilityLabel="StudyHub"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

export function Avatar({
  uri,
  size = 44,
  online,
  ring,
  style,
}: {
  uri?: string;
  size?: number;
  online?: boolean;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{width: size, height: size}, style]}>
      <Image
        source={uri ? {uri} : {}}
        style={[
          styles.avatar,
          {width: size, height: size, borderRadius: size / 2},
          ring && styles.avatarRing,
        ]}
      />
      {online ? (
        <View
          style={[
            styles.onlineDot,
            {
              width: size * 0.26,
              height: size * 0.26,
              borderRadius: size * 0.13,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** Round avatar replacement for groups / communities (icon on tinted circle). */
export function IconAvatar({
  name,
  color = colors.primary,
  size = 44,
  filled,
}: {
  name: string;
  color?: string;
  size?: number;
  filled?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: filled ? color : colors.primarySoft,
        ...styles.center,
      }}>
      <Icon
        name={name}
        size={size * 0.5}
        color={filled ? colors.white : color}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function IconButton({
  name,
  onPress,
  size = 24,
  color = colors.text,
  badge,
  label,
  style,
}: {
  name: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  badge?: number;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [
        styles.iconButton,
        pressed && styles.pressed,
        style,
      ]}>
      <Icon name={name} size={size} color={color} />
      {badge ? <Badge count={badge} style={styles.iconBadge} /> : null}
    </Pressable>
  );
}

export function Badge({
  count,
  style,
}: {
  count: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

type PillVariant = 'solid' | 'outline' | 'soft';

export function PillButton({
  title,
  onPress,
  variant = 'solid',
  icon,
  small,
  style,
  disabled,
}: {
  title: string;
  onPress?: () => void;
  variant?: PillVariant;
  icon?: string;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const fg =
    variant === 'solid'
      ? colors.white
      : variant === 'soft'
      ? colors.primary
      : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      style={({pressed}) => [
        styles.pill,
        small && styles.pillSmall,
        variant === 'solid' && styles.pillSolid,
        variant === 'outline' && styles.pillOutline,
        variant === 'soft' && styles.pillSoft,
        (pressed || disabled) && styles.pressed,
        style,
      ]}>
      {icon ? (
        <Icon
          name={icon}
          size={small ? 14 : 18}
          color={fg}
          style={styles.pillIcon}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.pillText, small && styles.pillTextSmall, {color: fg}]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Follow / Following toggle used across feed, search, users. */
export function FollowButton({
  following,
  onPress,
  small = true,
}: {
  following: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <PillButton
      small={small}
      title={following ? 'Following' : 'Follow'}
      variant={following ? 'outline' : 'solid'}
      onPress={onPress}
      style={styles.followBtn}
    />
  );
}

export function JoinButton({
  joined,
  onPress,
}: {
  joined: boolean;
  onPress: () => void;
}) {
  return (
    <PillButton
      small
      title={joined ? 'Joined' : 'Join'}
      variant={joined ? 'soft' : 'solid'}
      onPress={onPress}
      style={styles.joinBtn}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export function Chip({
  label,
  active,
  onPress,
  badge,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{selected: !!active}}
      style={({pressed}) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
      {badge ? <Badge count={badge} style={styles.chipBadge} /> : null}
    </Pressable>
  );
}

export function ChipRow<T extends string>({
  items,
  value,
  onChange,
  badges,
  style,
}: {
  items: {key: T; label: string}[];
  value: T;
  onChange: (key: T) => void;
  badges?: Partial<Record<T, number>>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={[styles.chipRow, style]}>
      {items.map(it => (
        <Chip
          key={it.key}
          label={it.label}
          active={it.key === value}
          onPress={() => onChange(it.key)}
          badge={badges?.[it.key]}
        />
      ))}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function SearchInput({
  style,
  onClear,
  ...props
}: TextInputProps & {style?: StyleProp<ViewStyle>; onClear?: () => void}) {
  return (
    <View style={[styles.search, style]}>
      <Icon name="search" size={18} color={colors.textMuted} />
      <TextInput
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        underlineColorAndroid="transparent"
        style={styles.searchInput}
        {...props}
      />
      {onClear && props.value ? (
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityLabel="Clear search">
          <Icon name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

export function SectionHeader({
  title,
  onSeeAll,
  emoji,
}: {
  title: string;
  onSeeAll?: () => void;
  emoji?: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
        {emoji ? ` ${emoji}` : ''}
      </Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAll}>
          <Text style={styles.seeAllText}>See All</Text>
          <Icon name="chevron-forward" size={14} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ScreenHeader({
  title,
  right,
  showLogo = true,
}: {
  title?: string;
  right?: React.ReactNode;
  showLogo?: boolean;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {showLogo ? <Logo /> : null}
        {title ? (
          <Text
            style={styles.headerTitle}
            accessibilityRole="header"
            numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function VerifiedBadge({size = 14}: {size?: number}) {
  return (
    <Icon
      name="checkmark-circle"
      size={size}
      color={colors.primaryLight}
      accessibilityLabel="Verified"
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message?: string;
  action?: {label: string; onPress: () => void};
}) {
  return (
    <View style={styles.empty}>
      <IconAvatar name={icon} size={64} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action ? (
        <PillButton
          title={action.label}
          onPress={action.onPress}
          style={styles.emptyAction}
        />
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  pressed: {opacity: 0.6},
  center: {alignItems: 'center', justifyContent: 'center'},
  avatar: {backgroundColor: colors.primarySoft},
  avatarRing: {borderWidth: 2, borderColor: colors.white},
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
  },
  iconButton: {padding: spacing.xs},
  iconBadge: {position: 'absolute', top: -2, right: -4},
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  badgeText: {color: colors.white, fontSize: 10, fontWeight: weight.bold},
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    height: 48,
    borderRadius: radius.pill,
  },
  pillSmall: {height: 32, paddingHorizontal: spacing.lg},
  pillSolid: {backgroundColor: colors.primary},
  pillOutline: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  pillSoft: {backgroundColor: colors.primarySoft},
  pillIcon: {marginRight: spacing.sm},
  pillText: {fontSize: font.lg, fontWeight: weight.semibold},
  pillTextSmall: {fontSize: font.sm},
  followBtn: {minWidth: 92},
  joinBtn: {minWidth: 76},
  chipScroll: {flexGrow: 0, flexShrink: 0},
  chipRow: {paddingHorizontal: spacing.lg, paddingVertical: spacing.xs},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {fontSize: font.sm, color: colors.text, fontWeight: weight.medium},
  chipTextActive: {color: colors.white, fontWeight: weight.semibold},
  chipBadge: {marginLeft: spacing.xs},
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    marginHorizontal: spacing.sm,
    fontSize: font.md,
    color: colors.text,
    paddingVertical: 0, // Android adds vertical padding by default
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: font.xl,
    fontWeight: weight.bold,
    color: colors.text,
  },
  seeAll: {flexDirection: 'row', alignItems: 'center'},
  seeAllText: {fontSize: font.sm, color: colors.textSecondary, marginRight: 2},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  headerLeft: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  headerTitle: {
    fontSize: font.xxl,
    fontWeight: weight.bold,
    color: colors.text,
    marginLeft: spacing.md,
    flexShrink: 1,
  },
  headerRight: {flexDirection: 'row', alignItems: 'center'},
  empty: {alignItems: 'center', padding: spacing.xxxl},
  emptyTitle: {
    fontSize: font.lg,
    fontWeight: weight.bold,
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: font.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyAction: {marginTop: spacing.lg},
  divider: {height: StyleSheet.hairlineWidth, backgroundColor: colors.border},
});

/* ------------------------------------------------------------------ */
/* Screen containers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Safe-area aware screen. Content is centred and capped to a readable width
 * on tablets / landscape while staying full-width on phones.
 */
export function Screen({
  children,
  edges = ['top'],
  style,
}: {
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={edges} style={screenStyles.safe}>
      <View style={[screenStyles.column, style]}>{children}</View>
    </SafeAreaView>
  );
}

export function BackHeader({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const navigation = useNavigation();
  return (
    <View style={screenStyles.backHeader}>
      <IconButton
        name="chevron-back"
        label="Go back"
        size={26}
        onPress={() => navigation.goBack()}
      />
      {children ?? (
        <Text
          style={screenStyles.backTitle}
          numberOfLines={1}
          accessibilityRole="header">
          {title}
        </Text>
      )}
      <View style={screenStyles.backRight}>{right}</View>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.background},
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  backTitle: {
    flex: 1,
    fontSize: font.xl,
    fontWeight: weight.bold,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  backRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
});
