import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FOUNDING_MEMBER_CAP } from '@/lib/auth/constants';

import {
  applyOrganicContentFilter,
  countFoundingSpotsLeft,
  foundingMembersCountQuery,
  ORGANIC_CONTENT_SOURCE,
  SOURCE_COLUMN_TABLES,
} from './organic';

/**
 * Organic-proof invariant (docs/front-door-plan.md §4, extras plan item 7):
 * seeded/AI content must NEVER surface as front-door proof. Two layers here:
 *
 *   1. Unit tests: the shared helpers actually apply the filters
 *      (`users.is_ai = false` AND `users.is_test = false`, `source = 'member'`)
 *      and the founding counter math/resilience behaves.
 *   2. A SOURCE-SCAN GUARD: every front-door module that queries `users` or a
 *      `source`-carrying table must go through (or at least repeat) the
 *      organic filter — for `users`, both exclusions. A future front-door
 *      query that forgets either fails this suite — the invariant is a test,
 *      not an assertion.
 */

// ---------------------------------------------------------------------------
// Fake query builder that records the chain (registry.test.ts precedent).
// ---------------------------------------------------------------------------
interface RecordedQuery {
  table: string;
  selectArgs: unknown[];
  filters: Array<{ column: string; value: unknown }>;
}

function makeFakeAdmin(result: { count: number | null; error: { message: string } | null }) {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const record: RecordedQuery = { table, selectArgs: [], filters: [] };
    queries.push(record);
    const q = {
      select: (...args: unknown[]) => ((record.selectArgs = args), q),
      eq: (column: string, value: unknown) => (record.filters.push({ column, value }), q),
      then: (onFulfilled: (v: typeof result) => unknown) =>
        Promise.resolve(result).then(onFulfilled),
    };
    return q;
  }

  return { admin: { from } as never, queries };
}

describe('foundingMembersCountQuery / countFoundingSpotsLeft', () => {
  it('counts users with the is_ai AND is_test exclusions applied', async () => {
    const { admin, queries } = makeFakeAdmin({ count: 42, error: null });
    await foundingMembersCountQuery(admin);

    expect(queries).toHaveLength(1);
    expect(queries[0]?.table).toBe('users');
    // Head-only exact count — a counter, not a data read.
    expect(queries[0]?.selectArgs[1]).toEqual({ count: 'exact', head: true });
    // THE invariant: AI/system accounts never occupy a founding spot…
    expect(queries[0]?.filters).toContainEqual({ column: 'is_ai', value: false });
    // …and neither do quarantined seeded/test accounts (users.is_test,
    // migration 20260912050000): 62 fixture members must not shrink the
    // number of real founding spots left.
    expect(queries[0]?.filters).toContainEqual({ column: 'is_test', value: false });
  });

  it('returns spots left below the cap', async () => {
    const { admin } = makeFakeAdmin({ count: 42, error: null });
    expect(await countFoundingSpotsLeft(admin)).toBe(FOUNDING_MEMBER_CAP - 42);
  });

  it('clamps at zero once the cap is reached', async () => {
    const { admin } = makeFakeAdmin({ count: FOUNDING_MEMBER_CAP + 7, error: null });
    expect(await countFoundingSpotsLeft(admin)).toBe(0);
  });

  it('treats a null count as zero members', async () => {
    const { admin } = makeFakeAdmin({ count: null, error: null });
    expect(await countFoundingSpotsLeft(admin)).toBe(FOUNDING_MEMBER_CAP);
  });

  it('degrades to null on a query error (resilience rule)', async () => {
    const { admin } = makeFakeAdmin({ count: null, error: { message: 'boom' } });
    expect(await countFoundingSpotsLeft(admin)).toBeNull();
  });

  it('degrades to null on a thrown error', async () => {
    const admin = {
      from: () => {
        throw new Error('network down');
      },
    } as never;
    expect(await countFoundingSpotsLeft(admin)).toBeNull();
  });
});

describe('applyOrganicContentFilter', () => {
  it("applies source='member'", () => {
    const filters: Array<{ column: string; value: unknown }> = [];
    const q = {
      eq(column: string, value: string) {
        filters.push({ column, value });
        return q;
      },
    };
    expect(applyOrganicContentFilter(q)).toBe(q);
    expect(filters).toEqual([{ column: 'source', value: 'member' }]);
    expect(ORGANIC_CONTENT_SOURCE).toBe('member');
  });
});

