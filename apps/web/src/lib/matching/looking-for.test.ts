import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Labs seeking you" (findLabsSeekingSkills) — test-account quarantine
 * (users.is_test, migration 20260912050000). A Space led by a quarantined
 * seeded/test account is fixture data, so it is never suggested — on the
 * member Home block, GET /api/me/looking-for and the suggested-follows Labs
 * leg alike (all three go through this matcher). Excluded in the labs query
 * via a payload-free service-role id list; the needs and labs reads still
 * ride the member's own RLS client.
 */

type Row = Record<string, unknown>;
type Call = { op: string; args: unknown[] };

class FakeClient {
  readonly queries: Array<{ table: string; calls: Call[] }> = [];
  constructor(private readonly seeds: Record<string, (calls: Call[]) => Row[]>) {}
  from(table: string) {
    const calls: Call[] = [];
    this.queries.push({ table, calls });
    const seed = this.seeds[table] ?? (() => []);
    const target = {
      then<T1, T2>(
        onfulfilled?: ((v: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
      ) {
        return Promise.resolve({ data: seed(calls), error: null }).then(onfulfilled, onrejected);
      },
    };
    const proxy: unknown = new Proxy(target, {
      get(t, prop) {
        if (prop in t) return (t as Record<PropertyKey, unknown>)[prop];
        return (...args: unknown[]) => {
          calls.push({ op: String(prop), args });
          return proxy;
        };
      },
    });
    return proxy;
  }
  callsOf(table: string): Call[] {
    const hit = this.queries.find((query) => query.table === table);
    if (!hit) throw new Error(`no query recorded for ${table}`);
    return hit.calls;
  }
}

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => adminHolder.client }));

import { findLabsSeekingSkills } from './looking-for';

const LABS: Row[] = [
  {
    id: 'lab-real',
    slug: 'real',
    name: 'Real Space',
    short_description: null,
    stage: 'active',
    lead_user_id: 'real-lead',
  },
  {
    id: 'lab-fake',
    slug: 'fake',
    name: 'Fixture Space',
    short_description: null,
    stage: 'active',
    lead_user_id: 't1',
  },
];

/** The member's RLS client: open needs for both Spaces; labs honours `not in`. */
function memberClient(): FakeClient {
  return new FakeClient({
    lab_skill_needs: () => [
      { lab_id: 'lab-real', skill: 'react' },
      { lab_id: 'lab-fake', skill: 'react' },
    ],
    labs: (calls) => {
      const excluded = calls.find((call) => call.op === 'not' && call.args[0] === 'lead_user_id');
      const ids = excluded ? String(excluded.args[2]).replace(/[()]/g, '').split(',') : [];
      return LABS.filter((lab) => !ids.includes(String(lab.lead_user_id)));
    },
  });
}

beforeEach(() => {
  adminHolder.client = null;
});

describe('findLabsSeekingSkills — quarantined test accounts', () => {
  it('never suggests a Space led by a test account', async () => {
    adminHolder.client = new FakeClient({ users: () => [{ id: 't1' }] });
    const member = memberClient();

    const matches = await findLabsSeekingSkills(member as never, ['react']);

    expect(matches.map((match) => match.labId)).toEqual(['lab-real']);
    expect(member.callsOf('labs')).toContainEqual({
      op: 'not',
      args: ['lead_user_id', 'in', '(t1)'],
    });
  });

  it('with no test accounts, every matching Space is suggested and no filter is added', async () => {
    adminHolder.client = new FakeClient({ users: () => [] });
    const member = memberClient();

    const matches = await findLabsSeekingSkills(member as never, ['react']);

    expect(matches.map((match) => match.labId).sort()).toEqual(['lab-fake', 'lab-real']);
    expect(member.callsOf('labs').some((call) => call.op === 'not')).toBe(false);
  });

  it('a failed test-account lookup suggests nothing, and never throws (member Home stays up)', async () => {
    // The matcher always tolerated read errors (empty list). The quarantine
    // lookup keeps that contract and fails CLOSED: no suggestion rather than
    // an unchecked one — and no 500 for the page or APIs that embed it.
    adminHolder.client = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: null,
            error: { message: 'column users.is_test does not exist' },
          }),
        }),
      }),
    };
    const member = memberClient();

    await expect(findLabsSeekingSkills(member as never, ['react'])).resolves.toEqual([]);
    expect(member.queries.some((query) => query.table === 'labs')).toBe(false);
  });
});
