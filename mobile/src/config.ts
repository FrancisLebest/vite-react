import {Platform} from 'react-native';
import {API_URL, PRODUCTION_API_URL} from './env';

const DEV_DEFAULT = Platform.select({
  // The Android emulator reaches the host machine through 10.0.2.2.
  android: 'http://10.0.2.2:4000',
  default: 'http://localhost:4000',
});

function resolveApiUrl(): string {
  if (API_URL) {
    return API_URL;
  }
  if (!__DEV__ && PRODUCTION_API_URL) {
    return PRODUCTION_API_URL;
  }
  return DEV_DEFAULT;
}

/** Backend origin, without trailing slash and without /api/v1. */
export const API_ORIGIN = resolveApiUrl().replace(/\/+$/, '');

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

/**
 * Media URLs are absolute (server PUBLIC_URL). In development the server often
 * advertises http://localhost:4000, which an Android emulator or a phone cannot
 * reach: rewrite loopback origins to the configured API origin.
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  if (LOOPBACK.test(url) && !LOOPBACK.test(API_ORIGIN)) {
    return url.replace(LOOPBACK, API_ORIGIN);
  }
  return url;
}

export const PAGE_SIZE = 20;
