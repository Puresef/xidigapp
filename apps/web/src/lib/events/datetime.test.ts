import { createTranslator } from '@xidig/i18n';
import { describe, expect, it } from 'vitest';

import { eventDateParts } from './datetime';

/**
 * Dictionary-owned event date/time formatting (Munaasabado dispatch, Task 2).
 * Month/weekday NAMES come from the i18n dictionary (never
 * Intl.RelativeTimeFormat / toLocaleDateString('so') — see time.month* /
 * time.weekday* in packages/i18n/src/dictionaries); only the numeric INDEX
 * is derived from Intl, using the always-present 'en-US' locale so this is
 * ICU-build-independent.
 */
describe('eventDateParts', () => {
  it('resolves Somali month/weekday names and a time range in the event timezone', () => {
    const t = createTranslator('so');

    const parts = eventDateParts(
      t,
      '2026-08-15T13:00:00Z',
      '2026-08-15T16:00:00Z',
      'Europe/London',
    );

    expect(parts).toEqual({
      day: '15',
      year: '2026',
      monthShort: 'Ago',
      month: 'Agoosto',
      weekday: 'Sabti',
      time: '14:00',
      timeRange: '14:00–17:00',
    });
  });

  it('resolves English month/weekday names for the same instant', () => {
    const t = createTranslator('en');

    const parts = eventDateParts(
      t,
      '2026-08-15T13:00:00Z',
      '2026-08-15T16:00:00Z',
      'Europe/London',
    );

    expect(parts).toEqual({
      day: '15',
      year: '2026',
      monthShort: 'Aug',
      month: 'August',
      weekday: 'Saturday',
      time: '14:00',
      timeRange: '14:00–17:00',
    });
  });

  it('returns a null timeRange when the event has no end time', () => {
    const t = createTranslator('so');

    const parts = eventDateParts(t, '2026-08-15T13:00:00Z', null, 'Europe/London');

    expect(parts.timeRange).toBeNull();
    expect(parts.day).toBe('15');
    expect(parts.time).toBe('14:00');
    expect(parts.weekday).toBe('Sabti');
  });

  /**
   * Lock for the events/[slug] detail page's cancelled-notice date (Munaasabado
   * hardening follow-up): the `{date}` param it composes from these parts —
   * `${day} ${month} ${year}` — must read as a dictionary month name, never
   * the Intl-derived abbreviation `formatDate` (Intl.DateTimeFormat) would
   * have produced for the same instant (e.g. "Ogs", the so-locale ICU
   * shorthand for August). See apps/web/src/app/events/[slug]/page.tsx.
   */
  it('composes a cancelled-notice date with the dictionary month name, not an Intl abbreviation', () => {
    const t = createTranslator('so');

    const parts = eventDateParts(t, '2026-08-15T13:00:00Z', null, 'Europe/London');
    const cancelledNoticeDate = `${parts.day} ${parts.month} ${parts.year}`;

    expect(cancelledNoticeDate).toBe('15 Agoosto 2026');
    expect(cancelledNoticeDate).not.toContain('Ogs');
  });
});
