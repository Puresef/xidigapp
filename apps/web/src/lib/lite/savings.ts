/**
 * Lite mode data-savings counter (§22, Phase 4.5): every MediaSlot that stays
 * deferred records its estimated byte weight once; Settings → Data & Lite
 * mode shows "Lite mode saved you ~X MB this week".
 *
 * Storage: localStorage rolling 7-day buckets keyed by UTC day
 * (`xidig_lite_saved` = `{"2026-07-06": 1234567, ...}`). Device-local by
 * design — savings are a per-device fact, and this must work signed-out.
 * Everything fails soft: private mode / disabled storage simply counts
 * nothing.
 */

export const SAVINGS_STORAGE_KEY = 'xidig_lite_saved';

const WINDOW_DAYS = 7;

/** The Web Storage subset we use — injectable for tests and non-DOM callers. */
export interface StringStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): StringStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function readBuckets(store: StringStore): Record<string, number> {
  let raw: string | null = null;
  try {
    raw = store.getItem(SAVINGS_STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const buckets: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        buckets[key] = value;
      }
    }
    return buckets;
  } catch {
    return {};
  }
}

function isInsideWindow(key: string, now: Date): boolean {
  const bucketMs = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(bucketMs)) return false;
  const ageMs = now.getTime() - bucketMs;
  return ageMs >= -86_400_000 && ageMs < WINDOW_DAYS * 86_400_000;
}

/** Add deferred bytes to today's bucket (pruning anything older than 7 days). */
export function recordSaved(
  bytes: number,
  store: StringStore | null = defaultStore(),
  now = new Date(),
): void {
  if (!store || !Number.isFinite(bytes) || bytes <= 0) return;
  const buckets = readBuckets(store);
  const pruned: Record<string, number> = {};
  for (const [key, value] of Object.entries(buckets)) {
    if (isInsideWindow(key, now)) pruned[key] = value;
  }
  const today = dayKey(now);
  pruned[today] = (pruned[today] ?? 0) + Math.round(bytes);
  try {
    store.setItem(SAVINGS_STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Quota / private mode — drop the count, never the interaction.
  }
}

/** Total bytes deferred over the trailing 7 days. */
export function getSavedThisWeek(
  store: StringStore | null = defaultStore(),
  now = new Date(),
): number {
  if (!store) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(readBuckets(store))) {
    if (isInsideWindow(key, now)) total += value;
  }
  return total;
}
