import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';
import {Alert, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {api, errorMessage} from '../api';
import type {ReportReason, ReportTarget} from '../api/types';
import {MAX_CONTENT_WIDTH, colors, font, radius, spacing, weight} from '../theme';
import {Icon} from './ui';

export interface SheetOption {
  label: string;
  icon?: string;
  destructive?: boolean;
  onPress: () => void;
}

interface SheetConfig {
  title?: string;
  message?: string;
  options: SheetOption[];
}

const Ctx = createContext<(c: SheetConfig) => void>(() => undefined);

/** Cross-platform action sheet (same look on iOS 12 and Android 7). */
export const useSheet = () => useContext(Ctx);

export function SheetProvider({children}: {children: React.ReactNode}) {
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<SheetConfig | null>(null);
  const close = () => setConfig(null);

  return (
    <Ctx.Provider value={setConfig}>
      {children}
      <Modal
        visible={!!config}
        transparent
        animationType="slide"
        onRequestClose={close}
        supportedOrientations={['portrait', 'landscape']}>
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityLabel="Close menu"
        />
        <View style={[styles.sheet, {paddingBottom: insets.bottom + spacing.md}]}>
          <View style={styles.handle} />
          {config?.title ? (
            <Text style={styles.title} accessibilityRole="header">
              {config.title}
            </Text>
          ) : null}
          {config?.message ? <Text style={styles.message}>{config.message}</Text> : null}
          {config?.options.map(o => (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              onPress={() => {
                close();
                // Let the modal close before alerts / navigation (iOS).
                setTimeout(o.onPress, 250);
              }}
              style={({pressed}) => [styles.option, pressed && styles.pressed]}>
              {o.icon ? (
                <Icon
                  name={o.icon}
                  size={22}
                  color={o.destructive ? colors.danger : colors.text}
                />
              ) : null}
              <Text style={[styles.optionText, o.destructive && styles.destructive]}>
                {o.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={close}
            accessibilityRole="button"
            style={({pressed}) => [styles.cancel, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const REASONS: {key: ReportReason; label: string}[] = [
  {key: 'spam', label: 'Spam'},
  {key: 'harassment', label: 'Harassment or bullying'},
  {key: 'inappropriate', label: 'Inappropriate content'},
  {key: 'other', label: 'Something else'},
];

/** Report flow (posts, comments, users, communities, messages). */
export function useReport() {
  const open = useSheet();
  return useCallback(
    (targetType: ReportTarget, targetId: string) =>
      open({
        title: `Report this ${targetType}`,
        message: 'Your report is anonymous. Why are you reporting it?',
        options: REASONS.map(r => ({
          label: r.label,
          onPress: () =>
            api.reports
              .create(targetType, targetId, r.key)
              .then(() =>
                Alert.alert('Thanks for letting us know', 'Our moderators will review it.'),
              )
              .catch(e => Alert.alert('Report failed', errorMessage(e))),
        })),
      }),
    [open],
  );
}

/** Confirm a destructive action with an explicit, named button. */
export function confirmDestructive(title: string, message: string, action: string) {
  return new Promise<boolean>(resolve =>
    Alert.alert(title, message, [
      {text: 'Cancel', style: 'cancel', onPress: () => resolve(false)},
      {text: action, style: 'destructive', onPress: () => resolve(true)},
    ]),
  );
}

export function useSheetMemo(config: SheetConfig) {
  const open = useSheet();
  return useMemo(() => () => open(config), [open, config]);
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: colors.overlay},
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  title: {
    fontSize: font.lg,
    fontWeight: weight.bold,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  message: {
    fontSize: font.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: {fontSize: font.lg, color: colors.text, marginLeft: spacing.md},
  destructive: {color: colors.danger},
  pressed: {opacity: 0.6},
  cancel: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {fontSize: font.lg, fontWeight: weight.semibold, color: colors.text},
});
