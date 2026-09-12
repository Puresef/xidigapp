import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SeedTargetRefused } from '../target-guard';
import {
  TEST_AI_HELPERS,
  TEST_COMMUNITY_MARKER_LABELS,
  TEST_PERSONAS,
  testCommunityFixtureHandles,
  testEmail,
} from './personas';
import { resetTestCommunity, runTestCommunity, selectTestCommunityFixtureIds } from './run';

/**
 * Test-community quarantine (12 Sep 2026):
 *   - the seeder and its reset refuse the production project ref and any
 *     unverified target before touching the database;
 *   - fixture identity is handle AND testEmail(handle) AND users.is_test —
 *     never the example.com domain alone, so no real-looking account (and no
 *     test-factory/verification account that merely shares the domain) is swept;
 *   - the migration's backfill list is exactly this seeder's handle set.
 */

const PROD = 'https://tbdryvhxxiqadseuxclm.supabase.co';

/** A client that fails the test if it is ever touched. */
function untouchable() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error('the database was touched before the target was checked');
      },
    },
  ) as never;
}

describe('seeder entry points refuse production before any write', () => {
  it('runTestCommunity refuses the production project', async () => {
    await expect(runTestCommunity(untouchable(), { targetUrls: [PROD] })).rejects.toBeInstanceOf(
      SeedTargetRefused,
    );
  });

  it('resetTestCommunity refuses the production project and an unknown target', async () => {
    await expect(resetTestCommunity(untouchable(), { targetUrls: [PROD] })).rejects.toThrow(
      /PRODUCTION/,
    );
    await expect(resetTestCommunity(untouchable(), { targetUrls: [] })).rejects.toBeInstanceOf(
      SeedTargetRefused,
    );
  });
});

/** Minimal fake of the two reads selectTestCommunityFixtureIds makes. */
function fakeAdmin(
  profiles: Array<{ user_id: string; handle: string }>,
  users: Array<{ id: string; email: string | null; is_test: boolean }>,
) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            in: async (_col: string, values: string[]) => {
              if (table === 'profiles') {
                return { data: profiles.filter((p) => values.includes(p.handle)), error: null };
              }
              return { data: users.filter((u) => values.includes(u.id)), error: null };
            },
          };
        },
      };
    },
  } as never;
}

describe('selectTestCommunityFixtureIds (reset targets)', () => {
  it('selects only marked fixtures with their own fixture email', async () => {
    const admin = fakeAdmin(
      [
        { user_id: 'fixture', handle: 'hodan_mod' },
        { user_id: 'unmarked-fixture', handle: 'cumar_mod' },
        { user_id: 'lookalike', handle: 'khadra_coop' },
        { user_id: 'helper', handle: 'caawiye_ai' },
      ],
      [
        { id: 'fixture', email: testEmail('hodan_mod'), is_test: true },
        // Holds a fixture handle and example.com, but is not marked.
        { id: 'unmarked-fixture', email: testEmail('cumar_mod'), is_test: false },
        // A real-looking account that happens to hold a fixture handle.
        { id: 'lookalike', email: 'khadra.member@mail.test', is_test: true },
        { id: 'helper', email: testEmail('caawiye_ai'), is_test: true },
      ],
    );
    expect((await selectTestCommunityFixtureIds(admin)).sort()).toEqual(['fixture', 'helper']);
  });

  it('never selects an example.com account whose handle is not a fixture handle', async () => {
    const admin = fakeAdmin(
      [{ user_id: 'factory', handle: 'someone_else' }],
      [{ id: 'factory', email: 'someone_else@example.com', is_test: true }],
    );
    expect(await selectTestCommunityFixtureIds(admin)).toEqual([]);
  });
});

describe('the reset never selects by the email domain or a label prefix', () => {
  const src = readFileSync(fileURLToPath(new URL('./run.ts', import.meta.url)), 'utf8');
  const reset = src.slice(src.indexOf('export async function selectTestCommunityFixtureIds'));

  it('has no example.com LIKE selector and no test-community-% prefix match', () => {
    expect(reset).not.toMatch(/like\(\s*'email'/);
    expect(reset).not.toMatch(/'%@example\.com'/);
    expect(reset).not.toMatch(/like\(\s*'label'/);
    expect(reset).not.toMatch(/test-community-%/);
  });

  it('checks the target before anything else in both entry points', () => {
    for (const fn of ['export async function runTestCommunity', 'export async function resetTestCommunity']) {
      const body = src.slice(src.indexOf(fn), src.indexOf(fn) + 700);
      const guard = body.indexOf('assertSeedTargetAllowed(target.targetUrls)');
      expect(guard).toBeGreaterThan(-1);
      const firstDbCall = body.search(/admin\.|await (select|ensure)/);
      expect(firstDbCall === -1 || guard < firstDbCall).toBe(true);
    }
  });
});

describe('fixture identity', () => {
  it('the handle set is the personas plus the test AI helpers (not xidig_ai)', () => {
    const handles = testCommunityFixtureHandles();
    expect(handles).toHaveLength(TEST_PERSONAS.length + TEST_AI_HELPERS.length);
    expect(handles).toHaveLength(62);
    expect(handles).not.toContain('xidig_ai');
    expect(new Set(handles).size).toBe(handles.length);
  });

  it('marker labels are exact (never a prefix)', () => {
    expect([...TEST_COMMUNITY_MARKER_LABELS]).toEqual([
      'test-community-v1',
      'test-community-v2',
      'test-community-awards',
    ]);
  });

  it('the quarantine migration backfill lists exactly these handles', () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../../packages/db/supabase/migrations/20260912050000_test_account_quarantine.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const block = sql.slice(
      sql.indexOf('-- BEGIN test-account backfill'),
      sql.indexOf('-- END test-account backfill'),
    );
    const listed = [...block.matchAll(/'([a-z0-9_]+)'/g)]
      .map((m) => m[1] ?? '')
      .filter(
        (h) =>
          h !== '' && !h.startsWith('test-community') && h !== 'zz_deltest_decoy' && !h.includes('example'),
      );
    expect(listed.sort()).toEqual([...testCommunityFixtureHandles()].sort());
    // Every seed-marker label the backfill accepts is one this seeder writes.
    for (const label of TEST_COMMUNITY_MARKER_LABELS) expect(block).toContain(`'${label}'`);
  });

  it('the seeder marks every account it creates or reuses (users.is_test)', () => {
    const src = readFileSync(fileURLToPath(new URL('./run.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(/is_test: true,\s+role: p\.role/); // new persona
    expect(src).toMatch(/is_ai: true, is_test: true/); // new AI helper
    expect(src).toMatch(/claimExistingFixture\(ctx, existing\.data\.user_id, p\.handle\)/);
    expect(src).toMatch(/claimExistingFixture\(ctx, existing\.data\.user_id, helper\.handle\)/);
  });
});
