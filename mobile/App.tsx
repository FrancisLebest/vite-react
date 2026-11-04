import React, {useEffect, useMemo, useState} from 'react';
import {StatusBar} from 'react-native';
import {DarkTheme, DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {PersistQueryClientProvider} from '@tanstack/react-query-persist-client';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AuthProvider} from './src/auth/AuthContext';
import {OfflineBanner} from './src/components/OfflineBanner';
import {SheetProvider} from './src/components/Sheet';
import {I18nProvider} from './src/i18n';
import {linking} from './src/linking';
import RootNavigator from './src/navigation/RootNavigator';
import {navigationRef} from './src/navigation/ref';
import {setupOnlineManager} from './src/offline/network';
import {persistOptions} from './src/offline/persist';
import {createQueryClient, setupFocusManager} from './src/query/queryClient';
import {ThemeProvider, useTheme} from './src/theme';

function ThemedNavigation() {
  const {colors, dark} = useTheme();
  const navTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [colors, dark]);
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <RootNavigator />
      <OfflineBanner />
    </NavigationContainer>
  );
}

function Shell() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <SheetProvider>
              <ThemedNavigation />
            </SheetProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * `queryClient` is injected by tests (no persistence there). In the app the
 * feed cache is persisted to AsyncStorage so the app opens with content offline.
 */
export default function App({queryClient}: {queryClient?: QueryClient}) {
  const [qc] = useState(() => queryClient ?? createQueryClient());
  useEffect(() => {
    setupOnlineManager();
    return setupFocusManager();
  }, []);
  if (queryClient) {
    return (
      <QueryClientProvider client={qc}>
        <Shell />
      </QueryClientProvider>
    );
  }
  return (
    <PersistQueryClientProvider client={qc} persistOptions={persistOptions}>
      <Shell />
    </PersistQueryClientProvider>
  );
}
