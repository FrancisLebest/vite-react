/**
 * Basic profanity / blocklist filter.
 * - CONTENT_FILTER=mask (default): blocked words are replaced by "*".
 * - CONTENT_FILTER=reject: the request fails with VALIDATION_ERROR (code "blocked_words").
 * - CONTENT_FILTER=off: disabled.
 * Words are matched per token, case- and accent-insensitively. Entries of 4+ letters also match
 * as a prefix (e.g. "fuck" → "fucking"). Extra words: CONTENT_FILTER_WORDS (comma separated);
 * CONTENT_FILTER_DEFAULTS=false disables the built-in list.
 */
import { config } from '../config.js';
import { ApiError } from './errors.js';

const DEFAULT_WORDS = [
  // English
  'fuck', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole', 'bastard', 'nigger', 'nigga',
  'faggot', 'retard', 'whore', 'slut',
  // French
  'connard', 'connasse', 'salope', 'pute', 'putain', 'encule', 'enculer', 'batard', 'fdp', 'ntm', 'nique',
  'niquer', 'pede', 'tapette', 'bougnoule', 'negro',
];

export function normalizeWord(w: string): string {
  return w.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

let words: Set<string> = new Set();
let prefixes: string[] = [];

export function setBlockedWords(list: string[]): void {
  words = new Set(list.map((w) => normalizeWord(w.trim())).filter(Boolean));
  prefixes = [...words].filter((w) => w.length >= 4);
}

setBlockedWords([
  ...(config.CONTENT_FILTER_DEFAULTS ? DEFAULT_WORDS : []),
  ...config.CONTENT_FILTER_WORDS.split(','),
]);

function isBlocked(token: string): boolean {
  const n = normalizeWord(token);
  if (words.has(n)) return true;
  return prefixes.some((p) => n.startsWith(p));
}

/** Returns the text with blocked words masked, or throws in reject mode. */
export function filterText(text: string, field: string, mode = config.CONTENT_FILTER): string {
  if (mode === 'off' || !text) return text;
  let found = false;
  const out = text.replace(/[\p{L}\p{N}]+/gu, (tok) => {
    if (!isBlocked(tok)) return tok;
    found = true;
    return '*'.repeat([...tok].length);
  });
  if (found && mode === 'reject') {
    throw new ApiError('VALIDATION_ERROR', `${field}: Contains blocked words`, [
      { path: field, message: 'Contains blocked words', code: 'blocked_words' },
    ]);
  }
  return out;
}

/** Same as filterText but passes null/undefined through. */
export function filterOptional<T extends string | null | undefined>(text: T, field: string): T {
  return (typeof text === 'string' ? filterText(text, field) : text) as T;
}
