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

  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  // Unreachable: the last division is unbounded.
  return formatter.format(Math.round(duration), 'year');
}
