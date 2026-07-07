import { describe, expect, it } from 'vitest';

import { buildPrefsMatrix, DEFAULT_MATRIX, hourInTimezone, PREF_TYPES } from './prefs';

describe('DEFAULT_MATRIX', () => {
  it('covers every pref type', () => {
    for (const type of PREF_TYPES) {
      expect(DEFAULT_MATRIX[type]).toBeDefined();
    }
  });

  it('encodes the §26 defaults', () => {
    expect(DEFAULT_MATRIX.dm_request).toEqual({ inapp: true, email: true, push: true });
    expect(DEFAULT_MATRIX.reply.push).toBe(true);
    expect(DEFAULT_MATRIX.reply.email).toBe(false);
    expect(DEFAULT_MATRIX.mention.push).toBe(true);
    expect(DEFAULT_MATRIX.new_dm.push).toBe(true);
    expect(DEFAULT_MATRIX.candidate_status.email).toBe(true);
    expect(DEFAULT_MATRIX.weekly_digest).toEqual({ inapp: false, email: true, push: false });
  });
});

describe('buildPrefsMatrix', () => {
  it('returns defaults when there are no overrides', () => {
    const row = buildPrefsMatrix([]).find((r) => r.type === 'reply');
    expect(row).toMatchObject({ push: true, pushCapable: true, email: false, emailCapable: false });
  });

  it('applies overrides on capable channels only', () => {
    const matrix = buildPrefsMatrix([
      { notification_type: 'reply', channel: 'push', enabled: false },
      // Stray override on a channel with no send path must not enable it.
      { notification_type: 'reply', channel: 'email', enabled: true },
    ]);
    const row = matrix.find((r) => r.type === 'reply');
    expect(row?.push).toBe(false);
    expect(row?.email).toBe(false);
  });
});

describe('hourInTimezone', () => {
  const noonUtc = new Date('2026-07-06T12:00:00Z');

  it('reads the wall clock of the given timezone', () => {
    expect(hourInTimezone(noonUtc, 'UTC')).toBe(12);
    // Nairobi/Mogadishu is UTC+3 year-round.
    expect(hourInTimezone(noonUtc, 'Africa/Mogadishu')).toBe(15);
  });

  it('falls back to UTC on a null or invalid timezone', () => {
    expect(hourInTimezone(noonUtc, null)).toBe(12);
    expect(hourInTimezone(noonUtc, 'Not/AZone')).toBe(12);
  });

  it('normalizes midnight to 0', () => {
    expect(hourInTimezone(new Date('2026-07-06T00:30:00Z'), 'UTC')).toBe(0);
  });
});
