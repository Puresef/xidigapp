import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/endorsements — §14 peer endorsement, acceptance A8.
 *
 * Three properties this route owes the Xirfadaha module:
 *   * the count is DISTINCT endorsers — a repeat is idempotent, never a second
 *     row (the unique constraint is what makes A8 structural; the route just
 *     has to stop turning it into a 500);
 *   * you cannot endorse yourself, in plain §27 language rather than a check
 *     violation; and
 *   * you cannot invent a skill on someone else's profile.
 *
 * The write runs on the CALLER's client on purpose — `skill_endorsements` has a
 * real insert policy, and going through the service role would move the
 * decision out of the database. `getSupabaseAdmin` is mocked as a READ-ONLY
 * fake that serves exactly one read — the quarantined test-account set
 * (`users` where is_test) — and throws for any other table; it has no write
 * methods at all. So a regression to a service-role write is still a test
 * failure, not a review note.
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string } | null;

interface Recorded {
  op: string;
  args: unknown[];
}

interface Seed {
  row?: Row | null;
  error?: PgError;
  count?: number | null;
  /** A count that depends on the recorded filters — emulates PostgREST `not in`. */
  countFor?: (query: FakeQuery) => number;
}

class FakeQuery implements PromiseLike<{ data: Row | null; error: PgError; count: number | null }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly seed: Seed) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }
  select(columns: string, options?: unknown) {
    return this.chain('select', options === undefined ? [columns] : [columns, options]);
  }
  insert(values: Row) {
    return this.chain('insert', [values]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  not(column: string, operator: string, value: unknown) {
    return this.chain('not', [column, operator, value]);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }

  then<T1, T2>(
    onfulfilled?:
      | ((value: {
          data: Row | null;
          error: PgError;
          count: number | null;
        }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({
      data: this.seed.row ?? null,
      error: this.seed.error ?? null,
      count: this.seed.countFor ? this.seed.countFor(this) : (this.seed.count ?? null),
    }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Seed[]> = {}) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.seeds[table]?.shift() ?? {});
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

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
/** The quarantined test-account ids the service role reports, and its reads. */
const adminHolder = vi.hoisted(() => ({ testIds: [] as string[], reads: [] as string[] }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'users') {
        throw new Error('endorsements must write as the endorser, never the service role');
      }
      // Read-only, and only the one read loadTestAccountIds makes.
      return {
        select: (columns: string) => ({
          eq: async (column: string, value: unknown) => {
            adminHolder.reads.push(`${table}.${columns} where ${column}=${String(value)}`);
            return { data: adminHolder.testIds.map((id) => ({ id })), error: null };
          },
        }),
      };
    },
  }),
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => {} }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { POST } from './route';

const ENDORSER = '11111111-1111-4111-8111-111111111111';
const ENDORSEE = '22222222-2222-4222-8222-222222222222';

function postRequest(body: unknown): Request {
  return new Request('https://xidig.test/api/endorsements', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function contextFor(client: FakeClient): unknown {
  return {
    user: { id: ENDORSER },
    appUser: { id: ENDORSER, role: 'member', status: 'active' },
    supabase: client,
  };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeEach(() => {
  authHolder.ctx = null;
  adminHolder.testIds = [];
  adminHolder.reads = [];
});

describe('POST /api/endorsements', () => {
  it('records a first endorsement as the endorser and returns the distinct-endorser count', async () => {
    const client = new FakeClient({
      profiles: [{ row: { skills: ['react', 'logistics'] } }],
      skill_endorsements: [{}, { count: 12 }],
    });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'React' }));
    const body = (await response.json()) as { data: { endorsed: boolean; endorsers: number } };

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ endorsed: true, endorsers: 12 });
    // The insert names the caller as endorser and the skill in its stored form.
    expect(client.queryFor('skill_endorsements').argsOf('insert')).toEqual([
      { endorser_user_id: ENDORSER, endorsee_user_id: ENDORSEE, skill: 'react' },
    ]);
  });

  it('is idempotent: a second endorsement is a 200 and the count does not move (A8)', async () => {
    const client = new FakeClient({
      profiles: [{ row: { skills: ['react'] } }],
      skill_endorsements: [
        { error: { code: '23505', message: 'duplicate key value' } },
        { count: 12 },
      ],
    });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'react' }));
    const body = (await response.json()) as { data: { endorsers: number } };

    expect(response.status).toBe(200);
    expect(body.data.endorsers).toBe(12);
  });

  it('400s self-endorsement in §27 language, without querying anything', async () => {
    const client = new FakeClient();
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSER, skill: 'react' }));

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('endorse_self');
    expect(client.calls).toEqual([]);
  });

  it('turns the no-self CHECK violation into the same 400, never a 500', async () => {
    const client = new FakeClient({
      profiles: [{ row: { skills: ['react'] } }],
      skill_endorsements: [{ error: { code: '23514', message: 'skill_endorsements_no_self' } }],
    });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'react' }));

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('endorse_self');
  });

  it('refuses a skill the endorsee never listed — an endorsement is not a write into someone else’s identity', async () => {
    const client = new FakeClient({ profiles: [{ row: { skills: ['react'] } }] });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'astrology' }));

    expect(response.status).toBe(400);
    expect(client.queryCount('skill_endorsements')).toBe(0);
  });

  it('404s a profile the caller cannot read (RLS-scoped lookup)', async () => {
    const client = new FakeClient({ profiles: [{ row: null }] });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'react' }));

    expect(response.status).toBe(404);
    expect(client.queryCount('skill_endorsements')).toBe(0);
  });
});

