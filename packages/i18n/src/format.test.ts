import { describe, expect, it } from 'vitest';

import { en } from './dictionaries/en';
import { so } from './dictionaries/so';
import { formatDate, formatNumber, formatRelativeTime } from './format';
import type { MessageKey } from './dictionaries/en';
import type { PluralMessage } from './messages';

const NOW = new Date('2026-07-04T12:00:00Z');

const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

// Widened view so a general MessageKey can index the partial Somali dictionary.
const soDict: Readonly<Partial<Record<MessageKey, string | PluralMessage>>> = so;

/** Resolve a time.* dictionary message the way the formatter must. */
const fromDictionary = (locale: 'en' | 'so', key: MessageKey, count: number): string => {
  const message = (locale === 'so' ? (soDict[key] ?? en[key]) : en[key]) as PluralMessage;
  return (count === 1 ? message.one : message.other).replace('{count}', String(count));
};

describe('formatRelativeTime', () => {
  it('formats past and future deltas', () => {
    expect(formatRelativeTime(new Date('2026-07-01T12:00:00Z'), 'en', NOW)).toBe('3 days ago');
    expect(formatRelativeTime(new Date('2026-07-04T12:00:05Z'), 'en', NOW)).toBe('in 5 seconds');
  });

  it('rolls up to the next unit at the boundary instead of "60 seconds"', () => {
    const in59point6s = NOW.getTime() + 59_600;
    expect(formatRelativeTime(in59point6s, 'en', NOW)).toBe('in 1 minute');
    const in23point6h = NOW.getTime() + 23.6 * 60 * 60 * 1000;
    expect(formatRelativeTime(in23point6h, 'en', NOW)).toBe('tomorrow');
  });

  it('degrades gracefully on an invalid Date instead of throwing', () => {
    expect(() => formatRelativeTime(new Date('garbage'), 'so', NOW)).not.toThrow();
    expect(typeof formatRelativeTime(new Date('garbage'), 'en', NOW)).toBe('string');
  });
});

