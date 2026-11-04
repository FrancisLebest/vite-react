import {useEffect, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {onlineManager} from '@tanstack/react-query';

/** React Query pauses fetches/mutations while offline and resumes on reconnect. */
export function setupOnlineManager() {
  onlineManager.setEventListener(setOnline =>
    NetInfo.addEventListener(state => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );
}

export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener(state =>
        setOffline(state.isConnected === false || state.isInternetReachable === false),
      ),
    [],
  );
  return offline;
}
