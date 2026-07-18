import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Lanes lookup table (migration 20260718100000): a seeded, admin-extensible
 * sector taxonomy, same posture as listing_categories / event_categories /
 * open_to_kinds — member-readable, writes revoked to anon/authenticated.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('lanes taxonomy lookup', () => {
  it('seeds the grown sector set, member-readable and ordered by position', async () => {
    const member = await seedMember(db, 'lanes_reader');
    const rows = await db.asUser(member, (tx) =>
      tx.query(`select slug from lanes where is_active order by position`),
    );
    const slugs = rows.rows.map((r) => (r as { slug: string }).slug);
    expect(slugs.length).toBeGreaterThanOrEqual(27);
    // The original 15 stay, in their shipped order…
    expect(slugs.slice(0, 4)).toEqual(['fintech', 'logistics', 'import-export', 'agri-food']);
    // …and the grown set is present.
    expect(slugs).toContain('livestock');
    expect(slugs).toContain('fishing');
    expect(slugs).toContain('remittance');
  });

  it('anon reads nothing (policy is authenticated-only, like the other taxonomies)', async () => {
    const rows = await db.withRole('anon', null, (tx) => tx.query(`select slug from lanes`));
    expect(rows.rowCount).toBe(0);
  });

  it('a member cannot INSERT / UPDATE / DELETE lanes (admin/service-role only)', async () => {
    const member = await seedMember(db, 'lanes_writer');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into lanes (slug, name_en, name_so) values ('rogue', 'Rogue', 'Rogue')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(member, (tx) => tx.query(`update lanes set is_active = false where slug = 'fintech'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(member, (tx) => tx.query(`delete from lanes where slug = 'fintech'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('slug format is enforced (no spaces / uppercase / slashes)', async () => {
    await expect(
      db.admin.query(`insert into lanes (slug, name_en, name_so) values ('Bad Slug', 'x', 'x')`),
    ).rejects.toThrow(/lanes_slug_format|violates check/);
  });
});
