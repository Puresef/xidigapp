import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * GET /api/labs — Discover tab counts contract (Task 13). The route decorates
 * every page with `counts` (All / Clubs / Labs / My Spaces) computed as
 * head-only exact counts issued on the CALLER's RLS-scoped client — never the
 * service role — so a member can't infer hidden Spaces from any number. Same
 * recording-fake technique as api/listings/route.test.ts: each query's filter
 * chain is recorded, so assertions prove which client ran which filters.
 */

type Row = Record<string, unknown>;

interface Seed {
  rows?: Row[];
  count?: number | null;
}

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null; count: number | null }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly seed: Seed) {}

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
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  is(column: string, value: unknown) {
    return this.chain('is', [column, value]);
  }
  not(column: string, op: string, value: unknown) {
    return this.chain('not', [column, op, value]);
  }
  or(filter: string) {
    return this.chain('or', [filter]);
  }
  order(column: string, options?: unknown) {
    return this.chain('order', [column, options]);
  }
  limit(count: number) {
    return this.chain('limit', [count]);
  }

  has(op: string, args: unknown[]): boolean {
    return this.recorded.some(
      (entry) => entry.op === op && JSON.stringify(entry.args) === JSON.stringify(args),
    );
  }
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }

  then<TResult1, TResult2>(
    onfulfilled?:
      | ((value: { data: Row[]; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.seed.rows ?? [],
      error: null,
      count: this.seed.count ?? null,
    }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Seed[]> = {}) {}

  from(table: string): FakeQuery {
    const seed = this.seeds[table]?.shift() ?? {};
    const query = new FakeQuery(seed);
    this.calls.push({ table, query });
    return query;
  }

  queryFor(table: string, nth = 0): FakeQuery {
    const hit = this.calls.filter((call) => call.table === table)[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.query;
  }
  queryCount(table: string): number {
    return this.calls.filter((call) => call.table === table).length;
  }
}

const authHolder = vi.hoisted(() => ({
  ctx: null as unknown,
  error: null as Error | null,
}));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));

// Request-scoped machinery (cookies, after(), Sentry) doesn't exist under
// vitest — stubbed inert, same as the listings route test.
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: () => {},
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => true,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));
// Recording mock: tests pin WHICH capability a gate checks, not just that a
// check exists — a capability-name swap must fail a test, not ride on the
// supporter tier happening to hold every gate today.
const membershipMock = vi.hoisted(() => ({
  hasCapability: vi.fn(async () => false),
}));
vi.mock('@/lib/membership', () => membershipMock);
vi.mock('@/lib/reputation/service', () => ({
  awardBadge: async () => {},
}));
vi.mock('@/lib/labs/service', () => ({
  createLab: async () => {
    throw new Error('not under test');
  },
}));

import { GET, POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = '22222222-2222-4222-8222-222222222222';

function labRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    name: 'Xawilaad Sandbox',
    slug: `space-${id}`,
    space_mode: 'lab',
    source: 'member',
    short_description: null,
    problem_statement: null,
    hypothesis: null,
    sprint_length_weeks: null,
    sprint_deadline: null,
    success_definition: null,
    charter_completed_at: null,
    promoted_at: null,
    stage: 'building',
    visibility: 'members',
    is_listed: true,
    is_supporter_only: false,
    member_list_visibility: 'members',
    join_mode: 'open',
    lead_user_id: LEAD_ID,
    last_activity_at: '2026-07-30T00:00:00Z',
    dormant_since: null,
    icon_path: null,
    icon_blurhash: null,
    cover_path: null,
    cover_blurhash: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-30T00:00:00Z',
    ...overrides,
  };
}

function contextFor(client: FakeClient): unknown {
  return {
    user: { id: USER_ID },
    appUser: { id: USER_ID, role: 'member', status: 'active' },
    supabase: client,
  };
}

function getRequest(qs = ''): Request {
  return new Request(`https://xidig.test/api/labs${qs}`);
}

interface CountsBody {
  data: {
    items: Array<{ lab: { id: string }; memberPreview: unknown[] }>;
    nextCursor: string | null;
    counts: { all: number; clubs: number; labs: number; mine: number };
  };
}

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
  adminHolder.client = null;
});

