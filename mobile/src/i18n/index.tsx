import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {Alert, DevSettings, I18nManager, NativeModules, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Lang, langFromLocale, translate} from './core';
import {ar} from './ar';
import {en} from './en';
import {fr} from './fr';

export type {Lang} from './core';
export {LANGS} from './core';

const STORAGE_KEY = 'studyhub.lang.v1';
const dicts = {en, fr, ar};

function deviceLocale(): string | undefined {
  try {
    if (Platform.OS === 'ios') {
      const s = NativeModules.SettingsManager?.settings;
      return s?.AppleLocale || s?.AppleLanguages?.[0];
    }
    return NativeModules.I18nManager?.localeIdentifier;
  } catch {
    return undefined;
  }
}

let current: Lang = langFromLocale(deviceLocale());

/** Translate (usable outside React: alerts, helpers). */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(dicts, current, key, params);
}

export function getLang(): Lang {
  return current;
}

export const isRTLLang = (l: Lang) => l === 'ar';

export const LANGUAGE_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  ar: 'العربية',
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  isRTL: boolean;
}

const Ctx = createContext<I18nCtx>({lang: current, setLang: () => undefined, isRTL: false});
export const useI18n = () => useContext(Ctx);

/**
 * Language provider. Changing language remounts the tree (key) so every
 * `t()` call re-renders; switching to/from Arabic flips the layout direction,
 * which React Native only applies after an app restart.
 */
export function I18nProvider({children}: {children: React.ReactNode}) {
  const [lang, setLangState] = useState<Lang>(current);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => {
        if (v === 'fr' || v === 'en' || v === 'ar') {
          current = v;
          setLangState(v);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        I18nManager.allowRTL(true);
        setReady(true);
      });
  }, []);

  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      isRTL: I18nManager.isRTL,
      setLang: l => {
        current = l;
        setLangState(l);
        AsyncStorage.setItem(STORAGE_KEY, l).catch(() => undefined);
        const wantRTL = isRTLLang(l);
        if (wantRTL !== I18nManager.isRTL) {
          I18nManager.allowRTL(wantRTL);
          I18nManager.forceRTL(wantRTL);
          Alert.alert(
            t('Restart required'),
            t('Close and reopen StudyHub to apply the new layout direction.'),
            [
              {text: t('Later'), style: 'cancel'},
              ...(__DEV__ ? [{text: t('Restart now'), onPress: () => DevSettings.reload()}] : []),
            ],
          );
        }
      },
    }),
    [lang],
  );

  if (!ready) {
    return null;
  }
  return (
    <Ctx.Provider value={value}>
      <React.Fragment key={lang}>{children}</React.Fragment>
    </Ctx.Provider>
  );
}
