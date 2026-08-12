import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/labs/[id]/contributions/export — the member's own copy of the
 * ledger (7g "Soo deji CSV"). Three properties the file owes them:
 *
 *   * **numbers are numbers.** The spreadsheet-injection guard belongs to
 *     free text; applied to numeric cells it turned every reversal — which is
 *     always negative — into apostrophe-prefixed text nobody could sum, in the
 *     one file people open precisely to check corrections;
 *   * **the file is the whole history**, paged through server-side rather than
 *     cut off at the screen's first page with nothing in the file to say so;
 *   * **the screen's readability gate**, refused before a single event is read.
 *
 * FakeQuery/FakeClient harness from api/events/[slug]/checkin/route.test.ts,
 * adapted for list reads (`data` is an array, and the chain records `lt` so
 * the keyset cursor can be asserted).
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string } | null;

interface Recorded {
  op: string;
  args: unknown[];
}

interface Seed {
  rows?: Row[];
  error?: PgError;
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: PgError }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly seed: Seed) {}

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
  gte(column: string, value: unknown) {
    return this.chain('gte', [column, value]);
  }
  lt(column: string, value: unknown) {
    return this.chain('lt', [column, value]);
  }
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  order(column: string, options?: unknown) {
    return this.chain('order', [column, options]);
  }
  limit(count: number) {
    return this.chain('limit', [count]);
  }
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }

  then<T1, T2>(
    onfulfilled?: ((value: { data: Row[]; error: PgError }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.seed.rows ?? [], error: this.seed.error ?? null }).then(
      onfulfilled,
      onrejected,
    );
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
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const viewerHolder = vi.hoisted(() => ({ viewer: null as unknown }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/maal/views', () => ({
  loadVentureForViewer: async () => ({ id: LAB_ID, slug: 'beeraha' }),
  getVentureViewer: async () => viewerHolder.viewer,
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: async () => {},
}));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { GET } from './route';

const LAB_ID = '44444444-4444-4444-8444-444444444444';
const MEMBER = '11111111-1111-4111-8111-111111111111';

/** The route's own page size — the boundary the paging loop turns on. */
const PAGE_SIZE = 200;

function contextFor(supabase: FakeClient): unknown {
  return {
    user: { id: MEMBER },
    appUser: { id: MEMBER, role: 'member', status: 'active' },
    supabase,
  };
}

function viewerFor(canReadLedger: boolean): unknown {
  return {
    userId: MEMBER,
    relation: 'member',
    isMember: true,
    isLead: false,
    isMod: false,
    canManage: false,
    canContribute: true,
    canReadLedger,
    canReadHours: true,
  };
}

function eventRow(seq: number, overrides: Row = {}): Row {
  return {
    id: `event-${seq}`,
    seq,
    member_user_id: MEMBER,
    event_type: 'hours',
    quantity: 3,
    units: 24,
    task_id: null,
    note: null,
    occurred_at: '2026-08-01T09:00:00Z',
    ...overrides,
  };
}

function request(): Request {
  return new Request(`https://xidig.test/api/labs/${LAB_ID}/contributions/export`);
}

function routeParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: LAB_ID }) };
}

/** The CSV minus the BOM, the header row and the trailing newline. */
async function dataLines(response: Response): Promise<string[]> {
  const text = (await response.text()).replace(/^﻿/, '').trimEnd();
  return text.split('\r\n').slice(1);
}

beforeEach(() => {
  authHolder.ctx = null;
  adminHolder.client = new FakeClient();
  viewerHolder.viewer = viewerFor(true);
});

describe('GET /api/labs/[id]/contributions/export', () => {
  it('emits numeric cells bare — a reversal stays a number the member can sum', async () => {
    const caller = new FakeClient({
      work_events: [{ rows: [eventRow(9, { quantity: -3, units: -24 })] }],
    });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = new FakeClient({
      profiles: [{ rows: [{ user_id: MEMBER, display_name: 'Hodan' }] }],
    });

    const response = await GET(request(), routeParams());
    const [row] = await dataLines(response);

    expect(response.status).toBe(200);
    // seq, when, member, type, quantity, units, task, witnesses, note
    expect(row).toBe('9,"2026-08-01T09:00:00Z","Hodan","maal.typeHours",-3,-24,,0,');
    expect(row).not.toContain("'-");
  });

  it('keeps the injection guard on free text — a formula note stays inert', async () => {
    const caller = new FakeClient({
      work_events: [{ rows: [eventRow(4, { note: '=cmd|calc', task_id: 'task-1' })] }],
      venture_tasks: [{ rows: [{ id: 'task-1', title: '+bootstrap' }] }],
    });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = new FakeClient({ profiles: [{ rows: [] }] });

    const [row] = await dataLines(await GET(request(), routeParams()));

    expect(row).toContain('"\'=cmd|calc"');
    expect(row).toContain('"\'+bootstrap"');
  });

  it('pages the whole history instead of stopping at the screen page', async () => {
    const first = Array.from({ length: PAGE_SIZE }, (_, index) => eventRow(PAGE_SIZE + 5 - index));
    const second = Array.from({ length: 5 }, (_, index) => eventRow(5 - index));
    const caller = new FakeClient({ work_events: [{ rows: first }, { rows: second }] });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = new FakeClient({ profiles: [{ rows: [] }] });

    const rows = await dataLines(await GET(request(), routeParams()));

    expect(rows).toHaveLength(PAGE_SIZE + 5);
    expect(caller.queryCount('work_events')).toBe(2);
    // Keyset, not offset: the second page continues below the last seq read.
    expect(caller.queryFor('work_events', 1).argsOf('lt')).toEqual(['seq', 6]);
    // …and hydration is chunked so no `.in()` filter grows an unbounded URL.
    expect(caller.queryCount('work_event_attestations')).toBe(3);
  });

  it('stops at the last short page', async () => {
    const caller = new FakeClient({ work_events: [{ rows: [eventRow(1)] }] });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = new FakeClient({ profiles: [{ rows: [] }] });

    await GET(request(), routeParams());

    expect(caller.queryCount('work_events')).toBe(1);
  });

  it('403s a viewer who may not read the ledger, before any event is read', async () => {
    const caller = new FakeClient();
    authHolder.ctx = contextFor(caller);
    viewerHolder.viewer = viewerFor(false);

    const response = await GET(request(), routeParams());
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('forbidden');
    expect(caller.calls).toEqual([]);
  });

  it('fails the whole export when a page read fails — never a partial file', async () => {
    const caller = new FakeClient({
      work_events: [{ rows: [], error: { code: '42501', message: 'nope' } }],
    });
    authHolder.ctx = contextFor(caller);

    const response = await GET(request(), routeParams());

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).not.toContain('text/csv');
  });
});
