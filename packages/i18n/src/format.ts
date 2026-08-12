import { en, type MessageKey } from './dictionaries/en';
import { so } from './dictionaries/so';
import type { Locale } from './locales';
import { isPluralMessage, type Message } from './messages';

/**
 * Locale-aware formatting helpers.
 *
 * One property of Intl governs this whole module, and both designs below fall
 * out of it: Intl does NOT throw over missing CLDR data. Any well-formed
 * language tag — 'xx' as much as 'so' — quietly resolves to the host default.
 * Only a structurally malformed tag ('so_SO', '') throws, and neither member of
 * Locale is one.
 *
 * For numbers and dates that means the locale can never be the fault, so a
 * fallback that retried under 'en' was dead code — and byte-identical to the
 * call that just threw whenever the locale was already 'en'. The caller's own
 * options are the only argument that realistically throws, so each fallback
 * drops the options and keeps the member's locale.
 *
 * For relative time the same silence is the hazard rather than the cure. The
 * quiet resolution above lands on the HOST default, which is not a fixed
 * target: a server whose ICU lacks Somali served English while the browser
 * served Somali, so SSR HTML and client output diverged and every Somali time
 * node hydration-mismatched. Relative-time copy therefore lives in the
 * dictionaries (`time.*`) and never touches Intl — giving server and client one
 * data source on every runtime, whatever their ICU builds disagree about.
 */

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return formatNumberFallback(value, locale);
  }
}

/**
 * Cold path. One rung: drop the caller's options, keep the member's locale.
 * They are dropped wholesale rather than repaired because `currency` and `unit`
 * are validated whatever `style` says, leaving no partial repair to attempt.
 *
 * It passes `undefined` rather than a defaults constant: Intl's own decimal
 * default IS this product's number presentation (there is no counterpart to
 * formatDate's `dateStyle: 'medium'` to encode), and a `{}` literal would
 * inherit from Object.prototype, where a stray `style` key makes this throw too.
 *
 * The degradation is lossy and silent — a `{ style: 'percent' }` call that
 * trips on some other option renders 0.5 as "0.5", not "50%": right digits,
 * wrong scale. A caller needing its style honoured must validate its own
 * options; this cannot do it for them.
 */
function formatNumberFallback(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale, undefined).format(value);
  } catch {
    // Reaching here already means the types were violated (a malformed tag cast
    // to Locale, or a value that is not a number), so `value` is not trusted
    // either: String() throws on anything with no usable primitive conversion —
    // a null-prototype object, or a throwing toString.
    return typeof value === 'number' ? String(value) : '—';
  }
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };

export function formatDate(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): string {
  // An invalid Date makes Intl throw RangeError on every attempt below —
  // degrade instead: one bad timestamp must never crash a whole screen.
  if (!Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.DateTimeFormat(locale, options).format(value);
  } catch {
    return formatDateFallback(value, locale);
  }
}

/**
 * Cold path. One rung: drop the caller's options, keep the member's locale. A
 * bad `timeZone` is the likeliest fault by far, since formatEventStart hands
 * stored event timezones straight through and only the write path validates
 * them — so this is the last line of defence for a row that predates that
 * validation or arrived by seed, import or direct DB write.
 *
 * The degradation is lossier than it first looks, because options are dropped
 * WHOLESALE rather than repaired. For the one options-passing caller in the
 * tree (formatEventStart, which sends `dateStyle` + `timeStyle` + `timeZone`)
 * that means the clock time does not shift — it DISAPPEARS: "04-Lul-2026 ee
 * 12:00 GD" degrades to "04-Lul-2026". A reader loses the hour rather than
 * being misled about it, which is the right way round, and it still beats a
 * RangeError taking out a whole server-rendered screen. A caller that needs its
 * options honoured has to validate them itself.
 */
function formatDateFallback(value: Date | number, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, DEFAULT_DATE_OPTIONS).format(value);
  } catch {
    // Finite but out-of-range timestamps (|value| > 8.64e15) reach here: the
    // guard in formatDate admits them, but `.format` rejects them anywhere.
    return '—';
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
