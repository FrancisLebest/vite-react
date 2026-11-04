import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Animated, Platform, Pressable, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useQueryClient} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {api} from '../api';
import {Icon} from '../components/ui';
import {t} from '../i18n';
import {navigateFromAnywhere} from '../navigation/ref';
import {font, makeStyles, radius, shadowFor, spacing, weight} from '../theme';
import {
  getInitialNotification,
  getPushToken,
  hasPushPermission,
  isPushAvailable,
  onForegroundMessage,
  onNotificationOpened,
  onTokenRefresh,
  RemoteMessage,
  requestPushPermission,
} from './firebase';
import {PushData, routeForPush} from './routes';

const ASKED_KEY = 'studyhub.push.asked.v1';
const platform = Platform.OS === 'ios' ? 'ios' : 'android';

let registeredToken: string | null = null;

async function registerToken(token: string | null) {
  if (!token || token === registeredToken) {
    return;
  }
  try {
    await api.push.register(token, platform);
    registeredToken = token;
  } catch {
    // retried on next launch / token refresh
  }
}

/** Call before logout: the backend stops pushing to this device. */
export async function unregisterPushToken() {
  const token = registeredToken ?? (isPushAvailable() ? await getPushToken() : null);
  registeredToken = null;
  if (token) {
    await api.push.unregister(token).catch(() => undefined);
  }
}

/**
 * Push notifications while signed in:
 * - asks permission once, after onboarding (`ready`), with a soft pre-prompt
 * - registers / refreshes the FCM token with POST /users/me/push-token
 * - foreground messages → in-app banner; taps → deep link to the content
 */
export function PushProvider({ready, children}: {ready: boolean; children: React.ReactNode}) {
  const qc = useQueryClient();
  const [banner, setBanner] = useState<RemoteMessage | null>(null);

  // Token registration + permission flow.
  useEffect(() => {
    if (!ready || !isPushAvailable()) {
      return;
    }
    let cancelled = false;
    (async () => {
      if (await hasPushPermission()) {
        registerToken(await getPushToken());
        return;
      }
      const asked = await AsyncStorage.getItem(ASKED_KEY).catch(() => null);
      if (asked || cancelled) {
        return;
      }
      await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
      Alert.alert(
        t('Stay in the loop'),
        t('Get notified about replies, new followers, messages and community events.'),
        [
          {text: t('Not now'), style: 'cancel'},
          {
            text: t('Turn on'),
            onPress: async () => {
              if (await requestPushPermission()) {
                registerToken(await getPushToken());
              }
            },
          },
        ],
      );
    })();
    const off = onTokenRefresh(tok => registerToken(tok));
    return () => {
      cancelled = true;
      off();
    };
  }, [ready]);

  // Foreground + opened notifications.
  useEffect(() => {
    if (!isPushAvailable()) {
      return;
    }
    const offFg = onForegroundMessage(m => {
      setBanner(m);
      qc.invalidateQueries(['unread']);
    });
    const offOpen = onNotificationOpened(m => navigateFromAnywhere(routeForPush(m.data as PushData)));
    getInitialNotification().then(m => {
      if (m) {
        navigateFromAnywhere(routeForPush(m.data as PushData));
      }
    });
    return () => {
      offFg();
      offOpen();
    };
  }, [qc]);

  return (
    <>
      {children}
      {banner ? <InAppBanner message={banner} onDone={() => setBanner(null)} /> : null}
    </>
  );
}

export function InAppBanner({message, onDone}: {message: RemoteMessage; onDone: () => void}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-150)).current;

  const hide = useCallback(
    () => Animated.timing(y, {toValue: -150, duration: 200, useNativeDriver: true}).start(onDone),
    [y, onDone],
  );

  useEffect(() => {
    Animated.spring(y, {toValue: 0, useNativeDriver: true}).start();
    const timer = setTimeout(hide, 4500);
    return () => clearTimeout(timer);
  }, [y, hide, message]);

  const title = message.notification?.title ?? t('StudyHub');
  const body = message.notification?.body ?? '';
  return (
    <Animated.View
      style={[styles.wrap, {paddingTop: insets.top + spacing.sm, transform: [{translateY: y}]}]}
      accessibilityLiveRegion="polite">
      <Pressable
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${body}`}
        accessibilityHint={t('Opens the notification')}
        onPress={() => {
          hide();
          navigateFromAnywhere(routeForPush(message.data as PushData));
        }}>
        <View style={styles.icon}>
          <Icon name="notifications" size={18} color={styles.iconColor.color} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {body ? (
            <Text style={styles.text} numberOfLines={2}>
              {body}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles(c => ({
  wrap: {position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.md},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    ...shadowFor(c),
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconColor: {color: c.onPrimary},
  body: {flex: 1, marginLeft: spacing.md},
  title: {fontSize: font.md, fontWeight: weight.bold, color: c.text},
  text: {fontSize: font.sm, color: c.textSecondary, marginTop: 2},
}));
