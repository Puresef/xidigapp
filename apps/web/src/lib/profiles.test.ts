import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor, keysetBefore } from './pagination';
import { handleSchema, isProfileComplete, profileInputSchema } from './profiles';

describe('handleSchema', () => {
  it('lowercases and accepts valid handles', () => {
    expect(handleSchema.parse('  Maxamed_A ')).toBe('maxamed_a');
  });

  it('rejects handles that violate the DB CHECK shape', () => {
    for (const bad of ['ab', 'has space', 'no-dash', 'a'.repeat(31), 'Café']) {
      expect(handleSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('profileInputSchema', () => {
  it('defaults array/object fields and trims strings', () => {
    const parsed = profileInputSchema.parse({ display_name: '  Hodan ', handle: 'hodan_b' });
    expect(parsed).toMatchObject({
      display_name: 'Hodan',
      handle: 'hodan_b',
      skills: [],
      lanes: [],
      links: [],
      contact_options: {},
    });
  });

  it('rejects out-of-range coordinates', () => {
    expect(
      profileInputSchema.safeParse({ display_name: 'X', handle: 'xxx', latitude: 999 }).success,
    ).toBe(false);
  });
});

describe('isProfileComplete', () => {
  it('requires a name, handle, and at least one lane', () => {
    expect(isProfileComplete({ display_name: 'A', handle: 'aaa', lanes: ['fintech'] })).toBe(true);
    expect(isProfileComplete({ display_name: 'A', handle: 'aaa', lanes: [] })).toBe(false);
    expect(isProfileComplete({ display_name: '', handle: 'aaa', lanes: ['x'] })).toBe(false);
    expect(isProfileComplete({ display_name: 'A', handle: null, lanes: ['x'] })).toBe(false);
  });
});

describe('keyset cursor', () => {
  it('round-trips through encode/decode', () => {
    const cursor = { createdAt: '2026-07-05T00:00:00.000Z', id: 'abc' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('treats malformed/forged cursors as absent', () => {
    expect(decodeCursor('not-base64!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{"createdAt":1}').toString('base64url'))).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it('builds a strict-before filter with the tiebreaker', () => {
    const filter = keysetBefore({ createdAt: '2026-07-05T00:00:00.000Z', id: 'abc' }, 'user_id');
    expect(filter).toBe(
      'created_at.lt.2026-07-05T00:00:00.000Z,and(created_at.eq.2026-07-05T00:00:00.000Z,user_id.lt.abc)',
    );
  });
});
