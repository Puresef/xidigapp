import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Supporter gates ride tier_capabilities rows, not the tier slug (migrations
 * 20260901000200/300). The schema's promise — "a new tier is one INSERT
 * (+ capability rows), zero migration ... RLS gates via a join, never a
 * hard-coded tier name" — used to be false in practice: is_supporter() was
 * `tier <> 'free'`, so ANY third tier silently inherited every Supporter
 * gate. This suite seeds a third tier and proves it holds exactly the
 * capabilities it is granted.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  // The hypothetical future tier: cheaper, no Lab/Space rights granted.
  await db.admin.query(
    `insert into membership_tiers (id, name, monthly_price_usd, position)
     values ('patron', 'Patron', 0.5, 3)`,
  );
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function seedTierMember(handle: string, tier: string): Promise<string> {
  const userId = await seedMember(db, handle);
  await db.admin.query(`update profiles set membership_tier_id = $1 where user_id = $2`, [
    tier,
    userId,
  ]);
  return userId;
}

async function hasCap(userId: string, cap: string): Promise<boolean> {
  const r = await db.asUser(userId, (tx) =>
    tx.query(`select has_capability($1::membership_capability) as ok`, [cap]),
  );
  return (r.rows[0] as { ok: boolean }).ok;
}

async function isSupporterFor(userId: string): Promise<boolean> {
  const r = await db.asUser(userId, (tx) => tx.query(`select is_supporter() as ok`));
  return (r.rows[0] as { ok: boolean }).ok;
}

describe('third tier does not inherit Supporter gates', () => {
  it('a patron-tier member holds NO Supporter capability until a row grants it', async () => {
    const patron = await seedTierMember('cap_patron', 'patron');
    for (const cap of ['create_lab', 'vote_candidate', 'elevated_limits', 'supporter_spaces']) {
      expect(await hasCap(patron, cap), cap).toBe(false);
    }
    expect(await isSupporterFor(patron)).toBe(false);
  });

  it('a case-variant tier id still matches — the citext join is lower()-guarded', async () => {
    // profiles.membership_tier_id is citext with a case-insensitive FK and no
    // lowercase CHECK, so 'Supporter' is legally storable. Under
    // search_path='' a bare '=' would silently degrade to case-sensitive text
    // equality (the hazard phase1's has_capability documents) — this pins the
    // lower() guard in is_supporter() (20260901000300).
    const member = await seedMember(db, 'cap_casevariant');
    await db.admin.query(
      `update profiles set membership_tier_id = 'Supporter' where user_id = $1`,
      [member],
    );
    expect(await isSupporterFor(member)).toBe(true);
    expect(await hasCap(member, 'supporter_spaces')).toBe(true);
  });

  it('the supporter tier still holds its gates (behavior unchanged)', async () => {
    const supporter = await seedTierMember('cap_supporter', 'supporter');
    for (const cap of ['create_lab', 'vote_candidate', 'elevated_limits', 'supporter_spaces']) {
      expect(await hasCap(supporter, cap), cap).toBe(true);
    }
    expect(await isSupporterFor(supporter)).toBe(true);
  });

  it('a supporter-only Space is invisible to the patron tier, and one capability INSERT opens it', async () => {
    const lead = await seedTierMember('cap_lead', 'supporter');
    const patron = await seedTierMember('cap_reader', 'patron');
    const lab = await db.admin.query(
      `insert into labs (name, slug, lead_user_id, visibility, space_mode, is_supporter_only)
       values ('Members Only', 'cap-sup-space', $1, 'members', 'club', true) returning id`,
      [lead],
    );
    const labId = (lab.rows[0] as { id: string }).id;

    const before = await db.asUser(patron, (tx) =>
      tx.query(`select id from labs where id = $1`, [labId]),
    );
    expect(before.rowCount).toBe(0);

    // The schema's promised growth path: granting the gate is ONE insert.
    await db.admin.query(
      `insert into tier_capabilities (tier_id, capability) values ('patron', 'supporter_spaces')`,
    );
    const after = await db.asUser(patron, (tx) =>
      tx.query(`select id from labs where id = $1`, [labId]),
    );
    expect(after.rowCount).toBe(1);
    expect(await isSupporterFor(patron)).toBe(true);
  });
});

describe('paid tier display name (20260912000000)', () => {
  it('is "Xidig Plus" publicly, while the internal tier id stays "supporter"', async () => {
    const res = await db.withRole('anon', null, (tx) =>
      tx.query(`select id, name from public.list_visible_tiers() where id = 'supporter'`),
    );
    expect(res.rows).toEqual([{ id: 'supporter', name: 'Xidig Plus' }]);
  });
});
