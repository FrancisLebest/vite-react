import React from 'react';
import {Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {t} from '../i18n';
import {useIsOffline} from '../offline/network';
import {font, makeStyles, spacing, useTheme, weight} from '../theme';
import {Icon} from './ui';

/** Shown at the bottom while the device has no connection. */
export function OfflineBanner() {
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const {colors} = useTheme();
  if (!offline) {
    return null;
  }
  return (
    <View
      style={[styles.banner, {paddingTop: insets.top + spacing.xs}]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none">
      <Icon name="cloud-offline-outline" size={16} color={colors.onPrimary} />
      <Text style={styles.text}>{t("You're offline — showing saved content")}</Text>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
    backgroundColor: c.textSecondary,
  },
  text: {color: c.onPrimary, fontSize: font.sm, fontWeight: weight.semibold, marginLeft: 6},
}));
