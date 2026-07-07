import { describe, expect, it } from 'vitest';

import { getSavedThisWeek, recordSaved, SAVINGS_STORAGE_KEY, type StringStore } from './savings';

function memoryStore(
  initial: Record<string, string> = {},
): StringStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const NOW = new Date('2026-07-06T12:00:00Z');

describe('recordSaved / getSavedThisWeek', () => {
  it('accumulates bytes into the current day bucket', () => {
    const store = memoryStore();
    recordSaved(250_000, store, NOW);
    recordSaved(350_000, store, NOW);
    expect(getSavedThisWeek(store, NOW)).toBe(600_000);
    expect(JSON.parse(store.data.get(SAVINGS_STORAGE_KEY) ?? '{}')).toEqual({
      '2026-07-06': 600_000,
    });
  });

  it('sums across days inside the trailing 7-day window only', () => {
    const store = memoryStore();
    recordSaved(100, store, new Date('2026-06-28T09:00:00Z')); // 8 days before NOW → out
    recordSaved(200, store, new Date('2026-06-30T09:00:00Z')); // inside
    recordSaved(300, store, NOW);
    expect(getSavedThisWeek(store, NOW)).toBe(500);
  });

  it('prunes expired buckets on write', () => {
    const store = memoryStore();
    recordSaved(100, store, new Date('2026-06-01T00:00:00Z'));
    recordSaved(50, store, NOW);
    const buckets = JSON.parse(store.data.get(SAVINGS_STORAGE_KEY) ?? '{}') as Record<
      string,
      number
    >;
    expect(buckets).toEqual({ '2026-07-06': 50 });
  });

  it('ignores non-positive and non-finite amounts', () => {
    const store = memoryStore();
    recordSaved(0, store, NOW);
    recordSaved(-5, store, NOW);
    recordSaved(Number.NaN, store, NOW);
    expect(getSavedThisWeek(store, NOW)).toBe(0);
    expect(store.data.has(SAVINGS_STORAGE_KEY)).toBe(false);
  });

  it('recovers from corrupted storage payloads', () => {
    const store = memoryStore({ [SAVINGS_STORAGE_KEY]: 'not json' });
    expect(getSavedThisWeek(store, NOW)).toBe(0);
    recordSaved(1_000, store, NOW);
    expect(getSavedThisWeek(store, NOW)).toBe(1_000);

    const negative = memoryStore({
      [SAVINGS_STORAGE_KEY]: JSON.stringify({ '2026-07-06': -100, '2026-07-05': 'x' }),
    });
    expect(getSavedThisWeek(negative, NOW)).toBe(0);
  });

  it('fails soft with no storage at all', () => {
    expect(() => recordSaved(100, null, NOW)).not.toThrow();
    expect(getSavedThisWeek(null, NOW)).toBe(0);
  });
});
