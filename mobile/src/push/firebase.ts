/**
 * Thin, crash-proof wrapper around @react-native-firebase.
 * Firebase is optional: when google-services.json / GoogleService-Info.plist
 * are absent no default app exists and every function becomes a no-op.
 */
import {PermissionsAndroid, Platform} from 'react-native';
import firebase from '@react-native-firebase/app';
import messaging, {FirebaseMessagingTypes} from '@react-native-firebase/messaging';

export type RemoteMessage = FirebaseMessagingTypes.RemoteMessage;

export function isPushAvailable(): boolean {
  try {
    return firebase.apps.length > 0;
  } catch {
    return false;
  }
}

export async function hasPushPermission(): Promise<boolean> {
  if (!isPushAvailable()) {
    return false;
  }
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version < 33) {
        return true;
      }
      return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    const s = await messaging().hasPermission();
    return (
      s === messaging.AuthorizationStatus.AUTHORIZED ||
      s === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushAvailable()) {
    return false;
  }
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version < 33) {
        return true;
      }
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      return r === PermissionsAndroid.RESULTS.GRANTED;
    }
    const s = await messaging().requestPermission();
    return (
      s === messaging.AuthorizationStatus.AUTHORIZED ||
      s === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

export async function getPushToken(): Promise<string | null> {
  if (!isPushAvailable()) {
    return null;
  }
  try {
    if (Platform.OS === 'ios' && !messaging().isDeviceRegisteredForRemoteMessages) {
      await messaging().registerDeviceForRemoteMessages();
    }
    return await messaging().getToken();
  } catch {
    return null;
  }
}

export async function deletePushToken() {
  if (isPushAvailable()) {
    await messaging()
      .deleteToken()
      .catch(() => undefined);
  }
}

type Unsub = () => void;
const noop: Unsub = () => undefined;

export function onTokenRefresh(cb: (token: string) => void): Unsub {
  return isPushAvailable() ? messaging().onTokenRefresh(cb) : noop;
}

export function onForegroundMessage(cb: (m: RemoteMessage) => void): Unsub {
  return isPushAvailable() ? messaging().onMessage(async m => cb(m)) : noop;
}

export function onNotificationOpened(cb: (m: RemoteMessage) => void): Unsub {
  return isPushAvailable() ? messaging().onNotificationOpenedApp(cb) : noop;
}

export async function getInitialNotification(): Promise<RemoteMessage | null> {
  if (!isPushAvailable()) {
    return null;
  }
  return messaging()
    .getInitialNotification()
    .catch(() => null);
}

/** Must be registered at module load (index.js) for background/quit messages. */
export function registerBackgroundHandler() {
  if (isPushAvailable()) {
    messaging().setBackgroundMessageHandler(async () => undefined);
  }
}
