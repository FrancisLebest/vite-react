import {getLang, t} from '../i18n';

const MONTHS: Record<string, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};
const DAYS: Record<string, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export type TimeInput = number | string | Date;
/** Accept epoch ms, ISO 8601 strings (API dates) or Date. */
export const toMs = (t0: TimeInput): number =>
  t0 instanceof Date ? t0.getTime() : typeof t0 === 'number' ? t0 : Date.parse(t0) || 0;

export const monthName = (m: number) => (MONTHS[getLang()] ?? MONTHS.en)[m];
export const weekdayShort = (d: number) => (DAYS[getLang()] ?? DAYS.en)[d];

/** "9:32 AM" (en) / "09:32" (fr, ar) */
export function clock(d: Date): string {
  const h = d.getHours();
  if (getLang() !== 'en') {
    return `${pad(h)}:${pad(d.getMinutes())}`;
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Oct 28" / "28 oct." */
export function shortDate(d: Date): string {
  return getLang() === 'en' ? `${monthName(d.getMonth())} ${d.getDate()}` : `${d.getDate()} ${monthName(d.getMonth())}`;
}

/** "Tue, Oct 28, 2026 · 6:00 PM" */
export function formatDateTime(input: TimeInput): string {
  const d = new Date(toMs(input));
  return `${weekdayShort(d.getDay())} ${shortDate(d)} ${d.getFullYear()} · ${clock(d)}`;
}

/** Inbox style timestamp: "9:32 AM", "Yesterday", "Tue, Oct 28". */
export function inboxTime(input: TimeInput, now = Date.now()): string {
  const ts = toMs(input);
  const d = new Date(ts);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= startOfToday) {
    return clock(d);
  }
  if (ts >= startOfToday - 24 * 3600 * 1000) {
    return t('Yesterday');
  }
  return `${weekdayShort(d.getDay())}, ${shortDate(d)}`;
}

/** "now", "5m", "3h", "2d", "Oct 28" */
export function timeAgo(input: TimeInput, now = Date.now()): string {
  const ts = toMs(input);
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) {
    return t('now');
  }
  if (s < 3600) {
    return t('{n}m', {n: Math.floor(s / 60)});
  }
  if (s < 86400) {
    return t('{n}h', {n: Math.floor(s / 3600)});
  }
  if (s < 7 * 86400) {
    return t('{n}d', {n: Math.floor(s / 86400)});
  }
  return shortDate(new Date(ts));
}

/** 75 → "1:15" */
export function duration(sec: number | null | undefined): string {
  if (!sec || sec < 0) {
    return '';
  }
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** "2026-10-28" (UTC day) → "28 oct." for chart axes. */
export function dayLabel(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  return shortDate(new Date(y, (m || 1) - 1, d || 1));
}
