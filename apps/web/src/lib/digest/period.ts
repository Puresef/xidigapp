/**
 * ISO-week helpers for the weekly digest (PRD §21). The period_key ('YYYY-Www')
 * is the idempotency key: one digest edition per ISO week. Pure + deterministic
 * (no locale), so the same instant always maps to the same week.
 */

/** ISO-8601 week number + ISO week-year for a date (UTC). */
export function isoWeek(date: Date): { year: number; week: number } {
  // Copy to UTC midnight of the given day.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week day (Mon=1..Sun=7); shift to the Thursday of this week.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** 'YYYY-Www' key, e.g. 2026-W28. */
export function isoWeekKey(date: Date): string {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export interface DigestWindow {
  periodKey: string;
  /** Inclusive lower bound (7 days before `until`). */
  since: string;
  /** Exclusive upper bound. */
  until: string;
  periodStart: string; // date (YYYY-MM-DD)
  periodEnd: string; // date (YYYY-MM-DD)
}

/** The 7-day window ending at `now` (defaults to current time). */
export function digestWindow(now: Date = new Date()): DigestWindow {
  const until = now;
  const since = new Date(until.getTime() - 7 * 86_400_000);
  return {
    periodKey: isoWeekKey(until),
    since: since.toISOString(),
    until: until.toISOString(),
    periodStart: since.toISOString().slice(0, 10),
    periodEnd: until.toISOString().slice(0, 10),
  };
}
