import type { Locale } from './locales';

/**
 * Locale-aware formatting helpers built on Intl. Somali ('so') CLDR data
 * ships with modern browsers and Node's full-icu, but every helper still
 * falls back to English formatting rather than throwing if it is absent.
 */

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat('en', options).format(value);
  }
}

export function formatDate(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  // An invalid Date makes Intl throw RangeError in BOTH branches below —
  // degrade instead: one bad timestamp must never crash a whole screen.
  if (!Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.DateTimeFormat(locale, options).format(value);
  } catch {
    return new Intl.DateTimeFormat('en', options).format(value);
  }
}

const RELATIVE_TIME_DIVISIONS: ReadonlyArray<{
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

/** "3 days ago" / "3 maalmood ka hor" — for feeds and notifications. */
export function formatRelativeTime(
  target: Date | number,
  locale: Locale,
  now: Date | number = Date.now(),
): string {
  let duration = (Number(target) - Number(now)) / 1000;

  let formatter: Intl.RelativeTimeFormat;
  try {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  }

  // NaN (invalid Date) survives every `<` guard below and Intl throws
  // RangeError on non-finite values — degrade to "now" instead of crashing.
  if (!Number.isFinite(duration)) return formatter.format(0, 'second');

  for (const division of RELATIVE_TIME_DIVISIONS) {
    // Round before comparing so the shown value never reaches the unit
    // boundary ("59.6s" must become "in 1 minute", not "in 60 seconds").
    if (Math.abs(Math.round(duration)) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  // Unreachable for finite input: the last division is unbounded.
  return formatter.format(Math.round(duration), 'year');
}
