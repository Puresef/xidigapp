import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '@xidig/i18n';

/**
 * POST /api/admin/award-cycles/[quarter]/publish — tally → winners → system
 * Plaza posts → award_results (Task 8).
 *
 * The FakeClient harness is the endorsements one adapted for this route: the
 * admin client is LEGITIMATELY used here (the ballots are own-row-only under
 * RLS and re-tallied service-side without quarantined test accounts — see
 * lib/awards/publish.test.ts — and every write is service-role + audited
 * behind requireRole('admin')), so `rpc`, `upsert`, `update`, range filters,
 * and head-counts are recorded too. Properties under lock:
 *
 *   * non-admin → 403, nothing touched;
 *   * cycle still open (closes_at > now) → 409 award_cycle_not_closed, no
 *     tally call (results NEVER post mid-cycle — §20 anti-bandwagoning);
 *   * already published → idempotent 200 {already:true}, no tally call;
 *   * concurrent-ish double publish → the claim-first conditional stamp is
 *     the serialization point: the loser resolves {already:true} BEFORE any
 *     post/result exists (final-review fix 4 — no duplicate celebration);
 *   * happy path: system-source post authored by the badged seed actor (never
 *     a human), award_results row linked to the post, cycle claim-stamped
 *     published_at up front + results_post_id linked at the end.
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string } | null;

interface Recorded {
  op: string;
  args: unknown[];
}

interface Seed {
  row?: Row | null;
  rows?: Row[];
  error?: PgError;
  count?: number | null;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: PgError; count: number | null }> {
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
  upsert(values: Row, options?: unknown) {
    return this.chain('upsert', options === undefined ? [values] : [values, options]);
  }
  update(values: Row) {
    return this.chain('update', [values]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  is(column: string, value: unknown) {
    return this.chain('is', [column, value]);
  }
  gte(column: string, value: unknown) {
    return this.chain('gte', [column, value]);
  }
  lte(column: string, value: unknown) {
    return this.chain('lte', [column, value]);
  }
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  not(column: string, operator: string, value: unknown) {
    return this.chain('not', [column, operator, value]);
  }
  order(column: string, options?: unknown) {
    return this.chain('order', options === undefined ? [column] : [column, options]);
  }
  range(from: number, to: number) {
    return this.chain('range', [from, to]);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  single() {
    return this.chain('single', []);
  }
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }

  then<T1, T2>(
    onfulfilled?:
      | ((value: { data: unknown; error: PgError; count: number | null }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({
      data: this.seed.rows ?? this.seed.row ?? null,
      error: this.seed.error ?? null,
      count: this.seed.count ?? null,
    }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  readonly rpcCalls: Array<{ fn: string; args: unknown }> = [];
  constructor(
    private readonly seeds: Record<string, Seed[]> = {},
    private readonly rpcSeeds: Record<string, Seed[]> = {},
  ) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.seeds[table]?.shift() ?? {});
    this.calls.push({ table, query });
    return query;
  }
  rpc(fn: string, args: unknown): PromiseLike<{ data: unknown; error: PgError }> {
    this.rpcCalls.push({ fn, args });
    const seed = this.rpcSeeds[fn]?.shift() ?? {};
    return Promise.resolve({ data: seed.rows ?? seed.row ?? null, error: seed.error ?? null });
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

const holder = vi.hoisted(() => ({
  ctx: null as unknown,
  admin: null as unknown,
  audits: [] as Array<Record<string, unknown>>,
  emits: [] as Array<{ name: string; properties: unknown }>,
}));

vi.mock('@/lib/auth/guards', () => ({
  requireRole: async () => {
    if (!holder.ctx) {
      const { ApiError } = await import('@/lib/api');
      throw new ApiError('forbidden', 403);
    }
    return holder.ctx;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => holder.admin,
}));
// lib/api.ts's apiError()/handleApiError() resolve §27 error copy via
// getT() (request locale) independently of the route — this mock is for
// THAT path, unrelated to the fixed-Somali translator the route now passes
// to publishAwardResults for the stored post body.
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
}));
vi.mock('@/lib/audit', () => ({
  writeAudit: async (_admin: unknown, entry: Record<string, unknown>) => {
    holder.audits.push(entry);
  },
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: (event: { name: string; properties: unknown }) => {
    holder.emits.push(event);
  },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { POST } from './route';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const AI_USER = '22222222-2222-4222-8222-222222222222';
const WINNER = '33333333-3333-4333-8333-333333333333';
const QUARTER = '2026-Q2';

const PAST = '2026-04-01T00:00:00.000Z';
const PAST_CLOSE = '2026-07-01T00:00:00.000Z';
const FUTURE_CLOSE = '2199-01-01T00:00:00.000Z';

function adminCtx(): unknown {
  return {
    user: { id: ADMIN_ID },
    appUser: { id: ADMIN_ID, role: 'admin', status: 'active' },
  };
}

function post(quarter = QUARTER, headers: HeadersInit = {}): Promise<Response> {
  return POST(
    new Request(`https://xidig.test/api/admin/award-cycles/${quarter}/publish`, {
      method: 'POST',
      headers,
    }),
    { params: Promise.resolve({ quarter }) },
  );
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeEach(() => {
  holder.ctx = null;
  holder.admin = null;
  holder.audits = [];
  holder.emits = [];
});

describe('POST /api/admin/award-cycles/[quarter]/publish', () => {
  it('403s a non-admin without touching anything', async () => {
    const client = new FakeClient();
    holder.admin = client;

    const response = await post();

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('forbidden');
    expect(client.calls).toEqual([]);
    expect(client.rpcCalls).toEqual([]);
  });

  it('409s award_cycle_not_closed while the cycle is still open — never a mid-cycle tally', async () => {
    const client = new FakeClient({
      award_cycles: [
        { row: { quarter: QUARTER, opens_at: PAST, closes_at: FUTURE_CLOSE, published_at: null } },
      ],
    });
    holder.ctx = adminCtx();
    holder.admin = client;

    const response = await post();

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('award_cycle_not_closed');
    expect(client.rpcCalls).toEqual([]);
    // No ballot read either — the tally is re-counted from award_votes now.
    expect(client.queryCount('award_votes')).toBe(0);
    expect(client.queryCount('posts')).toBe(0);
  });

  it('404s an unknown cycle', async () => {
    const client = new FakeClient({ award_cycles: [{ row: null }] });
    holder.ctx = adminCtx();
    holder.admin = client;

    const response = await post();

    expect(response.status).toBe(404);
    expect(client.rpcCalls).toEqual([]);
  });

  it('a second publish is an idempotent 200 {already:true} — no tally, no posts, no audit', async () => {
    const client = new FakeClient({
      award_cycles: [
        {
          row: {
            quarter: QUARTER,
            opens_at: PAST,
            closes_at: PAST_CLOSE,
            published_at: '2026-07-02T00:00:00.000Z',
          },
        },
      ],
    });
    holder.ctx = adminCtx();
    holder.admin = client;

    const response = await post();
    const body = (await response.json()) as { data: { already: boolean } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ already: true });
    expect(client.rpcCalls).toEqual([]);
    expect(client.queryCount('award_votes')).toBe(0);
    expect(client.queryCount('posts')).toBe(0);
    expect(holder.audits).toEqual([]);
    expect(holder.emits).toEqual([]);
  });

  it('a concurrent-ish second publish loses the claim → 200 {already:true}, creates nothing', async () => {
    // Both requests read published_at: null before either stamped it; the
    // atomic claim UPDATE (`is published_at null` + returning row) is the
    // serialization point — the loser gets 0 rows back and stops BEFORE the
    // tally, before any post, before any result row.
    const client = new FakeClient({
      award_cycles: [
        // 1: the cycle lookup (still unpublished); 2: the claim — no row back.
        { row: { quarter: QUARTER, opens_at: PAST, closes_at: PAST_CLOSE, published_at: null } },
        { row: null },
      ],
    });
    holder.ctx = adminCtx();
    holder.admin = client;

    const response = await post();
    const body = (await response.json()) as { data: { already: boolean } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ already: true });
    expect(client.rpcCalls).toEqual([]);
    expect(client.queryCount('award_votes')).toBe(0);
    expect(client.queryCount('posts')).toBe(0);
    expect(client.queryCount('seed_entities')).toBe(0);
    expect(client.queryCount('award_results')).toBe(0);
    expect(holder.audits).toEqual([]);
    expect(holder.emits).toEqual([]);

    // The claim was the conditional publish stamp — atomic, race-safe.
    const claim = client.queryFor('award_cycles', 1);
    const [claimValues] = claim.argsOf('update') as [Record<string, unknown>];
    expect(typeof claimValues.published_at).toBe('string');
    expect(claim.argsOf('is')).toEqual(['published_at', null]);
  });

  it('happy path: tallies, creates the system post, records the result, stamps the cycle', async () => {
    const client = new FakeClient({
      award_cycles: [
        // 1: the cycle lookup; 2: the claim-first publish stamp (returns
        // the row — this caller won); 3: the anchor-post link.
        { row: { quarter: QUARTER, opens_at: PAST, closes_at: PAST_CLOSE, published_at: null } },
        { row: { quarter: QUARTER } },
        {},
      ],
      profiles: [
        // 1: the badged system actor (getSeedActorUserId); 2: winner display.
        { row: { user_id: AI_USER } },
        { row: { display_name: 'Deeqa Axmed' } },
      ],
      posts: [
        // 1: most_helpful evidence head-count; 2: the system post insert.
        { count: 7 },
        { row: { id: 'post-1' } },
      ],
      seed_entities: [
        // Registry claim path: lookup miss → claim → backfill.
        { row: null },
        { row: { id: 'se-1' } },
        {},
      ],
      award_results: [{}],
      // No quarantined test accounts in this cycle.
      users: [{ rows: [] }],
      // The ballots themselves (re-tallied app-side): three votes for WINNER,
      // then the empty page that ends the read.
      award_votes: [
        {
          rows: ['v1', 'v2', 'v3'].map((voter) => ({
            category: 'most_helpful',
            target_type: 'user',
            target_id: WINNER,
            voter_user_id: voter,
          })),
        },
        { rows: [] },
      ],
    });
    holder.ctx = adminCtx();
    holder.admin = client;

    // The stored body is a fixed-Somali platform artifact — an English
    // request locale on the publishing admin's own session must have zero
    // effect on it (only API error messages, unaffected here, follow request
    // locale).
    const response = await post(QUARTER, { 'accept-language': 'en' });
    const body = (await response.json()) as { data: { postIds: string[] } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ postIds: ['post-1'] });

    // The tally re-counted the requested quarter's ballots (service role),
    // instead of award_vote_tally() — which would also count test accounts.
    expect(client.rpcCalls).toEqual([]);
    expect(client.queryFor('award_votes').argsOf('eq')).toEqual(['quarter', QUARTER]);

    // The post is authored by the badged system actor with system provenance —
    // an 'update', never pinned, body carrying the composed title + provenance
    // sentence (the fallback for non-award-aware surfaces) rendered in FIXED
    // Somali regardless of the admin's `Accept-Language: en` request above.
    const soT = createTranslator('so');
    const expectedTitle = soT('awards.resultTitle', {
      category: soT('awards.categoryMostHelpful'),
      period: QUARTER,
      name: 'Deeqa Axmed',
    });
    const postInsert = client.queryFor('posts', 1).argsOf('insert') as [Record<string, unknown>];
    expect(postInsert[0].author_user_id).toBe(AI_USER);
    expect(postInsert[0].source).toBe('system');
    expect(postInsert[0].type).toBe('update');
    expect(postInsert[0].pinned_at).toBeUndefined();
    expect(String(postInsert[0].body)).toContain(expectedTitle);
    expect(String(postInsert[0].body)).toContain(soT('awards.systemProvenance'));
    expect(String(postInsert[0].body)).not.toContain('Most Helpful');

    // Registry dedup key — re-publishing can never double-post a category.
    const claim = client.queryFor('seed_entities', 1).argsOf('insert') as [Record<string, unknown>];
    expect(claim[0].dedup_key).toBe(`award:${QUARTER}:most_helpful`);
    expect(claim[0].source).toBe('system');

    // The award_results row links winner ↔ post with the asker-confirmed count.
    const resultUpsert = client.queryFor('award_results').argsOf('upsert') as [
      Record<string, unknown>,
    ];
    expect(resultUpsert[0]).toMatchObject({
      quarter: QUARTER,
      category: 'most_helpful',
      target_type: 'user',
      target_id: WINNER,
      votes: 3,
      post_id: 'post-1',
      evidence: { asksResolved: 7 },
    });

    // Claim-first: the publish stamp is the atomic conditional update (query
    // 2), and the anchor post links at the end (query 3).
    const cycleClaim = client.queryFor('award_cycles', 1);
    const [cycleClaimValues] = cycleClaim.argsOf('update') as [Record<string, unknown>];
    expect(typeof cycleClaimValues.published_at).toBe('string');
    expect(cycleClaim.argsOf('is')).toEqual(['published_at', null]);
    const anchorUpdate = client.queryFor('award_cycles', 2).argsOf('update') as [
      Record<string, unknown>,
    ];
    expect(anchorUpdate[0]).toEqual({ results_post_id: 'post-1' });

    expect(holder.audits).toEqual([
      expect.objectContaining({ actorUserId: ADMIN_ID, action: 'award_cycle.published' }),
    ]);
    expect(holder.emits).toEqual([
      { name: 'award_results_published', properties: { quarter: QUARTER } },
    ]);
  });

  it('a zero-vote cycle publishes empty: no posts, cycle stamped with results_post_id null, still 200', async () => {
    const client = new FakeClient({
      award_cycles: [
        // 1: the cycle lookup; 2: the claim-first publish stamp; 3: anchor.
        { row: { quarter: QUARTER, opens_at: PAST, closes_at: PAST_CLOSE, published_at: null } },
        { row: { quarter: QUARTER } },
        {},
      ],
      users: [{ rows: [] }],
      award_votes: [{ rows: [] }],
    });
    holder.ctx = adminCtx();
    holder.admin = client;

    const response = await post();
    const body = (await response.json()) as { data: { postIds: string[] } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ postIds: [] });

    // No winners → no seed actor lookup, no posts, no award_results row.
    expect(client.queryCount('posts')).toBe(0);
    expect(client.queryCount('profiles')).toBe(0);
    expect(client.queryCount('seed_entities')).toBe(0);
    expect(client.queryCount('award_results')).toBe(0);

    // The cycle still gets claim-stamped published, with a null anchor post.
    const claim = client.queryFor('award_cycles', 1).argsOf('update') as [Record<string, unknown>];
    expect(typeof claim[0].published_at).toBe('string');
    const anchorUpdate = client.queryFor('award_cycles', 2).argsOf('update') as [
      Record<string, unknown>,
    ];
    expect(anchorUpdate[0]).toEqual({ results_post_id: null });

    expect(holder.audits).toEqual([
      expect.objectContaining({ actorUserId: ADMIN_ID, action: 'award_cycle.published' }),
    ]);
    expect(holder.emits).toEqual([
      { name: 'award_results_published', properties: { quarter: QUARTER } },
    ]);
  });
});
