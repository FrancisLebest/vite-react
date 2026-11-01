/** Client-side validation mirroring the API contract rules. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME = /^[a-z0-9._]{3,30}$/;

export const validators = {
  required: (v: string, label = 'This field') =>
    v.trim() ? null : `${label} is required.`,
  email: (v: string) =>
    !v.trim()
      ? 'Email is required.'
      : EMAIL.test(v.trim())
      ? null
      : 'Enter a valid email address.',
  username: (v: string) =>
    !v.trim()
      ? 'Username is required.'
      : USERNAME.test(v.trim())
      ? null
      : '3–30 characters: lowercase letters, numbers, "." or "_".',
  password: (v: string) =>
    !v ? 'Password is required.' : v.length >= 8 ? null : 'Use at least 8 characters.',
  name: (v: string) =>
    v.trim().length >= 2 ? null : 'Enter your name (at least 2 characters).',
  code: (v: string) => (/^\d{6}$/.test(v.trim()) ? null : 'Enter the 6-digit code.'),
};

export type Errors<K extends string> = Partial<Record<K, string | null>>;

export function hasErrors<K extends string>(e: Errors<K>): boolean {
  return Object.values(e).some(Boolean);
}
