import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Somalia-gate input hardening (migration 20260901000000). Proves the
 * display/compliance split: profiles.location_country stays the member's
 * free-text display string, while the trigger-derived location_country_code
 * is what the Maalgeli region gate reads — so "Somalia" / "Soomaaliya" fold
 * to 'so' instead of silently failing the gate, and the derived column can
 * never be written or read by a client role.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** Set the member's own free-text country (as the profile form / PostgREST does). */
async function setCountry(userId: string, country: string | null): Promise<void> {
  await db.asUser(userId, (tx) =>
    tx.query(`update profiles set location_country = $1 where user_id = $2`, [country, userId]),
  );
}

/** Read the derived code + stored display string (service role, like the gate). */
async function stored(userId: string): Promise<{ code: string | null; display: string | null }> {
  const r = await db.admin.query(
    `select location_country_code as code, location_country as display
       from profiles where user_id = $1`,
    [userId],
  );
  return r.rows[0] as { code: string | null; display: string | null };
}

describe('location_country_code fold trigger', () => {
  it('folds the Somalia name/transliteration variants to iso "so" without touching the display text', async () => {
    const member = await seedMember(db, 'cc_somalia');
    for (const variant of ['Somalia', 'somali', 'Soomaaliya', 'soomaliya', 'Soomaali', ' SOM ']) {
      await setCountry(member, variant);
      const row = await stored(member);
      expect(row.code).toBe('so');
      expect(row.display).toBe(variant); // display string is NEVER rewritten
    }
  });

  it('takes 2-letter inputs as iso alpha-2 verbatim, lowercased', async () => {
    const member = await seedMember(db, 'cc_iso');
    for (const [input, code] of [
      ['so', 'so'],
      ['SO', 'so'],
      [' so ', 'so'],
      ['ke', 'ke'],
      ['GB', 'gb'],
    ] as const) {
      await setCountry(member, input);
      expect((await stored(member)).code).toBe(code);
    }
  });

  it('folds unrecognized and empty input to null (gate fails closed)', async () => {
    const member = await seedMember(db, 'cc_unknown');
    for (const input of ['Kenya', 'United Kingdom', 'Mogadishu', '   ', '']) {
      await setCountry(member, input);
      expect((await stored(member)).code).toBeNull();
    }
    await setCountry(member, null);
    expect((await stored(member)).code).toBeNull();
  });

  it('derives on INSERT too, and recomputes on every later write path', async () => {
    const userId = await db.createAuthUser({ email: 'cc-insert@example.com', gateBypass: true });
    await db.asUser(userId, (tx) =>
      tx.query(
        `insert into profiles (user_id, display_name, handle, location_country)
         values ($1, 'CC Insert', 'cc_insert', 'Soomaaliya')`,
        [userId],
      ),
    );
    expect((await stored(userId)).code).toBe('so');

    // A write that does not touch location_country leaves the code consistent.
    await db.asUser(userId, (tx) =>
      tx.query(`update profiles set bio = 'salaam' where user_id = $1`, [userId]),
    );
    expect((await stored(userId)).code).toBe('so');
  });

  it('a member can neither write nor read the derived column (no §6 column grant)', async () => {
    const member = await seedMember(db, 'cc_locked');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`update profiles set location_country_code = 'so' where user_id = $1`, [member]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`select location_country_code from profiles where user_id = $1`, [member]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('even the service role cannot store a divergent code — the trigger always recomputes', async () => {
    const member = await seedMember(db, 'cc_divergent');
    await db.admin.query(
      `update profiles set location_country = 'Somalia', location_country_code = 'ke'
        where user_id = $1`,
      [member],
    );
    expect((await stored(member)).code).toBe('so');
  });
});
