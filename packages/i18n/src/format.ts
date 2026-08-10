import { en, type MessageKey } from './dictionaries/en';
import { so } from './dictionaries/so';
import type { Locale } from './locales';
import { isPluralMessage, type Message } from './messages';

/**
 * Locale-aware formatting helpers.
 *
 * Numbers and dates ride on Intl (falling back to English formatting rather
 * than throwing when data is absent). Relative time deliberately does NOT:
 * Intl.RelativeTimeFormat output depends on the runtime's ICU build, and a
 * server whose ICU lacks Somali CLDR silently falls back to English without
 * throwing — so SSR HTML and browser output diverged and every Somali time
 * node hydration-mismatched. Relative-time copy lives in the dictionaries
 * (`time.*`), giving server and client one data source on every runtime.
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

type RelativeTimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const RELATIVE_TIME_DIVISIONS: ReadonlyArray<{
  amount: number;
  unit: RelativeTimeUnit;
}> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const RELATIVE_TIME_KEYS: Record<RelativeTimeUnit, { past: MessageKey; future: MessageKey }> = {
  second: { past: 'time.secondsAgo', future: 'time.inSeconds' },
  minute: { past: 'time.minutesAgo', future: 'time.inMinutes' },
  hour: { past: 'time.hoursAgo', future: 'time.inHours' },
  day: { past: 'time.daysAgo', future: 'time.inDays' },
  week: { past: 'time.weeksAgo', future: 'time.inWeeks' },
  month: { past: 'time.monthsAgo', future: 'time.inMonths' },
  year: { past: 'time.yearsAgo', future: 'time.inYears' },
};

// Direct dictionary access instead of createTranslator: translate.ts imports
// from this module, so importing it back would create a cycle. The widened
// type lets a general MessageKey index the (partial) Somali dictionary.
const somali: Readonly<Partial<Record<MessageKey, Message>>> = so;

function timeMessage(key: MessageKey, locale: Locale): Message {
  return (locale === 'so' ? somali[key] : undefined) ?? en[key];
}

function relativeTimeText(value: number, unit: RelativeTimeUnit, locale: Locale): string {
  if (value === 0) return timeMessage('time.now', locale) as string;
  if (unit === 'day' && value === -1) return timeMessage('time.yesterday', locale) as string;
  if (unit === 'day' && value === 1) return timeMessage('time.tomorrow', locale) as string;

  const key = value < 0 ? RELATIVE_TIME_KEYS[unit].past : RELATIVE_TIME_KEYS[unit].future;
  const message = timeMessage(key, locale);
  const count = Math.abs(value);
  const template = isPluralMessage(message) ? (count === 1 ? message.one : message.other) : message;
  // String(count), not formatNumber: byte-identical output across runtimes is
  // the invariant this module guarantees (grouping only differs past 999,
  // which no real unit count reaches).
  return template.replace('{count}', String(count));
}

/** "3 days ago" / "3 maalmood ka hor" — for feeds and notifications. */
export function formatRelativeTime(
  target: Date | number,
  locale: Locale,
  now: Date | number = Date.now(),
): string {
  let duration = (Number(target) - Number(now)) / 1000;

  // NaN (invalid Date) survives every `<` guard below — degrade to "now"
  // instead of crashing: one bad timestamp must never take out a screen.
  if (!Number.isFinite(duration)) return relativeTimeText(0, 'second', locale);

  for (const division of RELATIVE_TIME_DIVISIONS) {
    // Round before comparing so the shown value never reaches the unit
    // boundary ("59.6s" must become "in 1 minute", not "in 60 seconds").
    if (Math.abs(Math.round(duration)) < division.amount) {
      return relativeTimeText(Math.round(duration), division.unit, locale);
    }
    duration /= division.amount;
  }
  // Unreachable for finite input: the last division is unbounded.
  return relativeTimeText(Math.round(duration), 'year', locale);
}