describe('GET /api/labs — tab counts', () => {
  it('returns counts from four caller-RLS head queries with the tab filters', async () => {
    const caller = new FakeClient({
      // Queue order: main browse query, then all / clubs / labs / mine heads.
      labs: [{ rows: [] }, { count: 12 }, { count: 7 }, { count: 5 }, { count: 2 }],
    });
    const admin = new FakeClient({
      lab_members: [{ rows: [{ lab_id: 'LAB-A' }, { lab_id: 'LAB-B' }] }],
    });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await GET(getRequest());
    const body = (await response.json()) as CountsBody;

    expect(response.status).toBe(200);
    expect(body.data.counts).toEqual({ all: 12, clubs: 7, labs: 5, mine: 2 });

    // 1 browse + 4 head counts, ALL on the caller's client; the admin client
    // never touches labs (counts must not bypass RLS).
    expect(caller.queryCount('labs')).toBe(5);
    expect(admin.queryCount('labs')).toBe(0);

    const head = { count: 'exact', head: true };
    const all = caller.queryFor('labs', 1);
    expect(all.argsOf('select')).toEqual(['id', head]);
    expect(all.has('eq', ['is_listed', true])).toBe(true);

    const clubs = caller.queryFor('labs', 2);
    expect(clubs.has('eq', ['is_listed', true])).toBe(true);
    expect(clubs.has('eq', ['space_mode', 'club'])).toBe(true);

    const labs = caller.queryFor('labs', 3);
    expect(labs.has('eq', ['is_listed', true])).toBe(true);
    expect(labs.has('eq', ['space_mode', 'lab'])).toBe(true);

    // Mine: scoped to the caller's own membership ids (admin scan), then
    // still filtered by the labs SELECT policy on the caller client.
    const mine = caller.queryFor('labs', 4);
    expect(mine.argsOf('select')).toEqual(['id', head]);
    expect(mine.argsOf('in')).toEqual(['id', ['LAB-A', 'LAB-B']]);
    const scan = admin.queryFor('lab_members');
    expect(scan.has('eq', ['user_id', USER_ID])).toBe(true);
    expect(scan.has('eq', ['status', 'active'])).toBe(true);
  });

  it('no memberships: mine is 0 without a fourth labs head query', async () => {
    const caller = new FakeClient({
      labs: [{ rows: [] }, { count: 3 }, { count: 1 }, { count: 2 }],
    });
    const admin = new FakeClient({ lab_members: [{ rows: [] }] });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await GET(getRequest());
    const body = (await response.json()) as CountsBody;

    expect(body.data.counts).toEqual({ all: 3, clubs: 1, labs: 2, mine: 0 });
    expect(caller.queryCount('labs')).toBe(4);
  });

  it('mine=1 with no memberships still answers with counts', async () => {
    const caller = new FakeClient({
      labs: [{ count: 3 }, { count: 1 }, { count: 2 }],
    });
    const admin = new FakeClient({ lab_members: [{ rows: [] }] });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await GET(getRequest('?mine=1'));
    const body = (await response.json()) as CountsBody;

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(body.data.counts).toEqual({ all: 3, clubs: 1, labs: 2, mine: 0 });
  });

  it('members-visibility Space: the API answer for an outside viewer is count-only', async () => {
    // The adversarial check from the brief, at the API boundary: a viewer who
    // is NOT a member of a member_list_visibility='members' Space gets
    // memberPreview: [] — the roster never leaves the server.
    const caller = new FakeClient({
      labs: [
        { rows: [labRow('LAB-A', { member_list_visibility: 'members' })] },
        { count: 1 },
        { count: 0 },
        { count: 1 },
      ],
    });
    const admin = new FakeClient({
      // Route order on admin.lab_members: membership scan (counts), then
      // hydrateLabs roster + viewer-membership lookups.
      lab_members: [
        { rows: [] },
        { rows: [{ lab_id: 'LAB-A', user_id: LEAD_ID, role: 'lead' }] },
        { rows: [] },
      ],
      lab_tags: [{ rows: [] }],
      lab_skill_needs: [{ rows: [] }],
      profiles: [
        {
          rows: [
            {
              user_id: LEAD_ID,
              display_name: 'Amina',
              handle: 'amina',
              avatar_path: null,
              avatar_blurhash: null,
            },
          ],
        },
      ],
    });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await GET(getRequest());
    const body = (await response.json()) as CountsBody;

    expect(response.status).toBe(200);
    expect(body.data.items.map((item) => item.lab.id)).toEqual(['LAB-A']);
    expect(body.data.items[0]?.memberPreview).toEqual([]);
  });

  it('signed-out callers hit the member gate (401) — no anonymous counts path', async () => {
    authHolder.error = new ApiError('session_expired', 401);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
  });
});