/**
 * Test-account quarantine (users.is_test). An endorsement from a seeded/test
 * account is not attested evidence: such an account cannot endorse, cannot be
 * endorsed, and the depth the route returns leaves test endorsers out — the
 * same number the Xirfadaha module renders.
 */
describe('POST /api/endorsements test-account quarantine', () => {
  const TEST_A = '99999999-9999-4999-8999-99999999999a';
  const TEST_B = '99999999-9999-4999-8999-99999999999b';

  it('a test account cannot endorse — 403 forbidden, nothing read or written on the caller client', async () => {
    adminHolder.testIds = [ENDORSER];
    const client = new FakeClient({ profiles: [{ row: { skills: ['react'] } }] });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'react' }));

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('forbidden');
    expect(client.calls).toEqual([]);
  });

  it('a test account cannot be endorsed — 404, no endorsement row', async () => {
    adminHolder.testIds = [ENDORSEE];
    const client = new FakeClient({ profiles: [{ row: { skills: ['react'] } }] });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'react' }));

    expect(response.status).toBe(404);
    expect(client.queryCount('skill_endorsements')).toBe(0);
  });

  it('the returned depth leaves test endorsers out', async () => {
    adminHolder.testIds = [TEST_A, TEST_B];
    const client = new FakeClient({
      profiles: [{ row: { skills: ['react'] } }],
      skill_endorsements: [
        {},
        // Five endorsers on file for this skill; two are test accounts.
        { countFor: (query) => (query.argsOf('not') ? 3 : 5) },
      ],
    });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'react' }));
    const body = (await response.json()) as { data: { endorsers: number } };

    expect(response.status).toBe(201);
    expect(body.data.endorsers).toBe(3);
    expect(client.queryFor('skill_endorsements', 1).argsOf('not')).toEqual([
      'endorser_user_id',
      'in',
      `(${TEST_A},${TEST_B})`,
    ]);
    // The write still ran as the endorser, on the caller's client.
    expect(client.queryFor('skill_endorsements').argsOf('insert')).toEqual([
      { endorser_user_id: ENDORSER, endorsee_user_id: ENDORSEE, skill: 'react' },
    ]);
    // And the service role was only ever asked for the test-account set.
    expect(adminHolder.reads).toEqual(['users.id where is_test=true']);
  });

  it('with no test accounts at all, the count is unfiltered (no empty `in ()` list)', async () => {
    const client = new FakeClient({
      profiles: [{ row: { skills: ['react'] } }],
      skill_endorsements: [{}, { count: 2 }],
    });
    authHolder.ctx = contextFor(client);

    const response = await POST(postRequest({ userId: ENDORSEE, skill: 'react' }));

    expect(response.status).toBe(201);
    expect(client.queryFor('skill_endorsements', 1).argsOf('not')).toBeUndefined();
  });
});
