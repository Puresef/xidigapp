import { describe, expect, it } from 'vitest';

import {
  asOpeningHours,
  isOpenNow,
  listingCreateSchema,
  listingOpenNow,
  listingUpdateSchema,
  normalizeBusinessName,
  type OpeningHours,
} from './listings';

describe('normalizeBusinessName (duplicate detection, §18)', () => {
  it('is case/punctuation/whitespace insensitive', () => {
    expect(normalizeBusinessName('Hodan  Café & Co.')).toBe('hodan cafe co');
    expect(normalizeBusinessName('HODAN CAFE CO')).toBe('hodan cafe co');
  });

  it('collapses transliteration-adjacent spacing but keeps distinct names distinct', () => {
    expect(normalizeBusinessName('Maxamed Traders')).not.toBe(
      normalizeBusinessName('Mohamed Traders'),
    );
  });
});

describe('listingCreateSchema', () => {
  it('requires a name and a category uuid, defaults contact_links and force', () => {
    const parsed = listingCreateSchema.parse({
      business_name: '  Berbera Exports ',
      category_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed).toMatchObject({
      business_name: 'Berbera Exports',
      contact_links: [],
      force: false,
    });
  });

  it('rejects a non-uuid category and out-of-range coordinates', () => {
    expect(listingCreateSchema.safeParse({ business_name: 'X', category_id: 'nope' }).success).toBe(
      false,
    );
    expect(
      listingCreateSchema.safeParse({
        business_name: 'X',
        category_id: '11111111-1111-4111-8111-111111111111',
        latitude: 200,
      }).success,
    ).toBe(false);
  });
});

describe('listingUpdateSchema', () => {
  it('accepts a partial edit', () => {
    expect(listingUpdateSchema.safeParse({ short_description: 'now open' }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(listingUpdateSchema.safeParse({}).success).toBe(false);
  });
});

/* ----------------------------------------------------------------------------
 * "Open now" derivation (extras item 5 acceptance).
 *
 * TIMEZONE MODEL under test: stored times are the business's WALL CLOCK (v1
 * stores no timezone), and isOpenNow compares them against the wall clock of
 * the `now` Date it is handed — Date#getHours/getMinutes, never the UTC
 * fields. All fixtures therefore build Dates with the LOCAL-time constructor
 * (new Date(y, m, d, h, min)), which makes every assertion deterministic in
 * whatever timezone the test runner happens to use — exactly the invariance
 * the viewer-clock design promises. A business in Mogadishu (UTC+3) open
 * 09:00–17:00 must read "open" for a viewer whose local clock says 10:00,
 * whether that viewer sits in Mogadishu or Minneapolis; the diaspora
 * approximation is deliberate (§18) and pinned by these tests.
 * ------------------------------------------------------------------------- */

const CLOSED_WEEK: OpeningHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

/** 2026-07-10 is a Friday; local-time constructor (see module comment). */
function fridayAt(hour: number, minute = 0): Date {
  return new Date(2026, 6, 10, hour, minute);
}

/** The following Saturday. */
function saturdayAt(hour: number, minute = 0): Date {
  return new Date(2026, 6, 11, hour, minute);
}

describe('isOpenNow (viewer wall clock, §18)', () => {
  const nineToFive: OpeningHours = {
    ...CLOSED_WEEK,
    fri: [{ open: '09:00', close: '17:00' }],
  };

  it('is open inside the interval and closed outside it', () => {
    expect(isOpenNow(nineToFive, fridayAt(10, 0))).toBe(true);
    expect(isOpenNow(nineToFive, fridayAt(8, 59))).toBe(false);
    expect(isOpenNow(nineToFive, fridayAt(17, 1))).toBe(false);
  });

  it('treats open as inclusive and close as exclusive', () => {
    expect(isOpenNow(nineToFive, fridayAt(9, 0))).toBe(true);
    expect(isOpenNow(nineToFive, fridayAt(16, 59))).toBe(true);
    expect(isOpenNow(nineToFive, fridayAt(17, 0))).toBe(false);
  });

  it('reads the wall clock of the Date it is given, not a fixed timezone', () => {
    // Same wall-clock reading built from a different calendar day still
    // resolves by day-of-week + local time: Saturday 10:00 is closed because
    // only Friday has hours.
    expect(isOpenNow(nineToFive, saturdayAt(10, 0))).toBe(false);
  });

  it('is closed on a day with no intervals and on an all-empty week', () => {
    expect(isOpenNow(nineToFive, saturdayAt(12, 0))).toBe(false);
    expect(isOpenNow(CLOSED_WEEK, fridayAt(12, 0))).toBe(false);
  });

  it('treats open === close as a zero-length interval, not 24h', () => {
    const zero: OpeningHours = { ...CLOSED_WEEK, fri: [{ open: '09:00', close: '09:00' }] };
    expect(isOpenNow(zero, fridayAt(9, 0))).toBe(false);
    expect(isOpenNow(zero, fridayAt(12, 0))).toBe(false);
  });

  it('handles overnight intervals: open late tonight and into tomorrow morning', () => {
    const lateBar: OpeningHours = { ...CLOSED_WEEK, fri: [{ open: '20:00', close: '02:00' }] };
    expect(isOpenNow(lateBar, fridayAt(23, 30))).toBe(true); // tonight's stretch
    expect(isOpenNow(lateBar, saturdayAt(1, 30))).toBe(true); // yesterday's tail
    expect(isOpenNow(lateBar, saturdayAt(2, 0))).toBe(false); // close is exclusive
    expect(isOpenNow(lateBar, saturdayAt(3, 0))).toBe(false);
    expect(isOpenNow(lateBar, fridayAt(19, 59))).toBe(false); // before opening
  });

  it('does not let an overnight tail leak past its own morning', () => {
    // Fri 20:00–02:00 must not open Sunday 01:00 (only Saturday's small hours).
    const lateBar: OpeningHours = { ...CLOSED_WEEK, fri: [{ open: '20:00', close: '02:00' }] };
    expect(isOpenNow(lateBar, new Date(2026, 6, 12, 1, 0))).toBe(false);
  });

  it('supports split shifts (multiple intervals in one day)', () => {
    const split: OpeningHours = {
      ...CLOSED_WEEK,
      fri: [
        { open: '08:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
      ],
    };
    expect(isOpenNow(split, fridayAt(9, 0))).toBe(true);
    expect(isOpenNow(split, fridayAt(13, 0))).toBe(false); // lunch gap
    expect(isOpenNow(split, fridayAt(15, 0))).toBe(true);
  });
});

describe('listingOpenNow / asOpeningHours (untrusted jsonb)', () => {
  it('derives open-now from a valid jsonb value', () => {
    const jsonb = { ...CLOSED_WEEK, fri: [{ open: '09:00', close: '17:00' }] };
    expect(listingOpenNow(jsonb, fridayAt(10, 0))).toBe(true);
    expect(listingOpenNow(jsonb, fridayAt(18, 0))).toBe(false);
  });

  it('treats null/malformed/partial shapes as "no hours" (never open, never throws)', () => {
    expect(listingOpenNow(null, fridayAt(10, 0))).toBe(false);
    expect(listingOpenNow(undefined, fridayAt(10, 0))).toBe(false);
    expect(listingOpenNow('9-5', fridayAt(10, 0))).toBe(false);
    expect(listingOpenNow({ fri: [{ open: '09:00', close: '17:00' }] }, fridayAt(10, 0))).toBe(
      false,
    ); // missing days
    expect(
      listingOpenNow({ ...CLOSED_WEEK, fri: [{ open: '9am', close: '5pm' }] }, fridayAt(10, 0)),
    ).toBe(false); // non-HH:MM times

    expect(asOpeningHours({ ...CLOSED_WEEK })).not.toBeNull();
    expect(asOpeningHours([])).toBeNull();
  });
});