describe('GET /api/labs — test-account quarantine (users.is_test)', () => {
  const TEST_LEAD = '33333333-3333-4333-8333-333333333333';
  const excludeTestLed = ['lead_user_id', 'in', `(${TEST_LEAD})`];

  it('Discover never lists or counts a Space led by a test account; My Spaces is unfiltered', async () => {
    const caller = new FakeClient({
      // Queue order: main browse query, then all / clubs / labs / mine heads.
      labs: [{ rows: [] }, { count: 4 }, { count: 2 }, { count: 2 }, { count: 1 }],
    });
    const admin = new FakeClient({
      lab_members: [{ rows: [{ lab_id: 'LAB-A' }] }],
      users: [{ rows: [{ id: TEST_LEAD }] }],
    });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await GET(getRequest());
    expect(response.status).toBe(200);

    // The browse and the three discovery tab counts exclude test-led Spaces …
    for (const nth of [0, 1, 2, 3]) {
      expect(caller.queryFor('labs', nth).has('not', excludeTestLed), `labs query #${nth}`).toBe(
        true,
      );
    }
    // … the caller's own memberships count is left as it is.
    expect(caller.queryFor('labs', 4).has('not', excludeTestLed)).toBe(false);
    // The id list is read once on the service role, by the is_test marker.
    expect(admin.queryFor('users').has('eq', ['is_test', true])).toBe(true);
  });

  it('mine=1 lists the caller’s own Spaces without the discovery exclusion', async () => {
    const caller = new FakeClient({
      labs: [{ rows: [] }, { count: 4 }, { count: 2 }, { count: 2 }, { count: 1 }],
    });
    const admin = new FakeClient({
      lab_members: [{ rows: [{ lab_id: 'LAB-A' }] }],
      users: [{ rows: [{ id: TEST_LEAD }] }],
    });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await GET(getRequest('?mine=1'));
    expect(response.status).toBe(200);

    const browse = caller.queryFor('labs', 0);
    expect(browse.argsOf('in')).toEqual(['id', ['LAB-A']]);
    expect(browse.has('not', excludeTestLed)).toBe(false);
  });

  it('hydrated member counts on the Discover page exclude test members', async () => {
    const caller = new FakeClient({
      labs: [
        { rows: [labRow('LAB-A', { member_list_visibility: 'public' })] },
        { count: 1 },
        { count: 0 },
        { count: 1 },
      ],
    });
    const admin = new FakeClient({
      lab_members: [
        { rows: [] }, // membership scan
        {
          rows: [
            { lab_id: 'LAB-A', user_id: LEAD_ID, role: 'lead' },
            { lab_id: 'LAB-A', user_id: TEST_LEAD, role: 'member' },
          ],
        },
        { rows: [] }, // viewer membership
      ],
      lab_tags: [{ rows: [] }],
      lab_skill_needs: [{ rows: [] }],
      // Route's quarantine read, then hydrateLabs' own.
      users: [{ rows: [{ id: TEST_LEAD }] }, { rows: [{ id: TEST_LEAD }] }],
      profiles: [
        {
          rows: [
            {
              user_id: LEAD_ID,
              display_name: 'Amina',
              handle: 'amina',
              avatar_path: null,
              avatar_blurhash: null,
            },
          ],
        },
      ],
    });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      data: { items: Array<{ memberCount: number; memberPreview: Array<{ user_id: string }> }> };
    };

    expect(response.status).toBe(200);
    expect(body.data.items[0]?.memberCount).toBe(1);
    expect(body.data.items[0]?.memberPreview.map((m) => m.user_id)).toEqual([LEAD_ID]);
  });
});

describe('POST /api/labs — opening a Lab is paused for everyone (Xidig Plus doctrine)', () => {
  it('403s mode=lab with lab_eligibility_under_review, whatever the tier — the tier is never consulted', async () => {
    authHolder.ctx = contextFor(new FakeClient());
    adminHolder.client = new FakeClient();
    // Even a caller whose tier WOULD have held create_lab is refused.
    membershipMock.hasCapability.mockResolvedValue(true);

    const response = await POST(
      new Request('https://app.xidig.net/api/labs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'lab',
          name: 'Xawilaad Sandbox 2',
          slug: 'xawilaad-sandbox-2',
          problemStatement: 'p',
          hypothesis: 'h',
          successDefinition: 's',
        }),
      }),
    );
    const body = (await response.json()) as { error?: { code?: string; cta?: unknown } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe('lab_eligibility_under_review');
    // Neutral: no upgrade prompt rides on the refusal.
    expect(body.error?.cta ?? null).toBeNull();
    // The paid tier no longer decides Lab creation: no capability lookup at all.
    expect(membershipMock.hasCapability).not.toHaveBeenCalled();
    membershipMock.hasCapability.mockReset();
  });
});
