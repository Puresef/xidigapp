import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Maal venture read models — test-account quarantine (users.is_test,
 * migration 20260912050000). A quarantined seeded/test account never counts
 * as organic venture activity:
 *
 *   * the overview's "Xubno · {n}" member count excludes test members (inside
 *     the head count — still an aggregate);
 *   * the ledger's contribution tally drops test members' rows, so totals,
 *     the contributor count, the member table and every share are computed
 *     over real members only. The work_events rows are untouched.
 *
 * The fake applies PostgREST semantics for the filters these reads use and
 * answers the contribution-tally RPC from a seeded result.
 */

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>, rpcData: Record<string, Row[]> = {}) {
  return {
    rpc: async (name: string) => ({ data: rpcData[name] ?? [], error: null }),
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let head = false;
      const run = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
      const query = {
        select: (_cols: string, opts?: { head?: boolean }) => ((head = opts?.head === true), query),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), query),
        not: (c: string, op: string, list: string) => {
          if (op !== 'in') throw new Error(`unsupported not.${op}`);
          const ids = list
            .replace(/^\(|\)$/g, '')
            .split(',')
            .filter(Boolean);
          filters.push((r) => !ids.includes(String(r[c])));
          return query;
        },
        gte: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            head
              ? { data: null, count: run().length, error: null }
              : { data: run(), count: null, error: null },
          ).then(resolve),
      };
      return query;
    },
  };
}

const holder = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => holder.admin }));

import { getVentureLedger, getVentureOverview, type VentureRow } from './views';

const LAB = 'lab-1';
const LEAD = 'lead-1';

const lab = {
  id: LAB,
  lead_user_id: LEAD,
  space_mode: 'venture',
  visibility: 'public',
  ledger_visibility: 'members',
  hours_visibility: 'members',
  goal_target: null,
  goal_progress: 0,
  dormant_since: null,
} as unknown as VentureRow;

const ctx = {
  appUser: { id: LEAD, role: 'member', status: 'active' },
  supabase: fakeClient({}),
} as never;

function member(user_id: string, status = 'active', role = 'member'): Row {
  return { lab_id: LAB, user_id, status, role };
}

function tallyRow(member_user_id: string, units: number, hours: number, events: number): Row {
  return {
    member_user_id,
    units,
    verified_units: units,
    hours: String(hours),
    code_count: 0,
    design_count: 0,
    intro_count: 0,
    money_cents: 0,
    event_count: events,
  };
}

const USERS: Row[] = [
  { id: LEAD, is_test: false },
  { id: 'real-2', is_test: false },
  { id: 'fixture-8', is_test: true },
  { id: 'fixture-9', is_test: true },
];

beforeEach(() => {
  holder.admin = null;
});

describe('getVentureOverview — the member count excludes test members', () => {
  it('counts only real active members', async () => {
    holder.admin = fakeClient({
      users: USERS,
      lab_members: [
        member(LEAD, 'active', 'lead'),
        member('real-2'),
        member('fixture-8'),
        member('fixture-9'),
        member('real-3', 'requested'),
      ],
    });

    const overview = await getVentureOverview(ctx, lab);
    expect(overview.memberCount).toBe(2);
  });

  it('is the plain active count when there are no test accounts (control)', async () => {
    holder.admin = fakeClient({
      users: [{ id: LEAD, is_test: false }],
      lab_members: [member(LEAD, 'active', 'lead'), member('real-2'), member('real-3', 'left')],
    });
    expect((await getVentureOverview(ctx, lab)).memberCount).toBe(2);
  });
});

describe('getVentureLedger — test members are not organic contributors', () => {
  it('drops test members from totals, contributor count, the table and the shares', async () => {
    holder.admin = fakeClient(
      {
        users: USERS,
        lab_members: [member(LEAD, 'active', 'lead'), member('real-2'), member('fixture-9')],
        profiles: [
          { user_id: LEAD, display_name: 'Lead', handle: 'lead' },
          { user_id: 'real-2', display_name: 'Real Two', handle: 'real_two' },
          { user_id: 'fixture-9', display_name: 'Fixture', handle: 'fixture' },
        ],
      },
      {
        venture_contribution_tally: [
          tallyRow(LEAD, 40, 5, 3),
          tallyRow('real-2', 60, 7.5, 2),
          // A fixture with more logged work than everyone else combined.
          tallyRow('fixture-9', 100, 20, 10),
        ],
      },
    );

    const ledger = await getVentureLedger(ctx, lab);

    expect(ledger.stats).toMatchObject({
      contributorCount: 2,
      totalUnits: 100,
      totalHours: 12.5,
      eventCount: 5,
    });
    expect(ledger.members.map((m) => m.userId)).toEqual(['real-2', LEAD]);
    expect(ledger.members.map((m) => m.share)).toEqual([0.6, 0.4]);
    expect(JSON.stringify(ledger.members)).not.toContain('fixture-9');
  });
});

// ---------------------------------------------------------------------------
// The Maal index (frame 7a): a listed space led by a quarantined test account
// is not discovery and never counts in the chips; the viewer's own spaces
// still show. The row query and all four chip counts carry the SAME predicate.
// ---------------------------------------------------------------------------
describe('listVentureIndex — test-led spaces are not discovery', () => {
  function recordingClient(tables: Record<string, Row[]>) {
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    return {
      calls,
      client: {
        from(table: string) {
          const chain: Record<string, unknown> = {};
          for (const method of ['select', 'eq', 'in', 'or', 'not', 'order', 'limit']) {
            chain[method] = (...args: unknown[]) => {
              calls.push({ table, method, args });
              return chain;
            };
          }
          chain.then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: tables[table] ?? [], count: 0, error: null }).then(resolve);
          return chain;
        },
      },
    };
  }

  it('excludes test-led listed spaces from rows and every chip, keeping the viewer’s own', async () => {
    const { listVentureIndex } = await import('./views');
    const fake = recordingClient({
      lab_members: [{ lab_id: 'my-lab' }],
      users: [{ id: 'test-lead' }],
      labs: [],
    });
    holder.admin = fake.client;
    const ctx = { appUser: { id: 'viewer' }, supabase: fake.client } as never;
    await listVentureIndex(ctx, { filter: 'all' });

    const ors = fake.calls.filter((c) => c.table === 'labs' && c.method === 'or').map((c) => c.args[0]);
    // 1 row query + 4 chip counts, all with the quarantine predicate.
    expect(ors).toHaveLength(5);
    for (const predicate of ors) {
      expect(predicate).toBe('and(is_listed.eq.true,lead_user_id.not.in.(test-lead)),id.in.(my-lab)');
    }
  });

  it('with no test accounts the predicate is unchanged', async () => {
    const { listVentureIndex } = await import('./views');
    const fake = recordingClient({ lab_members: [], users: [], labs: [] });
    holder.admin = fake.client;
    const ctx = { appUser: { id: 'viewer' }, supabase: fake.client } as never;
    await listVentureIndex(ctx, { filter: 'all' });
    const labCalls = fake.calls.filter((c) => c.table === 'labs');
    expect(labCalls.some((c) => c.method === 'or')).toBe(false);
    expect(labCalls.filter((c) => c.method === 'eq' && c.args[0] === 'is_listed')).toHaveLength(4);
  });
});
