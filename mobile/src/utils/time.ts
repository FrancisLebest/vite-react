const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export type TimeInput = number | string;
/** Accept epoch ms or ISO 8601 strings (API dates). */
export const toMs = (t: TimeInput): number =>
  typeof t === 'number' ? t : Date.parse(t) || 0;

/** Inbox style timestamp: "9:32 AM", "Yesterday", "Tue, Oct 28". */
export function inboxTime(input: TimeInput, now = Date.now()): string {
  const ts = toMs(input);
  const d = new Date(ts);
  const today = new Date(now);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  if (ts >= startOfToday) {
    return clock(d);
  }
  if (ts >= startOfToday - 24 * 3600 * 1000) {
    return 'Yesterday';
  }
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function clock(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "now", "5m", "3h", "2d", "Oct 28" */
export function timeAgo(input: TimeInput, now = Date.now()): string {
  const ts = toMs(input);
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) {
    return 'now';
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m`;
  }
  if (s < 86400) {
    return `${Math.floor(s / 3600)}h`;
  }
  if (s < 7 * 86400) {
    return `${Math.floor(s / 86400)}d`;
  }
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** 75 → "1:15" */
export function duration(sec: number | null | undefined): string {
  if (!sec || sec < 0) {
    return '';
  }
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
