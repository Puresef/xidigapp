import { describe, expect, it } from 'vitest';

import {
  APPEAL_SLA_HOURS,
  DELETION_GRACE_DAYS,
  REPORT_SLA_HOURS,
  VERIFICATION_SLA_DAYS,
} from './constants';

/**
 * The moderation queue targets are INTERNAL planning targets (G31), not
 * advertised guarantees and not contractual SLAs — and they had no test at all
 * before this file.
 *
 * What makes them safe to tune: each drives exactly one thing, the red badge on
 * an operator queue row. Nothing sorts, filters, escalates, notifies, sweeps or
 * reports analytics on them, so a member cannot observe the value. The matching
 * member-facing rule — §27 copy says WHO reviews, never HOW FAST — is pinned
 * next to the dictionaries in packages/i18n/src/promises.test.ts, because the
 * dictionaries are not exported from the package root.
 */

describe('internal queue targets', () => {
  it('reports carry a 24-hour internal first-review target', () => {
    expect(REPORT_SLA_HOURS).toBe(24);
  });

  it('appeals carry a 72-hour internal first-review target', () => {
    expect(APPEAL_SLA_HOURS).toBe(72);
  });

  it('verification requests keep their 7-day internal target', () => {
    expect(VERIFICATION_SLA_DAYS).toBe(7);
  });

  it('the deletion grace window is unchanged — it is real behaviour, not a target', () => {
    // DELETION_GRACE_DAYS is the one constant in this file that drives
    // destruction: lifecycle/sweeps.ts selects pending_deletion accounts older
    // than this and anonymises them. It must never be retuned as if it were a
    // queue target.
    expect(DELETION_GRACE_DAYS).toBe(30);
  });
});

describe('queue badge predicate — the only consumer of the targets', () => {
  // Mirrors admin/reports/page.tsx and api/admin/reports/route.ts, which both
  // compute `ageHours > REPORT_SLA_HOURS` over already-fetched rows (strict >,
  // fractional hours). Appeals use the same shape with an extra
  // `status === 'pending'` conjunct.
  const pastTarget = (ageHours: number, target: number) => ageHours > target;

  it('flags a report past the internal target and not before', () => {
    expect(pastTarget(23.9, REPORT_SLA_HOURS)).toBe(false);
    expect(pastTarget(24, REPORT_SLA_HOURS)).toBe(false); // strict >, as implemented
    expect(pastTarget(24.1, REPORT_SLA_HOURS)).toBe(true);
  });

  it('flags an appeal past the internal target and not before', () => {
    expect(pastTarget(71.9, APPEAL_SLA_HOURS)).toBe(false);
    expect(pastTarget(72.1, APPEAL_SLA_HOURS)).toBe(true);
  });

  it('a resolved appeal is never past target regardless of age', () => {
    const appealPastTarget = (status: string, ageHours: number) =>
      status === 'pending' && ageHours > APPEAL_SLA_HOURS;
    expect(appealPastTarget('resolved', 1000)).toBe(false);
    expect(appealPastTarget('pending', 1000)).toBe(true);
  });
});
