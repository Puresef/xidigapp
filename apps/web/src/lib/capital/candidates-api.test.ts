import { describe, expect, it } from 'vitest';

import { getProfileCountry } from './candidates-api';

/**
 * The Somalia-gate input boundary (drift-fix, Sep 2026): the gate reads the
 * server-derived location_country_code, NEVER the free-text display column.
 * Both columns are string|null so a revert to `.select('location_country')`
 * type-checks — this pin is what fails instead, keeping the fixed regression
 * (member typed "Somalia", gate said country_mismatch) from coming back.
 */

function recordingAdmin(row: Record<string, unknown>) {
  const selected: string[] = [];
  const query = {
    select(columns: string) {
      selected.push(columns);
      return query;
    },
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return {
    client: { from: () => query } as unknown as Parameters<typeof getProfileCountry>[0],
    selected,
  };
}

describe('getProfileCountry', () => {
  it('selects location_country_code and returns that field — not the display string', async () => {
    const { client, selected } = recordingAdmin({
      // Both fields present and DIFFERENT, so reading the wrong one fails.
      location_country_code: 'so',
      location_country: 'Soomaaliya',
    });

    const country = await getProfileCountry(client, 'user-1');

    expect(selected).toEqual(['location_country_code']);
    expect(country).toBe('so');
  });

  it('returns null for an unset/unrecognized fold (gate fails closed)', async () => {
    const { client } = recordingAdmin({ location_country_code: null, location_country: 'Narnia' });
    expect(await getProfileCountry(client, 'user-1')).toBeNull();
  });
});
