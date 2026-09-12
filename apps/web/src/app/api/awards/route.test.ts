import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Community Awards ballot (POST /api/awards) — the test-account quarantine.
 *
 * A quarantined seeded/test account (users.is_test, migration 20260912050000)
 * is not a real member at all: a vote for one — or for a Space one leads, or a
 * Win one wrote — is refused with the ballot's existing envelope (400
 * invalid_request), and nothing is written.
 */

const TARGET = '44444444-4444-4444-8444-444444444444';
const LAB = '55555555-5555-4555-8555-555555555555';
const WIN = '66666666-6666-4666-8666-666666666666';
const OWNER = '77777777-7777-4777-8777-777777777777';

const state = vi.hoisted(() => ({
  users: {} as Record<string, { status: string; is_test: boolean }>,
  inserts: [] as unknown[],
}));

type Result = { data: unknown; error: null };

function proxyClient(resultFor: (table: string) => Result, onInsert?: (row: unknown) => void) {
  return {
    from(table: string) {
      const result = resultFor(table);
      const chain: object = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then')
              return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
            if (prop === 'maybeSingle')
              return () =>
                Promise.resolve({
                  data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
                  error: null,
                });
            if (prop === 'insert')
              return (row: unknown) => {
                onInsert?.(row);
                return Promise.resolve({ error: null });
              };
            return () => chain;
          },
        },
      );
      return chain;
    },
  };
}

vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({
    appUser: { id: 'voter-1', status: 'active' },
    supabase: proxyClient((table) => {
      if (table === 'award_cycles')
        return {
          data: [
            {
              quarter: '2026-Q3',
              opens_at: '2026-09-01T00:00:00Z',
              closes_at: '2099-01-01T00:00:00Z',
            },
          ],
          error: null,
        };
      if (table === 'profiles') return { data: [{ user_id: TARGET }], error: null };
      if (table === 'labs') return { data: [{ id: LAB, lead_user_id: OWNER }], error: null };
      if (table === 'posts') return { data: [{ id: WIN, author_user_id: OWNER }], error: null };
      return { data: [], error: null };
    }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () =>
    proxyClient(
      (table) =>
        table === 'users'
          ? {
              data: Object.entries(state.users).map(([id, u]) => ({
                id,
                status: u.status,
                is_ai: false,
                is_test: u.is_test,
              })),
              error: null,
            }
          : { data: [], error: null },
      (row) => state.inserts.push(row),
    ),
}));

import { POST } from './route';

const vote = (body: Record<string, string>) =>
  POST(
    new Request('https://xidig.test/api/awards', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
const voteForMember = () =>
  vote({ category: 'most_helpful', targetType: 'user', targetId: TARGET });

beforeEach(() => {
  state.users = {
    [TARGET]: { status: 'active', is_test: false },
    [OWNER]: { status: 'active', is_test: false },
  };
  state.inserts.length = 0;
});

describe('award ballot — a quarantined test account is never a candidate', () => {
  it('refuses a vote for a test member with invalid_request; writes nothing', async () => {
    state.users[TARGET] = { status: 'active', is_test: true };
    const res = await voteForMember();
    const body = (await res.json()) as { error?: { code?: string } };
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe('invalid_request');
    expect(state.inserts).toEqual([]);
  });

  it('refuses Best Lab for a Space led by a test account', async () => {
    state.users[OWNER] = { status: 'active', is_test: true };
    const res = await vote({ category: 'best_lab', targetType: 'lab', targetId: LAB });
    expect(res.status).toBe(400);
    expect(state.inserts).toEqual([]);
  });

  it('refuses Best Win for a Win written by a test account', async () => {
    state.users[OWNER] = { status: 'active', is_test: true };
    const res = await vote({ category: 'best_win', targetType: 'post', targetId: WIN });
    expect(res.status).toBe(400);
    expect(state.inserts).toEqual([]);
  });

  it('a real member, a real lead and a real author are unchanged (control)', async () => {
    expect((await voteForMember()).status).toBe(201);
    expect((await vote({ category: 'best_lab', targetType: 'lab', targetId: LAB })).status).toBe(
      201,
    );
    expect((await vote({ category: 'best_win', targetType: 'post', targetId: WIN })).status).toBe(
      201,
    );
    expect(state.inserts).toHaveLength(3);
  });
});