// Regression suite for the so-locale SSR/hydration mismatch: relative-time
// copy must come from the dictionaries, never from the runtime's ICU data.
// A server whose ICU lacks Somali CLDR silently falls back to English inside
// Intl.RelativeTimeFormat (no throw), so SSR HTML and browser output diverge.
describe('formatRelativeTime is dictionary-owned, not ICU-owned', () => {
  it('owns every relative-time message in both dictionaries', () => {
    const timeKeys: MessageKey[] = [
      'time.now',
      'time.yesterday',
      'time.tomorrow',
      'time.secondsAgo',
      'time.minutesAgo',
      'time.hoursAgo',
      'time.daysAgo',
      'time.weeksAgo',
      'time.monthsAgo',
      'time.yearsAgo',
      'time.inSeconds',
      'time.inMinutes',
      'time.inHours',
      'time.inDays',
      'time.inWeeks',
      'time.inMonths',
      'time.inYears',
    ];
    for (const key of timeKeys) {
      expect(en[key], `en missing ${key}`).toBeDefined();
      expect(soDict[key], `so missing ${key}`).toBeDefined();
    }
  });

  it('formats Somali under Node exactly as the dictionaries specify', () => {
    // The originally observed mismatch: 3 weeks → must be the dictionary's
    // "3 toddobaad ka hor" (repo canon), not ICU's "3 toddobaad kahor" nor
    // a small-icu server's "3 weeks ago".
    expect(formatRelativeTime(daysFromNow(-21), 'so', NOW)).toBe('3 toddobaad ka hor');
    expect(formatRelativeTime(daysFromNow(-21), 'so', NOW)).toBe(
      fromDictionary('so', 'time.weeksAgo', 3),
    );

    expect(formatRelativeTime(daysFromNow(-3), 'so', NOW)).toBe(
      fromDictionary('so', 'time.daysAgo', 3),
    );
    expect(formatRelativeTime(new Date('2026-07-04T11:00:00Z'), 'so', NOW)).toBe(
      fromDictionary('so', 'time.hoursAgo', 1),
    );
    expect(formatRelativeTime(new Date('2026-07-04T11:50:00Z'), 'so', NOW)).toBe(
      fromDictionary('so', 'time.minutesAgo', 10),
    );
    expect(formatRelativeTime(new Date('2026-07-04T12:00:05Z'), 'so', NOW)).toBe(
      fromDictionary('so', 'time.inSeconds', 5),
    );
    expect(formatRelativeTime(daysFromNow(-61), 'so', NOW)).toBe(
      fromDictionary('so', 'time.monthsAgo', 2),
    );
    expect(formatRelativeTime(daysFromNow(-3 * 365), 'so', NOW)).toBe(
      fromDictionary('so', 'time.yearsAgo', 3),
    );
  });

  it('uses the Somali special forms for now / yesterday / tomorrow', () => {
    expect(formatRelativeTime(NOW, 'so', NOW)).toBe(so['time.now']);
    expect(formatRelativeTime(daysFromNow(-1), 'so', NOW)).toBe(so['time.yesterday']);
    expect(formatRelativeTime(daysFromNow(1), 'so', NOW)).toBe(so['time.tomorrow']);
    expect(formatRelativeTime(new Date('garbage'), 'so', NOW)).toBe(so['time.now']);
  });

  it('emits Somali even when the runtime Intl has no Somali data (small-icu simulation)', () => {
    const original = Intl.RelativeTimeFormat;
    // A small-icu server does NOT throw for 'so' — it silently resolves to
    // English. Simulate the worst case: the constructor is missing entirely.
    // The formatter must not notice.
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = undefined;
    try {
      expect(formatRelativeTime(daysFromNow(-21), 'so', NOW)).toBe('3 toddobaad ka hor');
      expect(formatRelativeTime(daysFromNow(-21), 'en', NOW)).toBe('3 weeks ago');
    } finally {
      (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = original;
    }
  });

  it('formats English from the dictionary too (single data source on both sides)', () => {
    expect(formatRelativeTime(daysFromNow(-1), 'en', NOW)).toBe(en['time.yesterday']);
    // Conscious simplification vs Intl numeric:'auto': counted form instead
    // of "last week" — same string on every runtime beats ICU-version drift.
    expect(formatRelativeTime(daysFromNow(-7), 'en', NOW)).toBe(
      fromDictionary('en', 'time.weeksAgo', 1),
    );
    expect(formatRelativeTime(new Date('2026-07-04T11:00:00Z'), 'en', NOW)).toBe('1 hour ago');
  });
});

describe('formatDate', () => {
  it('formats a valid date', () => {
    expect(formatDate(NOW, 'en')).toContain('2026');
  });

  it('degrades gracefully on an invalid Date instead of throwing', () => {
    expect(formatDate(new Date('garbage'), 'en')).toBe('—');
  });

  it('honours a valid timeZone', () => {
    const base = { dateStyle: 'medium', timeStyle: 'short' } as const;
    const utc = formatDate(NOW, 'en', { ...base, timeZone: 'UTC' });
    const tokyo = formatDate(NOW, 'en', { ...base, timeZone: 'Asia/Tokyo' });
    expect(utc).toContain('12:00');
    expect(tokyo).toContain('9:00');
  });

  it('survives an invalid timeZone instead of throwing', () => {
    // Callers hand stored event timezones straight through (formatEventStart),
    // so one bad row must never take out a whole screen. Retrying the fallback
    // with the same options would throw exactly as the first attempt did.
    const options = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Not/AZone' } as const;
    expect(() => formatDate(NOW, 'so', options)).not.toThrow();
    // Degrades by dropping the unusable option, not the requested locale.
    expect(formatDate(NOW, 'so', options)).toBe(formatDate(NOW, 'so'));
  });

  it('survives an invalid option value instead of throwing', () => {
    const options = { dateStyle: 'bogus' } as unknown as Intl.DateTimeFormatOptions;
    expect(() => formatDate(NOW, 'en', options)).not.toThrow();
    expect(formatDate(NOW, 'en', options)).toContain('2026');
  });

  it("degrades to '—' on a finite but out-of-range timestamp", () => {
    // Number.isFinite admits these, but every Intl attempt rejects them.
    expect(formatDate(8.64e15 + 1, 'en')).toBe('—');
  });
});

describe('formatNumber', () => {
  it('formats with the locale', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });

  it('honours valid options', () => {
    // Asserted loosely: the exact percent glyph and its spacing vary by CLDR.
    expect(formatNumber(0.5, 'so', { style: 'percent' })).toContain('50');
    expect(formatNumber(1234.5, 'en', { minimumFractionDigits: 2 })).toBe('1,234.50');
  });

  it('survives unusable options instead of throwing', () => {
    // Three separate validation paths — and the first throws TypeError where
    // the other two throw RangeError, which is why the catch stays bare.
    const unusable: Intl.NumberFormatOptions[] = [
      { style: 'currency' }, // currency style with no currency code
      { notation: 'bogus' } as unknown as Intl.NumberFormatOptions,
      { minimumFractionDigits: 4, maximumFractionDigits: 2 },
    ];
    for (const options of unusable) {
      expect(() => formatNumber(1234.5, 'so', options)).not.toThrow();
      // Degrades by dropping the unusable options, not the requested locale.
      expect(formatNumber(1234.5, 'so', options)).toBe(formatNumber(1234.5, 'so'));
    }
  });

  it('loses the style when it degrades, rendering a percent as a bare number', () => {
    // Documents the price of dropping options wholesale — right digits, wrong
    // scale — so the trade-off stays visible instead of lurking.
    const options = { style: 'percent', notation: 'bogus' } as unknown as Intl.NumberFormatOptions;
    expect(formatNumber(0.5, 'so', options)).toBe(formatNumber(0.5, 'so'));
  });

  it('formats non-finite numbers rather than degrading them', () => {
    // No Number.isFinite guard here, unlike formatDate: Intl renders these as
    // locale text ('so' gives "MaL" for NaN) and a guard would destroy it.
    expect(formatNumber(Number.NaN, 'so')).not.toBe('—');
    expect(formatNumber(Number.POSITIVE_INFINITY, 'so')).not.toBe('—');
  });

  it("degrades to '—' when the value is not really a number", () => {
    // The never-throws contract has to hold past the type: a null-prototype
    // object makes Intl and String() both throw.
    const notANumber = Object.create(null) as unknown as number;
    expect(() => formatNumber(notANumber, 'so')).not.toThrow();
    expect(formatNumber(notANumber, 'so')).toBe('—');
  });
});
