import {AppState, AppStateStatus, Platform} from 'react-native';
import {focusManager, QueryClient} from '@tanstack/react-query';
import {isApiError} from '../api/errors';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        cacheTime: 10 * 60_000,
        retry: (count, error) => {
          // Never retry client errors (401 is handled by the API client).
          if (isApiError(error) && error.status >= 400 && error.status < 500) {
            return false;
          }
          return count < 2;
        },
        refetchOnWindowFocus: true,
      },
      mutations: {retry: false},
    },
  });
}

/** React Query "window focus" = app returning to the foreground. */
export function setupFocusManager() {
  const onChange = (status: AppStateStatus) => {
    if (Platform.OS !== 'web') {
      focusManager.setFocused(status === 'active');
    }
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