// ---------------------------------------------------------------------------
// Source-scan guard: front-door modules cannot forget the organic filter.
// ---------------------------------------------------------------------------

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Every surface an anonymous visitor reaches through the front door. */
const FRONT_DOOR_DIRS = ['lib/front', 'components/front', 'app/(front)'];
const FRONT_DOOR_FILES = ['app/page.tsx', 'app/waitlist/page.tsx'];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

function frontDoorModules(): Array<{ path: string; content: string }> {
  const files = [
    ...FRONT_DOOR_DIRS.flatMap((dir) => collectSourceFiles(join(SRC_ROOT, dir))),
    ...FRONT_DOOR_FILES.map((file) => join(SRC_ROOT, file)),
  ];
  return files.map((path) => ({ path, content: readFileSync(path, 'utf8') }));
}

/** Tables queried via supabase `.from('<table>')` in a module's source. */
function queriedTables(content: string): string[] {
  return [...content.matchAll(/\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g)].map((m) => m[1]!);
}

/**
 * Rule A predicate: a module that queries `users` either goes through the
 * shared founding-counter helper, or carries BOTH organic exclusions inline —
 * `is_ai = false` (AI/system accounts) AND `is_test = false` (quarantined
 * seeded/test accounts). One without the other is not organic.
 */
function usersQueryIsOrganic(content: string): boolean {
  if (/countFoundingSpotsLeft|foundingMembersCountQuery/.test(content)) return true;
  const excludesAi = /eq\(\s*['"]is_ai['"]\s*,\s*false\s*\)/.test(content);
  const excludesTest = /eq\(\s*['"]is_test['"]\s*,\s*false\s*\)/.test(content);
  return excludesAi && excludesTest;
}

describe('organic-proof source-scan guard (front-door modules)', () => {
  const modules = frontDoorModules();

  it('scans a non-empty front-door surface (guard is alive)', () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it('the users-query predicate demands BOTH exclusions (or the helper)', () => {
    const q = (filters: string) => `admin.from('users').select('id')${filters}`;
    expect(usersQueryIsOrganic(q(".eq('is_ai', false).eq('is_test', false)"))).toBe(true);
    expect(usersQueryIsOrganic(q(".eq('is_ai', false)"))).toBe(false);
    expect(usersQueryIsOrganic(q(".eq('is_test', false)"))).toBe(false);
    expect(usersQueryIsOrganic(q(''))).toBe(false);
    expect(usersQueryIsOrganic('await countFoundingSpotsLeft(admin)')).toBe(true);
  });

  it('every front-door query on `users` excludes is_ai AND is_test', () => {
    const offenders = modules.filter(
      ({ content }) => queriedTables(content).includes('users') && !usersQueryIsOrganic(content),
    );
    expect(
      offenders.map(({ path }) => path),
      'Front-door module queries `users` without the organic is_ai + is_test ' +
        'exclusions — route it through lib/front/organic (docs/front-door-plan.md §4)',
    ).toEqual([]);
  });

  it('every front-door query on a source-carrying table filters to organic content', () => {
    const sourceTables = new Set<string>(SOURCE_COLUMN_TABLES);
    const offenders = modules.filter(({ path, content }) => {
      if (path.endsWith(`lib/front/organic.ts`)) return false; // the definition site
      const touched = queriedTables(content).filter((t) => sourceTables.has(t));
      if (touched.length === 0) return false;
      return !/applyOrganicContentFilter|ORGANIC_CONTENT_SOURCE|eq\(\s*['"]source['"]\s*,\s*['"]member['"]\s*\)/.test(
        content,
      );
    });
    expect(
      offenders.map(({ path }) => path),
      'Front-door module queries a source-carrying table without the ' +
        "source='member' organic filter — use applyOrganicContentFilter " +
        '(docs/front-door-plan.md §4)',
    ).toEqual([]);
  });

  it('the two live counters go through the shared helper (no inline drift)', () => {
    for (const file of ['components/front/front-home.tsx', 'app/waitlist/page.tsx']) {
      const content = readFileSync(join(SRC_ROOT, file), 'utf8');
      expect(content, `${file} must use the shared founding counter`).toContain(
        'countFoundingSpotsLeft',
      );
      // No parallel inline users query that could silently lose the filter.
      expect(queriedTables(content), `${file} must not query users inline`).not.toContain('users');
    }
  });
});
