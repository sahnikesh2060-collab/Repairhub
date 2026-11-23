import { differenceInCalendarDays, format, formatDistanceStrict, isValid } from 'date-fns';
import { CURRENCY } from './constants.js';

const toDate = (value) => (value instanceof Date ? value : new Date(value));

const moneyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

/** Whole currency units, e.g. "NPR 1,200". Returns '' for empty values. */
export function formatMoney(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '';
  return moneyFormatter.format(Number(amount));
}

/** Exact local time, e.g. "23 Nov 2026, 3:30 PM". */
export function formatDateTime(value) {
  const d = toDate(value);
  return isValid(d) ? format(d, 'd MMM yyyy, h:mm a') : '';
}

export function formatDate(value) {
  const d = toDate(value);
  return isValid(d) ? format(d, 'd MMM yyyy') : '';
}

export function formatTime(value) {
  const d = toDate(value);
  return isValid(d) ? format(d, 'h:mm a') : '';
}

/** "Today, 3:30 PM", "Tomorrow, 10:00 AM", "Yesterday, 9:00 AM" or "Mon 24 Nov, 10:00 AM". */
export function formatFriendlyDateTime(value, now = new Date()) {
  const d = toDate(value);
  if (!isValid(d)) return '';
  const diff = differenceInCalendarDays(d, now);
  const time = format(d, 'h:mm a');
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  if (diff === -1) return `Yesterday, ${time}`;
  return format(d, 'EEE d MMM, h:mm a');
}

/** "5 minutes ago", "in 2 hours". `now` lets a ticking clock re-render it. */
export function relativeTime(value, now = new Date()) {
  const d = toDate(value);
  if (!isValid(d)) return '';
  if (Math.abs(now.getTime() - d.getTime()) < 45_000) return 'just now';
  return formatDistanceStrict(d, now, { addSuffix: true });
}

/** "updated 20 s ago" style, in seconds then minutes. */
export function secondsAgo(value, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - toDate(value).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  return `${m} min ago`;
}

export function formatDistance(km) {
  if (km === null || km === undefined) return '';
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function firstName(name = '') {
  return name.split(/\s+/)[0] ?? '';
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
