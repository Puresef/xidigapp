import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getPublicLabView — the anonymous build-in-public Space projection
 * (/labs/[slug] page, its metadata and its OG card all read it). Test-account
 * quarantine (users.is_test, migration 20260912050000): a Space LED by a
 * quarantined test account is not publicly projectable (null → the page 404s
 * and the OG card falls back), and the public member count never counts test
 * members. The fake records each query's chain so the assertions pin which
 * filters were sent on the service role.
 */

type Row = Record<string, unknown>;

interface Recorded {
  op: string;
  args: unknown[];
}

interface Result {
  data: Row[];
  count: number | null;
}

class FakeQuery implements PromiseLike<Result & { error: null }> {
  readonly recorded: Recorded[] = [];
  constructor(
    readonly table: string,
    private readonly result: Result,
  ) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }

  select(columns: string, options?: unknown) {
    return this.chain('select', options === undefined ? [columns] : [columns, options]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  not(column: string, op: string, value: unknown) {
    return this.chain('not', [column, op, value]);
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return Promise.resolve({ data: this.result.data[0] ?? null, error: null });
  }

  has(op: string, args: unknown[]): boolean {
    return this.recorded.some(
      (entry) => entry.op === op && JSON.stringify(entry.args) === JSON.stringify(args),
    );
  }
  hasOp(op: string): boolean {
    return this.recorded.some((entry) => entry.op === op);
  }

  then<TResult1, TResult2>(
    onfulfilled?: ((value: Result & { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ ...this.result, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeAdmin {
  readonly calls: FakeQuery[] = [];
  constructor(private readonly seeds: Record<string, Partial<Result>>) {}

  from(table: string): FakeQuery {
    const seed = this.seeds[table] ?? {};
    const query = new FakeQuery(table, { data: seed.data ?? [], count: seed.count ?? null });
    this.calls.push(query);
    return query;
  }

  queriesFor(table: string): FakeQuery[] {
    return this.calls.filter((query) => query.table === table);
  }
}

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => adminHolder.client }));
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en'), getLocale: async () => 'en' };
});
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { getPublicLabView } from './labs-api';

const REAL_LEAD = '22222222-2222-4222-8222-222222222222';
const TEST_LEAD = '33333333-3333-4333-8333-333333333333';
const TEST_MEMBER = '44444444-4444-4444-8444-444444444444';

function publicLab(leadUserId: string): Row {
  return {
    id: 'lab-1',
    name: 'Xawilaad Sandbox',
    slug: 'xawilaad-sandbox',
    space_mode: 'club',
    short_description: null,
    problem_statement: null,
    hypothesis: null,
    success_definition: null,
    sprint_length_weeks: null,
    sprint_deadline: null,
    stage: 'building',
    promoted_at: null,
    charter_completed_at: null,
    last_activity_at: '2026-09-01T00:00:00Z',
    dormant_since: null,
    icon_path: null,
    icon_blurhash: null,
    cover_path: null,
    cover_blurhash: null,
    created_at: '2026-08-01T00:00:00Z',
    lead_user_id: leadUserId,
    visibility: 'public',
  };
}

beforeEach(() => {
  adminHolder.client = null;
});

describe('getPublicLabView — test-account quarantine', () => {
  it('a Space led by a test account is not publicly projectable (page 404s, OG falls back)', async () => {
    const admin = new FakeAdmin({
      labs: { data: [publicLab(TEST_LEAD)] },
      users: { data: [{ id: TEST_LEAD }] },
      profiles: { data: [{ display_name: 'Deeq Organiser', handle: 'deeq_organiser' }] },
      lab_members: { count: 12 },
    });
    adminHolder.client = admin;

    expect(await getPublicLabView('xawilaad-sandbox')).toBeNull();
    // Nothing is decorated for a suppressed Space — no lead byline, no count.
    expect(admin.queriesFor('profiles')).toHaveLength(0);
    expect(admin.queriesFor('lab_members')).toHaveLength(0);
    expect(admin.queriesFor('users')[0]?.has('eq', ['is_test', true])).toBe(true);
  });

  it('a real-led public Space projects, and its member count excludes test members', async () => {
    const admin = new FakeAdmin({
      labs: { data: [publicLab(REAL_LEAD)] },
      users: { data: [{ id: TEST_MEMBER }] },
      profiles: { data: [{ display_name: 'Amina', handle: 'amina' }] },
      lab_members: { count: 3 },
    });
    adminHolder.client = admin;

    const view = await getPublicLabView('xawilaad-sandbox');

    expect(view?.lead).toEqual({ display_name: 'Amina', handle: 'amina' });
    expect(view?.memberCount).toBe(3);
    const count = admin.queriesFor('lab_members')[0];
    expect(count?.has('eq', ['status', 'active'])).toBe(true);
    expect(count?.has('not', ['user_id', 'in', `(${TEST_MEMBER})`])).toBe(true);
  });

  it('with no test accounts, the count query is unchanged', async () => {
    const admin = new FakeAdmin({
      labs: { data: [publicLab(REAL_LEAD)] },
      lab_members: { count: 5 },
    });
    adminHolder.client = admin;

    const view = await getPublicLabView('xawilaad-sandbox');

    expect(view?.memberCount).toBe(5);
    expect(admin.queriesFor('lab_members')[0]?.hasOp('not')).toBe(false);
  });

  it('still returns null for a Space that is not public (no row)', async () => {
    adminHolder.client = new FakeAdmin({ labs: { data: [] } });
    expect(await getPublicLabView('private-space')).toBeNull();
  });
});
