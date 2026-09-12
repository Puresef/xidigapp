import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Packet B gate (database half) — Show support (Garab) unlocks nothing.
 *
 * Support lives in `post_cosigns` (fulfilled Asks) and `interests` rows of
 * type 'cosign' (candidates). Owner ruling: it is non-financial
 * encouragement — it must not feed a vote, a tally, a readiness or submission
 * gate, a verification, a capability, a ranking or a badge. Structurally that
 * means: across the fully migrated schema, the ONLY database object that reads
 * support is the per-candidate count function the display uses, no RLS policy
 * on any other table consults support rows, no view reads them, and no
 * trigger on them writes anywhere else.
 *
 * The app half of this pin is apps/web/src/support-is-inert.test.ts.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('support rows feed nothing in the database', () => {
  it('only candidate_interest_counts() reads support — no tally, gate, grant or ranking function does', async () => {
    const result = await db.admin.query(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.prosrc ~* 'post_cosigns' or p.prosrc ~* $1)
        order by 1`,
      [`'cosign'`],
    );
    expect(result.rows.map((row: { proname: string }) => row.proname)).toEqual([
      'candidate_interest_counts',
    ]);
  });

  it('candidate_interest_counts is an aggregate count and nothing more', async () => {
    const result = await db.admin.query(
      `select pg_get_function_result(p.oid) as result, p.provolatile
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'candidate_interest_counts'`,
    );
    const row = result.rows[0] as { result: string; provolatile: string };
    expect(row.result).toMatch(/cosign integer/);
    // Not volatile → it cannot write (a readiness flag, a badge, a score).
    expect(row.provolatile).not.toBe('v');
  });

  it('no RLS policy on another table consults support rows', async () => {
    const result = await db.admin.query(
      `select tablename, policyname
         from pg_policies
        where schemaname = 'public'
          and tablename not in ('post_cosigns', 'interests')
          and (coalesce(qual, '') ~* '(post_cosigns|interests)'
               or coalesce(with_check, '') ~* '(post_cosigns|interests)')`,
    );
    expect(result.rows).toEqual([]);
  });

  it('no view reads support rows', async () => {
    const result = await db.admin.query(
      `select viewname
         from pg_views
        where schemaname = 'public'
          and definition ~* '(post_cosigns|\\minterests\\M)'`,
    );
    expect(result.rows).toEqual([]);
  });

  it('no trigger on the support tables writes anywhere else', async () => {
    const result = await db.admin.query(
      `select c.relname || '.' || t.tgname || ' → ' || p.proname as trigger
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal
          and c.relname in ('post_cosigns', 'interests')
        order by 1`,
    );
    // Any trigger here is a potential side-channel from support into another
    // table. There are none today; adding one must be a deliberate change.
    expect(result.rows.map((row: { trigger: string }) => row.trigger)).toEqual([]);
  });

  it('positive controls: the scans can see what they claim is absent', async () => {
    const policies = await db.admin.query(
      `select count(*)::int as n from pg_policies
        where schemaname = 'public' and tablename in ('post_cosigns', 'interests')`,
    );
    expect((policies.rows[0] as { n: number }).n).toBeGreaterThan(0);
    const views = await db.admin.query(
      `select count(*)::int as n from pg_views where schemaname = 'public'`,
    );
    expect((views.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});
