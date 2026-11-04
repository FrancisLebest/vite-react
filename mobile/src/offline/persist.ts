import AsyncStorage from '@react-native-async-storage/async-storage';
import {createAsyncStoragePersister} from '@tanstack/query-async-storage-persister';
import type {Query} from '@tanstack/react-query';
import type {PersistQueryClientOptions} from '@tanstack/react-query-persist-client';

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'studyhub.query-cache.v1',
  throttleTime: 2000,
});

/** Only the feeds (and categories) are persisted, so the app opens with content offline. */
export function shouldPersist(q: Query): boolean {
  const k = q.queryKey[0];
  return q.state.status === 'success' && (k === 'feed' || k === 'categories');
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: PERSIST_MAX_AGE,
  // bump when cached shapes change
  buster: 'v1.1',
  dehydrateOptions: {shouldDehydrateQuery: shouldPersist},
};
