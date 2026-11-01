import React, {useEffect, useState} from 'react';
import {StatusBar} from 'react-native';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AuthProvider} from './src/auth/AuthContext';
import {SheetProvider} from './src/components/Sheet';
import RootNavigator from './src/navigation/RootNavigator';
import {createQueryClient, setupFocusManager} from './src/query/queryClient';
import {colors} from './src/theme';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.white,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

export default function App({queryClient}: {queryClient?: QueryClient}) {
  const [qc] = useState(() => queryClient ?? createQueryClient());
  useEffect(() => setupFocusManager(), []);
  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider>
        <AuthProvider>
          <SheetProvider>
            <NavigationContainer theme={navTheme}>
              <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
              <RootNavigator />
            </NavigationContainer>
          </SheetProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
