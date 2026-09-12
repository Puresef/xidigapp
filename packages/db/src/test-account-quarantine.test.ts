import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedAiAccount, seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Test-account quarantine marker (migration 20260912050000).
 *
 * users.is_test is the durable "not a real member" flag the app reads to keep
 * seeded/test accounts out of organic proof. Pinned here:
 *   - it exists, defaults false, and no client can write it;
 *   - the backfill is deterministic and conservative: it marks a fixture only
 *     with a source-defined fixture handle AND the reserved example.com domain
 *     AND a test-community seed marker present, plus the one owner-named
 *     verification account; it never keys on @example.com alone and never
 *     sweeps a real-looking account.
 * The backfill statement is read from the migration file itself (between its
 * BEGIN/END markers), so this test exercises exactly the SQL that ships.
 */

const MIGRATION = fileURLToPath(
  new URL('../supabase/migrations/20260912050000_test_account_quarantine.sql', import.meta.url),
);

function backfillSql(): string {
  const sql = readFileSync(MIGRATION, 'utf8');
  const start = sql.indexOf('-- BEGIN test-account backfill');
  const end = sql.indexOf('-- END test-account backfill');
  if (start < 0 || end < 0 || end <= start) throw new Error('backfill markers missing');
  return sql.slice(start, end);
}

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function isTest(userId: string): Promise<boolean> {
  const res = await db.admin.query(`select is_test from users where id = $1`, [userId]);
  return res.rows[0]?.is_test === true;
}

/** An account with a chosen email and handle (not the factory's handle@example.com). */
async function accountWith(email: string, handle: string): Promise<string> {
  const userId = await db.createAuthUser({ email, gateBypass: true });
  await db.admin.query(`insert into profiles (user_id, display_name, handle) values ($1, $2, $3)`, [
    userId,
    handle,
    handle,
  ]);
  return userId;
}

describe('users.is_test column', () => {
  it('exists, is not null, defaults false', async () => {
    const res = await db.admin.query(
      `select is_nullable, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'is_test'`,
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].is_nullable).toBe('NO');
    expect(String(res.rows[0].column_default)).toBe('false');

    const plain = await seedMember(db, 'tq_plain_default');
    expect(await isTest(plain)).toBe(false);
  });

  it('no client role can write it (only the service role marks accounts)', async () => {
    const res = await db.admin.query(
      `select r.rolname, has_column_privilege(r.rolname, 'public.users', 'is_test', 'UPDATE') as can_update
         from (values ('anon'), ('authenticated')) r(rolname)`,
    );
    expect(res.rows.every((r) => r.can_update === false)).toBe(true);

    const own = await seedMember(db, 'tq_self_marker');
    await expect(
      db.asUser(own, (tx) => tx.query(`update users set is_test = false where id = $1`, [own])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('the backfill (exact migration SQL)', () => {
  it('marks only deterministic fixtures and never a real-looking account', async () => {
    // A source-defined fixture handle on the reserved domain.
    const fixture = await accountWith('hodan_mod@example.com', 'hodan_mod');
    // A labelled test AI helper (fixture handle) keeps is_ai and gains is_test.
    const aiHelper = await accountWith('caawiye_ai@example.com', 'caawiye_ai');
    await db.admin.query(`update users set is_ai = true where id = $1`, [aiHelper]);
    // The owner-named verification account.
    const decoy = await accountWith('zz_deltest_decoy@example.com', 'zz_deltest_decoy');
    // A fixture HANDLE held by a real-looking (non-example.com) account.
    const lookalike = await accountWith('khadra.member@mail.test', 'khadra_coop');
    // example.com alone (the test factories' shape) is not a marker.
    const exampleOnly = await seedMember(db, 'tq_example_only');
    // Other verification-session residue is not marked by this migration.
    const otherResidue = await accountWith('zz_other_residue@example.com', 'zz_other_residue');
    // The standard AI actor (not a fixture handle) is not a test account.
    const ai = await seedAiAccount(db, 'tq_real_ai');

    // 1. No test-community seed marker yet: fixture handles are NOT marked.
    await db.admin.query(backfillSql());
    expect(await isTest(fixture)).toBe(false);
    expect(await isTest(aiHelper)).toBe(false);
    // …but the owner-named decoy is marked regardless of seed markers.
    expect(await isTest(decoy)).toBe(true);

    // 2. With the test-community marker present, fixtures are marked.
    await db.admin.query(`insert into seed_runs (label, source) values ('test-community-v1', 'seed')`);
    await db.admin.query(backfillSql());
    expect(await isTest(fixture)).toBe(true);
    expect(await isTest(aiHelper)).toBe(true);
    expect(await isTest(decoy)).toBe(true);

    // Never swept: real-looking lookalike, example.com-only, other residue, the real AI actor.
    expect(await isTest(lookalike)).toBe(false);
    expect(await isTest(exampleOnly)).toBe(false);
    expect(await isTest(otherResidue)).toBe(false);
    expect(await isTest(ai)).toBe(false);

    // The helper stays an AI account; the backfill only sets is_test.
    const helperRow = await db.admin.query(`select is_ai from users where id = $1`, [aiHelper]);
    expect(helperRow.rows[0].is_ai).toBe(true);
  });

  it('is idempotent and only ever sets the flag (never clears one)', async () => {
    const manual = await seedMember(db, 'tq_manually_marked');
    await db.admin.query(`update users set is_test = true where id = $1`, [manual]);
    const before = await db.admin.query(`select count(*)::int as n from users where is_test`);
    await db.admin.query(backfillSql());
    await db.admin.query(backfillSql());
    const after = await db.admin.query(`select count(*)::int as n from users where is_test`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(await isTest(manual)).toBe(true);
  });

  it('names exactly the 62 test-community fixture handles (60 personas + 2 AI helpers)', () => {
    // The seeder source that defines these handles is not on this branch
    // (main never carried the test-community seeder), so pin the list's
    // shape here: 62 unique lowercase handles, none of them the owner-named
    // decoy (which has its own clause).
    const list = backfillSql().match(/lower\(p\.handle::text\) in \(([\s\S]*?)\)\)/);
    expect(list).not.toBeNull();
    const handles = [...(list?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
    expect(handles).toHaveLength(62);
    expect(new Set(handles).size).toBe(62);
    expect(handles.every((h) => h === h.toLowerCase())).toBe(true);
    expect(handles).not.toContain('zz_deltest_decoy');
    expect(handles).toEqual(expect.arrayContaining(['caawiye_ai', 'warshad_ai']));
  });

  it('touches users.is_test only (no other column, no delete)', async () => {
    const sql = backfillSql()
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).toMatch(/update public\.users u\s+set is_test = true\s/);
    expect(sql).not.toMatch(/\bdelete\b/i);
    expect(sql).not.toMatch(/\binsert\b/i);
    expect(sql.match(/\bset\b/gi)).toHaveLength(1);
  });
});
