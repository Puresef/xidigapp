import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runLifecycleSweep } from './sweeps';

/**
 * The sweep is reconciliation-based (Vercel documents duplicate and
 * overlapping cron runs, and never retries): it selects what is due, hands
 * each row to the transactional RPC, and reports honestly. Pinned here:
 *
 *  - the cutoff is DELETION_GRACE_DAYS before the injected clock;
 *  - one failing account does not stop the others and is counted as failed;
 *  - skipped / already_deleted outcomes are counted, not treated as work done;
 *  - mediaPending is summed and surfaced — a run is not "complete" with it > 0.
 */

const rpc = vi.hoisted(() => ({ outcomes: new Map<string, unknown>(), calls: [] as string[] }));

vi.mock('./anonymise', () => ({
  anonymiseUser: async (_admin: unknown, userId: string) => {
    rpc.calls.push(userId);
    const outcome = rpc.outcomes.get(userId);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  },
}));

vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  readonly recorded: Array<{ op: string; args: unknown[] }> = [];
  constructor(private readonly rows: Row[]) {}
  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }
  select(c: string) {
    return this.chain('select', [c]);
  }
  update(v: Row) {
    return this.chain('update', [v]);
  }
  eq(c: string, v: unknown) {
    return this.chain('eq', [c, v]);
  }
  lt(c: string, v: unknown) {
    return this.chain('lt', [c, v]);
  }
  not(c: string, op: string, v: unknown) {
    return this.chain('not', [c, op, v]);
  }
  argsOf(op: string) {
    return this.recorded.find((r) => r.op === op)?.args;
  }
  then<T1, T2>(
    onfulfilled?: ((v: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeAdmin {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Row[]>) {}
  from(table: string) {
    const q = new FakeQuery(this.seeds[table] ?? []);
    this.calls.push({ table, query: q });
    return q;
  }
  queryFor(table: string, nth = 0) {
    return this.calls.filter((c) => c.table === table)[nth]!.query;
  }
}

const NOW = new Date('2026-09-11T03:30:00.000Z');

beforeEach(() => {
  rpc.outcomes.clear();
  rpc.calls.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runLifecycleSweep', () => {
  it('selects pending_deletion rows older than the 30-day grace, relative to the injected clock', async () => {
    const admin = new FakeAdmin({ users: [], verifications: [] });
    await runLifecycleSweep(admin as never, NOW);
    const q = admin.queryFor('users');
    expect(q.argsOf('eq')).toEqual(['status', 'pending_deletion']);
    expect(q.argsOf('lt')).toEqual(['deletion_requested_at', '2026-08-12T03:30:00.000Z']);
  });

  it('counts every outcome honestly and keeps going past a failure', async () => {
    rpc.outcomes.set('a', { outcome: 'anonymised', mediaPending: 2 });
    rpc.outcomes.set('b', new Error('boom'));
    rpc.outcomes.set('c', { outcome: 'skipped', status: 'active' });
    rpc.outcomes.set('d', { outcome: 'already_deleted' });
    rpc.outcomes.set('e', { outcome: 'anonymised', mediaPending: 0 });
    const admin = new FakeAdmin({
      users: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      verifications: [],
    });

    const counts = await runLifecycleSweep(admin as never, NOW);

    expect(rpc.calls).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(counts).toEqual({
      anonymised: 2,
      skipped: 1,
      alreadyDeleted: 1,
      failed: 1,
      mediaPending: 2,
      recordingsPurged: 0,
    });
  });

  it('logs a failure by id and driver message only', async () => {
    rpc.outcomes.set('a', new Error('duplicate key value violates unique constraint'));
    const admin = new FakeAdmin({ users: [{ id: 'a' }], verifications: [] });
    await runLifecycleSweep(admin as never, NOW);
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(String(logged[0])).toContain('anonymise failed for a');
    expect(logged.join(' ')).not.toMatch(/@|display_name|handle/);
  });
});
