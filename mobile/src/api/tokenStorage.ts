import * as Keychain from 'react-native-keychain';
import type {TokenStorage} from './client';
import type {TokenPair} from './types';

const SERVICE = 'com.studyhub.auth';

/** Access + refresh tokens live in the iOS Keychain / Android Keystore. */
export const keychainTokenStorage: TokenStorage = {
  async load() {
    const res = await Keychain.getGenericPassword({service: SERVICE});
    if (!res) {
      return null;
    }
    try {
      const pair = JSON.parse(res.password) as TokenPair;
      return pair.accessToken && pair.refreshToken ? pair : null;
    } catch {
      return null;
    }
  },
  async save(tokens) {
    await Keychain.setGenericPassword('studyhub', JSON.stringify(tokens), {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
    });
  },
  async clear() {
    await Keychain.resetGenericPassword({service: SERVICE});
  },
};
