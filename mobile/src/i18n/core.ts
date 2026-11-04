/**
 * Tiny i18n core: English source strings are the keys.
 *   t('Sign in')                         → "Se connecter" (fr)
 *   t('{count} comments', {count: 3})    → plural-aware
 * Dictionaries map a key to a string or to plural forms (CLDR categories).
 */
export type Lang = 'en' | 'fr' | 'ar';
export const LANGS: Lang[] = ['fr', 'en', 'ar'];

export type PluralForms = Partial<Record<'zero' | 'one' | 'two' | 'few' | 'many', string>> & {
  other: string;
};
export type Entry = string | PluralForms;
export type Dictionary = Record<string, Entry>;

type PluralCategory = keyof PluralForms;

/** CLDR cardinal rules (integers) for our three languages. */
export function pluralCategory(lang: Lang, n: number): PluralCategory {
  const i = Math.floor(Math.abs(n));
  switch (lang) {
    case 'fr':
      return i === 0 || i === 1 ? 'one' : 'other';
    case 'ar': {
      const m = i % 100;
      if (i === 0) {
        return 'zero';
      }
      if (i === 1) {
        return 'one';
      }
      if (i === 2) {
        return 'two';
      }
      if (m >= 3 && m <= 10) {
        return 'few';
      }
      if (m >= 11 && m <= 99) {
        return 'many';
      }
      return 'other';
    }
    default:
      return i === 1 ? 'one' : 'other';
  }
}

export function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) {
    return s;
  }
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

export function translate(
  dicts: Partial<Record<Lang, Dictionary>>,
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const entry = dicts[lang]?.[key] ?? (lang !== 'en' ? dicts.en?.[key] : undefined) ?? key;
  let s: string;
  if (typeof entry === 'string') {
    s = entry;
  } else {
    const n = typeof params?.count === 'number' ? params.count : 0;
    const cat = pluralCategory(lang, n);
    s = entry[cat] ?? (cat === 'zero' && lang === 'ar' ? entry.other : undefined) ?? entry.other;
  }
  return interpolate(s, params);
}

/** Pick a supported language from a BCP-47-ish locale ("fr_FR", "ar-EG", "en-US"). */
export function langFromLocale(locale: string | undefined | null): Lang {
  const l = (locale ?? '').toLowerCase();
  if (l.startsWith('fr')) {
    return 'fr';
  }
  if (l.startsWith('ar')) {
    return 'ar';
  }
  return 'en';
}
