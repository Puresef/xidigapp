import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Skills vocabulary + count triggers (migration 20260718200000). Proves the
 * count-guided-autocomplete data model: profiles.skills is normalized on write,
 * mirrored into a member-readable `skills` table, and member_count is kept
 * accurate as members add/remove skills — the signal the picker shows so
 * everyone converges on the canonical token.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** member_count for a skill (0 if the row does not exist). */
async function count(name: string): Promise<number> {
  const r = await db.admin.query(`select member_count from skills where name = $1`, [name]);
  return r.rowCount === 0 ? 0 : (r.rows[0] as { member_count: number }).member_count;
}

/** Set a member's own profile skills (as the API's user client does). */
async function setSkills(userId: string, skills: string[]): Promise<void> {
  await db.asUser(userId, (tx) =>
    tx.query(`update profiles set skills = $1 where user_id = $2`, [skills, userId]),
  );
}

/** Read the normalized stored skills of a profile. */
async function storedSkills(userId: string): Promise<string[]> {
  const r = await db.admin.query(`select skills from profiles where user_id = $1`, [userId]);
  return (r.rows[0] as { skills: string[] }).skills;
}

describe('skills vocabulary table', () => {
  it('ships a seeded canonical vocabulary, member-readable', async () => {
    const member = await seedMember(db, 'sk_reader');
    const rows = await db.asUser(member, (tx) =>
      tx.query(`select name from skills where source = 'seed'`),
    );
    const names = rows.rows.map((r) => (r as { name: string }).name);
    expect(names.length).toBeGreaterThanOrEqual(50);
    expect(names).toContain('react');
    expect(names).toContain('product management');
  });

  it('anon reads nothing; a member cannot write the table directly', async () => {
    const member = await seedMember(db, 'sk_writer');
    const anon = await db.withRole('anon', null, (tx) => tx.query(`select name from skills`));
    expect(anon.rowCount).toBe(0);
    await expect(
      db.asUser(member, (tx) => tx.query(`insert into skills (name) values ('rogue')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(member, (tx) => tx.query(`update skills set member_count = 9999 where name = 'react'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('rejects a non-canonical (uppercase / untrimmed) direct name', async () => {
    await expect(
      db.admin.query(`insert into skills (name) values ('Bad Skill')`),
    ).rejects.toThrow(/skills_name_format|violates check/);
  });
});

describe('profiles.skills normalization + member_count reconciliation', () => {
  it('normalizes on write: lowercases, trims, de-dupes', async () => {
    const member = await seedMember(db, 'sk_norm');
    await setSkills(member, ['React', ' Python ', 'react', '', 'SQL']);
    expect(await storedSkills(member)).toEqual(['python', 'react', 'sql']);
  });

  it('increments a seeded skill when a member adds it, decrements when removed', async () => {
    const react0 = await count('react');
    const a = await seedMember(db, 'sk_inc_a');
    const b = await seedMember(db, 'sk_inc_b');

    await setSkills(a, ['react']);
    expect(await count('react')).toBe(react0 + 1);
    await setSkills(b, ['react']);
    expect(await count('react')).toBe(react0 + 2);

    // Remove from A only → back down by one.
    await setSkills(a, []);
    expect(await count('react')).toBe(react0 + 1);
  });

  it('coins a brand-new skill at count 1 with source=member (instant-create)', async () => {
    const member = await seedMember(db, 'sk_new');
    expect(await count('camel husbandry')).toBe(0);
    await setSkills(member, ['camel husbandry']);
    const row = await db.admin.query(
      `select member_count, source from skills where name = 'camel husbandry'`,
    );
    expect(row.rowCount).toBe(1);
    expect((row.rows[0] as { member_count: number }).member_count).toBe(1);
    expect((row.rows[0] as { source: string }).source).toBe('member');
  });

  it('case/spacing variants converge onto one canonical count (anti-fragmentation)', async () => {
    const a = await seedMember(db, 'sk_conv_a');
    const b = await seedMember(db, 'sk_conv_b');
    const before = await count('graphic design');
    await setSkills(a, ['Graphic Design']);
    await setSkills(b, ['graphic design']);
    // Both normalize to the same token → a single count of +2, not two rows.
    expect(await count('graphic design')).toBe(before + 2);
    const variants = await db.admin.query(
      `select count(*)::int as n from skills where name ilike 'graphic design'`,
    );
    expect((variants.rows[0] as { n: number }).n).toBe(1);
  });

  it('re-saving the same skill set does not double-count', async () => {
    const member = await seedMember(db, 'sk_idem');
    await setSkills(member, ['devops']);
    const after1 = await count('devops');
    await setSkills(member, ['devops']); // no delta
    expect(await count('devops')).toBe(after1);
  });
});
