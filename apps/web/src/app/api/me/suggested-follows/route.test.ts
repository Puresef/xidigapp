import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LabMatch } from '@/lib/matching/looking-for';

/**
 * GET /api/me/suggested-follows — test-account quarantine (users.is_test,
 * migration 20260912050000). A quarantined seeded/test account is never
 * suggested, however well it matches the viewer's declared fields; an account
 * whose flags cannot confirm it is NOT a test account is treated as one (fail
 * closed, the same posture as is_ai); test accounts are kept out of the
 * bounded candidate legs themselves so they cannot crowd real members out;
 * and a Space led by a test account is never suggested.
 *
 * The fake answers each query from a resolver over the recorded chain, so a
 * single `users` table can serve both the quarantine id lookup and the
 * account-flags lookup, and the assertions can pin which filters were sent.
 */

type Row = Record<string, unknown>;

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  readonly recorded: Recorded[] = [];
  constructor(
    readonly table: string,
    private readonly resolve: (query: FakeQuery) => Row[],
  ) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }

  select(columns: string) {
    return this.chain('select', [columns]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  neq(column: string, value: unknown) {
    return this.chain('neq', [column, value]);
  }
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  not(column: string, op: string, value: unknown) {
    return this.chain('not', [column, op, value]);
  }
  overlaps(column: string, values: unknown[]) {
    return this.chain('overlaps', [column, values]);
  }
  ilike(column: string, pattern: string) {
    return this.chain('ilike', [column, pattern]);
  }
  order(column: string, options?: unknown) {
    return this.chain('order', [column, options]);
  }
  limit(count: number) {
    return this.chain('limit', [count]);
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return Promise.resolve({ data: this.resolve(this)[0] ?? null, error: null });
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
    onfulfilled?:
      ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.resolve(this), error: null }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: FakeQuery[] = [];
  constructor(private readonly resolver: (query: FakeQuery) => Row[] = () => []) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(table, this.resolver);
    this.calls.push(query);
    return query;
  }

  queriesFor(table: string): FakeQuery[] {
    return this.calls.filter((query) => query.table === table);
  }
}

const h = vi.hoisted(() => ({
  ctx: null as unknown,
  admin: null as unknown,
  labMatches: [] as LabMatch[],
}));

vi.mock('@/lib/auth/guards', () => ({ requireUser: async () => h.ctx }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => h.admin }));
vi.mock('@/lib/matching/looking-for', () => ({
  findLabsSeekingSkills: async () => h.labMatches,
}));
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en'), getLocale: async () => 'en' };
});
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { GET } from './route';

const VIEWER = '11111111-1111-4111-8111-111111111111';
const REAL = '22222222-2222-4222-8222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';
const UNKNOWN = '44444444-4444-4444-8444-444444444444';
const UNCONFIRMED = '55555555-5555-4555-8555-555555555555';

function profile(userId: string): Row {
  return {
    user_id: userId,
    display_name: `Name ${userId.slice(0, 4)}`,
    handle: `h_${userId.slice(0, 4)}`,
    location_city: 'Hargeisa',
    location_country: 'Somaliland',
    lanes: ['fintech'],
    skills: ['react'],
    avatar_path: null,
    avatar_blurhash: null,
  };
}

/** The viewer's own RLS reads: declared lanes + skills, no relationships. */
function callerClient(): FakeClient {
  return new FakeClient((query) =>
    query.table === 'profiles'
      ? [{ lanes: ['fintech'], skills: ['react'], location_city: null, location_country: null }]
      : [],
  );
}

interface AdminSeed {
  testIds: string[];
  candidates: Row[];
  /** users flags rows for the pool (whatever the DB would return). */
  flags: Row[];
  labLeads?: Row[];
}

function adminClient(seed: AdminSeed): FakeClient {
  return new FakeClient((query) => {
    switch (query.table) {
      case 'users':
        // Quarantine id lookup vs the account-flags lookup for the pool.
        return query.has('eq', ['is_test', true]) ? seed.testIds.map((id) => ({ id })) : seed.flags;
      case 'profiles':
        // The fake does NOT apply the `not in` filter — the route's own
        // gate must still drop anything that gets through.
        return seed.candidates;
      case 'labs':
        return seed.labLeads ?? [];
      default:
        return [];
    }
  });
}

