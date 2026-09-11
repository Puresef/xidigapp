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
    auth.order.push(`anonymise:${userId}`);
    const outcome = rpc.outcomes.get(userId);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  },
}));

vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));

// Storage cleanup has its own suite; here it is stubbed so the sweep's own
// bookkeeping is what gets asserted.
const media = vi.hoisted(() => ({
  owing: [] as string[],
  results: new Map<string, unknown>(),
}));
vi.mock('./media-cleanup', () => ({
  findAccountsOwingMediaPurge: async () => {
    auth.order.push('media-scan');
    return media.owing;
  },
  purgeIdentityMedia: async (_a: unknown, id: string) => {
    const r = media.results.get(id);
    if (r instanceof Error) throw r;
    return r ?? { purged: 0, pending: 0 };
  },
}));

// Auth shutdown has its own suite too; here the sweep's reconciliation,
// isolation and counting are what get asserted.
const auth = vi.hoisted(() => ({
  owing: [] as string[] | Error,
  results: new Map<string, unknown>(),
  recorded: [] as Array<{ id: string; result: unknown }>,
  recordFails: new Set<string>(),
  order: [] as string[],
}));
vi.mock('./auth-shutdown', () => ({
  findAccountsOwingAuthCleanup: async () => {
    auth.order.push('auth-scan');
    if (auth.owing instanceof Error) throw auth.owing;
    return auth.owing;
  },
  shutDownAuthIdentity: async (_a: unknown, id: string) => {
    const r = auth.results.get(id);
    if (r instanceof Error) throw r;
    return r ?? { outcome: 'completed', changed: true };
  },
  recordAuthCleanup: async (_a: unknown, id: string, result: unknown) => {
    auth.recorded.push({ id, result });
    return !auth.recordFails.has(id);
  },
}));

