import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {StyleSheet, useColorScheme} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {darkColors, lightColors, Palette} from './palette';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'studyhub.theme.v1';

interface ThemeCtx {
  colors: Palette;
  dark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({
  colors: lightColors,
  dark: false,
  mode: 'system',
  setMode: () => undefined,
});

/** Follows the OS appearance, with a persisted manual override. */
export function ThemeProvider({children}: {children: React.ReactNode}) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => {
        if (v === 'light' || v === 'dark' || v === 'system') {
          setModeState(v);
        }
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo<ThemeCtx>(() => {
    const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
    return {
      colors: dark ? darkColors : lightColors,
      dark,
      mode,
      setMode: m => {
        setModeState(m);
        AsyncStorage.setItem(STORAGE_KEY, m).catch(() => undefined);
      },
    };
  }, [mode, system]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

/**
 * Theme-aware StyleSheet: `const useStyles = makeStyles(c => ({...}))`, then
 * `const styles = useStyles()` inside the component. One StyleSheet per palette.
 */
export function makeStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>,
>(factory: (c: Palette) => T | StyleSheet.NamedStyles<T>) {
  const cache = new Map<Palette, T>();
  return function useStyles(): T {
    const {colors} = useTheme();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors)) as T;
      cache.set(colors, styles);
    }
    return styles;
  };
}
