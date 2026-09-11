import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Community Awards ballot (POST /api/awards) — retained content. A deleted
 * account keeps a tombstone profile row, so "the profile exists" no longer
 * means "a current member". A vote for a deleted member is refused (400
 * invalid_request, the ballot's existing envelope) and nothing is written;
 * live members — including one in the deletion grace — are unchanged.
 */

const TARGET = '44444444-4444-4444-8444-444444444444';

const state = vi.hoisted(() => ({
  targetStatus: 'active' as string,
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
      return { data: [], error: null };
    }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () =>
    proxyClient(
      (table) =>
        table === 'users'
          ? { data: [{ id: TARGET, status: state.targetStatus, is_ai: false }], error: null }
          : { data: [], error: null },
      (row) => state.inserts.push(row),
    ),
}));

import { POST } from './route';

const vote = () =>
  POST(
    new Request('https://xidig.test/api/awards', {
      method: 'POST',
      body: JSON.stringify({ category: 'most_helpful', targetType: 'user', targetId: TARGET }),
    }),
  );

beforeEach(() => {
  state.targetStatus = 'active';
  state.inserts.length = 0;
});

describe('award ballot — a deleted member is not a current candidate', () => {
  it('refuses a vote for a deleted member and writes no ballot', async () => {
    state.targetStatus = 'deleted';
    const res = await vote();
    expect(res.status).toBe(400);
    expect(state.inserts).toEqual([]);
  });

  it.each(['active', 'pending_deletion'])('accepts a vote for a %s member', async (status) => {
    state.targetStatus = status;
    const res = await vote();
    expect(res.status).toBe(201);
    expect(state.inserts).toHaveLength(1);
  });
});