// Award redaction has its own suite (lib/awards/redact.test.ts); here the
// sweep's surfacing and isolation are what get asserted.
const awards = vi.hoisted(() => ({
  result: { redacted: 0, failed: 0 } as { redacted: number; failed: number } | Error,
}));
vi.mock('@/lib/awards/redact', () => ({
  redactDeletedWinnerAwardPosts: async () => {
    auth.order.push('award-redaction');
    if (awards.result instanceof Error) throw awards.result;
    return awards.result;
  },
}));

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
  media.owing = [];
  media.results.clear();
  auth.owing = [];
  auth.results.clear();
  auth.recorded.length = 0;
  auth.recordFails.clear();
  auth.order.length = 0;
  awards.result = { redacted: 0, failed: 0 };
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
      authCompleted: 0,
      authPending: 0,
      mediaPurged: 0,
      mediaPending: 0,
      recordingsPurged: 0,
      awardPostsRedacted: 0,
      awardPostsPending: 0,
    });
  });

  it('surfaces award-post redactions and failures (retained content, step e)', async () => {
    awards.result = { redacted: 2, failed: 1 };
    const counts = await runLifecycleSweep(
      new FakeAdmin({ users: [], verifications: [] }) as never,
      NOW,
    );
    expect(counts.awardPostsRedacted).toBe(2);
    expect(counts.awardPostsPending).toBe(1);
    expect(auth.order.at(-1)).toBe('award-redaction');
  });

  it('a failed award redaction scan is owed work, never a stalled sweep', async () => {
    awards.result = new Error('connection reset');
    rpc.outcomes.set('a', { outcome: 'anonymised', mediaPending: 0 });
    const counts = await runLifecycleSweep(
      new FakeAdmin({ users: [{ id: 'a' }], verifications: [] }) as never,
      NOW,
    );
    expect(counts.anonymised).toBe(1);
    expect(counts.awardPostsRedacted).toBe(0);
    expect(counts.awardPostsPending).toBe(1);
  });

  it('logs a failure by id and driver message only', async () => {
    rpc.outcomes.set('a', new Error('duplicate key value violates unique constraint'));
    const admin = new FakeAdmin({ users: [{ id: 'a' }], verifications: [] });
    await runLifecycleSweep(admin as never, NOW);
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(String(logged[0])).toContain('anonymise failed for a');
    expect(logged.join(' ')).not.toMatch(/@|display_name|handle/);
  });
  it('reports media cleanup from the reconciliation scan, including old failures', async () => {
    // u-old was finalised by an EARLIER run whose cleanup failed; the scan
    // finds it again even though no account transitions this run.
    media.owing = ['u-new', 'u-old'];
    media.results.set('u-new', { purged: 2, pending: 0 });
    media.results.set('u-old', { purged: 0, pending: 1 });
    const admin = new FakeAdmin({ users: [], verifications: [] });

    const counts = await runLifecycleSweep(admin as never, NOW);

    expect(counts.mediaPurged).toBe(2);
    expect(counts.mediaPending).toBe(1);
    expect(counts.anonymised).toBe(0);
  });

  it('a thrown purge still counts as media owed, so the run cannot read as complete', async () => {
    media.owing = ['u-boom'];
    media.results.set('u-boom', new Error('storage unreachable'));
    const admin = new FakeAdmin({ users: [], verifications: [] });
    const counts = await runLifecycleSweep(admin as never, NOW);
    expect(counts.mediaPending).toBeGreaterThan(0);
  });

  it('a failed media scan does not abort the sweep', async () => {
    const admin = new FakeAdmin({ users: [], verifications: [] });
    const counts = await runLifecycleSweep(admin as never, NOW);
    expect(counts.recordingsPurged).toBe(0);
  });

  it('shuts auth down after the transition and before media, from its own reconciliation scan', async () => {
    rpc.outcomes.set('a', { outcome: 'anonymised', mediaPending: 0 });
    // 'a' was finalised just now; 'old' by an earlier run whose auth step failed.
    auth.owing = ['a', 'old'];
    const admin = new FakeAdmin({ users: [{ id: 'a' }], verifications: [] });

    const counts = await runLifecycleSweep(admin as never, NOW);

    expect(auth.order).toEqual(['anonymise:a', 'auth-scan', 'media-scan', 'award-redaction']);
    expect(auth.recorded.map((r) => r.id)).toEqual(['a', 'old']);
    expect(counts.authCompleted).toBe(2);
    expect(counts.authPending).toBe(0);
  });

  it('one account failing at the provider does not block another', async () => {
    auth.owing = ['bad', 'good'];
    auth.results.set('bad', { outcome: 'failed', failure: 'provider_unavailable' });
    auth.results.set('good', { outcome: 'completed', changed: true });
    const admin = new FakeAdmin({ users: [], verifications: [] });

    const counts = await runLifecycleSweep(admin as never, NOW);

    expect(counts.authCompleted).toBe(1);
    expect(counts.authPending).toBe(1);
    expect(auth.recorded).toEqual([
      { id: 'bad', result: { outcome: 'failed', failure: 'provider_unavailable' } },
      { id: 'good', result: { outcome: 'completed', changed: true } },
    ]);
  });

  it('a thrown shutdown is still owed, and the next account still runs', async () => {
    auth.owing = ['boom', 'next'];
    auth.results.set('boom', new Error('unexpected'));
    const admin = new FakeAdmin({ users: [], verifications: [] });

    const counts = await runLifecycleSweep(admin as never, NOW);

    expect(counts.authPending).toBe(1);
    expect(counts.authCompleted).toBe(1);
  });

  it('provider done but bookkeeping not written → still pending, never "complete"', async () => {
    auth.owing = ['a'];
    auth.recordFails.add('a');
    const admin = new FakeAdmin({ users: [], verifications: [] });

    const counts = await runLifecycleSweep(admin as never, NOW);

    expect(counts.authCompleted).toBe(0);
    expect(counts.authPending).toBe(1);
  });

  it('a failed auth scan cannot read as complete, and does not abort the sweep', async () => {
    auth.owing = new Error('scan boom');
    const admin = new FakeAdmin({ users: [], verifications: [] });

    const counts = await runLifecycleSweep(admin as never, NOW);

    expect(counts.authPending).toBeGreaterThan(0);
    expect(auth.order).toContain('media-scan');
  });

  it('auth logs carry a category only — no account id, address or provider text', async () => {
    auth.owing = ['0b5c1e4e-6d0a-4a39-9d51-2d6f3c7e9a10'];
    auth.results.set('0b5c1e4e-6d0a-4a39-9d51-2d6f3c7e9a10', {
      outcome: 'failed',
      failure: 'verification_failed',
    });
    const admin = new FakeAdmin({ users: [], verifications: [] });

    await runLifecycleSweep(admin as never, NOW);

    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => c.join(' '))
      .join('\n');
    expect(logged).toContain('verification_failed');
    expect(logged).not.toContain('0b5c1e4e');
    expect(logged).not.toMatch(/@/);
  });
});
