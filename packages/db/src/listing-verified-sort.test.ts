import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Task 11 migrations (20260731000000 / 20260731000100):
 *   1. business_listings.verified_at — denormalized approval date, kept in
 *      sync by trigger: any transition OUT of 'verified' nulls it (the future
 *      revoke path is enforced structurally, not by app-code discipline), and
 *      a transition IN without an explicit stamp gets now() as a backstop.
 *   2. is_verified — STORED generated boolean tier for the published
 *      verified-first sort (the enum's own order would rank 'pending' as a
 *      middle tier), plus the composite sort index.
 *   3. Both columns stay out of the client write grants (service-role only,
 *      like every derived/moderated listing column).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function seedListing(owner: string, name: string): Promise<string> {
  const result = await db.admin.query(
    `insert into business_listings (owner_user_id, business_name, category_id)
     values ($1, $2, (select id from listing_categories limit 1)) returning id`,
    [owner, name],
  );
  return (result.rows[0] as { id: string }).id;
}

describe('is_verified generated tier', () => {
  it('tracks verification_status and only "verified" counts as the top tier', async () => {
    const owner = await seedMember(db, 'vsort_tier');
    const id = await seedListing(owner, 'Tier Co');

    const read = async () =>
      (
        await db.admin.query(`select is_verified from business_listings where id = $1`, [id])
      ).rows[0] as { is_verified: boolean };

    expect((await read()).is_verified).toBe(false);

    await db.admin.query(
      `update business_listings set verification_status = 'pending' where id = $1`,
      [id],
    );
    expect((await read()).is_verified).toBe(false); // pending is NOT a middle tier

    await db.admin.query(
      `update business_listings set verification_status = 'verified' where id = $1`,
      [id],
    );
    expect((await read()).is_verified).toBe(true);
  });

  it('the composite sort index exists with the exact keyset shape', async () => {
    const result = await db.admin.query(
      `select indexdef from pg_indexes
       where schemaname = 'public' and indexname = 'listings_verified_sort_idx'`,
    );
    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as { indexdef: string }).indexdef).toContain(
      '(is_verified DESC, updated_at DESC, id DESC)',
    );
  });
});

describe('verified_at sync trigger', () => {
  it('keeps an explicit stamp, backstops a missing one, and NULLs on revoke', async () => {
    const owner = await seedMember(db, 'vsort_stamp');
    const id = await seedListing(owner, 'Stamp Co');

    const read = async () =>
      (
        await db.admin.query(`select verified_at from business_listings where id = $1`, [id])
      ).rows[0] as { verified_at: Date | null };

    // Approve-handler shape: status flip + explicit stamp survive together.
    await db.admin.query(
      `update business_listings
       set verification_status = 'verified', verified_at = '2026-07-15T00:00:00Z'
       where id = $1`,
      [id],
    );
    expect((await read()).verified_at?.toISOString()).toBe('2026-07-15T00:00:00.000Z');

    // An unrelated edit while verified leaves the date alone.
    await db.admin.query(`update business_listings set city = 'Hargeisa' where id = $1`, [id]);
    expect((await read()).verified_at?.toISOString()).toBe('2026-07-15T00:00:00.000Z');

    // ANY transition out of 'verified' — the revoke path — nulls it.
    await db.admin.query(
      `update business_listings set verification_status = 'unverified' where id = $1`,
      [id],
    );
    expect((await read()).verified_at).toBeNull();

    // A flip in WITHOUT an explicit stamp gets the now() backstop.
    await db.admin.query(
      `update business_listings set verification_status = 'verified' where id = $1`,
      [id],
    );
    expect((await read()).verified_at).not.toBeNull();
  });
});

describe('client write grants stay closed', () => {
  it('a member cannot write verified_at (column-scoped UPDATE grant)', async () => {
    const owner = await seedMember(db, 'vsort_grant');
    const id = await seedListing(owner, 'Grant Co');

    await expect(
      db.asUser(owner, (tx) =>
        tx.query(`update business_listings set verified_at = now() where id = $1`, [id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
