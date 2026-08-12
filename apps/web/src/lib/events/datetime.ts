import type { MessageKey, Translator } from '@xidig/i18n';

/**
 * Dictionary-owned event date/time formatting (Munaasabado dispatch, Task 2).
 *
 * Month and weekday NAMES come from the i18n dictionary (`time.month*`,
 * `time.monthShort*`, `time.weekday*`) — never `Intl.DateTimeFormat(locale,
 * …)` or `toLocaleDateString('so')` for the display string, since the
 * runtime's ICU build may lack Somali CLDR data and silently fall back to
 * English (the same hydration-mismatch trap `format.ts`'s relative-time
 * helpers already guard against). Only the numeric INDEX (day/month/weekday)
 * is derived from Intl, and always against the 'en-US' locale, which is
 * guaranteed present in every ICU build — so index derivation is
 * runtime-independent even though name resolution is dictionary-owned.
 */
export interface EventDateParts {
  day: string;
  /** Numeric year (Intl 'en-US' index, like `day` — never a display name). */
  year: string;
  monthShort: string;
  month: string;
  weekday: string;
  time: string;
  timeRange: string | null;
}

/** `Mon`…`Sun` (Intl's 'en-US' short weekday) → ISO weekday index (Mon = 1). */
const ISO_WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

interface ExtractedInstant {
  day: string;
  /** Numeric index, e.g. `2026`. */
  year: string;
  /** 1–12. */
  month: number;
  /** ISO weekday index, 1–7 (Monday = 1). */
  weekday: number;
  /** `HH:MM`, 24-hour. */
  time: string;
}

function extractInstant(iso: string, timeZone: string): ExtractedInstant {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekdayShort = valueOf('weekday');

  return {
    day: valueOf('day'),
    year: valueOf('year'),
    month: Number(valueOf('month')),
    weekday: ISO_WEEKDAY_BY_SHORT_NAME[weekdayShort] ?? 1,
    time: `${valueOf('hour')}:${valueOf('minute')}`,
  };
}

/** Resolve the display parts of an event's start (and optional end) time, in the event's own timezone. */
export function eventDateParts(
  t: Translator,
  startsAtIso: string,
  endsAtIso: string | null,
  timeZone: string,
): EventDateParts {
  const start = extractInstant(startsAtIso, timeZone);

  const monthShort = t(`time.monthShort${start.month}` as MessageKey);
  const month = t(`time.month${start.month}` as MessageKey);
  const weekday = t(`time.weekday${start.weekday}` as MessageKey);

  const timeRange =
    endsAtIso === null ? null : `${start.time}–${extractInstant(endsAtIso, timeZone).time}`;

  return {
    day: start.day,
    year: start.year,
    monthShort,
    month,
    weekday,
    time: start.time,
    timeRange,
  };
}