interface Body {
  data: {
    people: Array<{ user_id: string }>;
    labs: Array<{ lab_id: string }>;
  };
}

beforeEach(() => {
  h.ctx = { appUser: { id: VIEWER, status: 'active' }, supabase: callerClient() };
  h.labMatches = [];
});

describe('GET /api/me/suggested-follows — test-account quarantine', () => {
  it('never suggests a test account, even a perfect match; a real member still is', async () => {
    const admin = adminClient({
      testIds: [PERSONA],
      candidates: [profile(REAL), profile(PERSONA)],
      flags: [
        { id: REAL, is_ai: false, is_test: false, status: 'active' },
        { id: PERSONA, is_ai: false, is_test: true, status: 'active' },
      ],
    });
    h.admin = admin;

    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Body;
    expect(body.data.people.map((person) => person.user_id)).toEqual([REAL]);

    // Kept out of every bounded candidate leg, so it cannot crowd real
    // members out of the pool.
    const legs = admin.queriesFor('profiles').filter((query) => query.hasOp('overlaps'));
    expect(legs.length).toBeGreaterThan(0);
    for (const leg of legs) {
      expect(leg.has('not', ['user_id', 'in', `(${PERSONA})`])).toBe(true);
    }
  });

  it('treats an account whose flags cannot confirm it is not a test account as ineligible', async () => {
    h.admin = adminClient({
      testIds: [],
      candidates: [profile(REAL), profile(UNKNOWN), profile(UNCONFIRMED)],
      flags: [
        { id: REAL, is_ai: false, is_test: false, status: 'active' },
        // UNKNOWN: no users row at all. UNCONFIRMED: a row without is_test.
        { id: UNCONFIRMED, is_ai: false, status: 'active' },
      ],
    });

    const body = (await (await GET()).json()) as Body;
    expect(body.data.people.map((person) => person.user_id)).toEqual([REAL]);
  });

  it('never suggests a Space led by a test account', async () => {
    h.labMatches = [
      {
        labId: 'lab-real',
        slug: 'lab-real',
        name: 'Real Space',
        shortDescription: null,
        stage: 'building',
        matchedSkills: ['react'],
        score: 1,
      },
      {
        labId: 'lab-persona',
        slug: 'lab-persona',
        name: 'Seeded Space',
        shortDescription: null,
        stage: 'building',
        matchedSkills: ['react'],
        score: 1,
      },
    ];
    h.admin = adminClient({
      testIds: [PERSONA],
      candidates: [],
      flags: [],
      labLeads: [
        { id: 'lab-real', lead_user_id: REAL },
        { id: 'lab-persona', lead_user_id: PERSONA },
      ],
    });

    const body = (await (await GET()).json()) as Body;
    expect(body.data.labs.map((lab) => lab.lab_id)).toEqual(['lab-real']);
  });

  it('adds no quarantine filter (and no lab-lead read) when there are no test accounts', async () => {
    h.labMatches = [
      {
        labId: 'lab-real',
        slug: 'lab-real',
        name: 'Real Space',
        shortDescription: null,
        stage: 'building',
        matchedSkills: ['react'],
        score: 1,
      },
    ];
    const admin = adminClient({
      testIds: [],
      candidates: [profile(REAL)],
      flags: [{ id: REAL, is_ai: false, is_test: false, status: 'active' }],
    });
    h.admin = admin;

    const body = (await (await GET()).json()) as Body;
    expect(body.data.people.map((person) => person.user_id)).toEqual([REAL]);
    expect(body.data.labs.map((lab) => lab.lab_id)).toEqual(['lab-real']);
    for (const leg of admin.queriesFor('profiles')) expect(leg.hasOp('not')).toBe(false);
    expect(admin.queriesFor('labs')).toHaveLength(0);
  });
});
