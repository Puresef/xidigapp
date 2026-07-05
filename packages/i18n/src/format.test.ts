import { describe, expect, it } from 'vitest';

import { formatDate, formatNumber, formatRelativeTime } from './format';

const NOW = new Date('2026-07-04T12:00:00Z');

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

describe('formatDate', () => {
  it('formats a valid date', () => {
    expect(formatDate(NOW, 'en')).toContain('2026');
  });

  it('degrades gracefully on an invalid Date instead of throwing', () => {
    expect(formatDate(new Date('garbage'), 'en')).toBe('—');
  });
});

describe('formatNumber', () => {
  it('formats with the locale', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
});
