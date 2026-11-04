import {createNavigationContainerRef} from '@react-navigation/native';
import type {RootStackParamList} from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type Route = {[K in keyof RootStackParamList]: [K, RootStackParamList[K]]}[keyof RootStackParamList];

/** Navigate from outside React (push taps). Retries until the container is ready. */
export function navigateFromAnywhere(route: Route, attempt = 0) {
  if (navigationRef.isReady()) {
    (navigationRef.navigate as unknown as (name: string, params?: unknown) => void)(route[0], route[1]);
  } else if (attempt < 20) {
    setTimeout(() => navigateFromAnywhere(route, attempt + 1), 250);
  }
}
