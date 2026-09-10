import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * /api/capital/fund-interest — A2 containment contract:
 *
 *   * POST (new fund invest intent) is DISABLED: truthful capital_unavailable
 *     refusal, no row created, no gate evaluated, no badge — the direct-API
 *     bypass path is closed, not just the CTA;
 *   * DELETE is KEPT: a member may withdraw their own standing intent
 *     recorded while the old funnel was live (data control, not promotion),
 *     scoped strictly to their own fund-level row.
 */

const authHolder = vi.hoisted(() => ({
  ctx: null as unknown,
  error: null as Error | null,
}));
const dbCalls = vi.hoisted(() => ({
  tables: [] as string[],
  deletes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      dbCalls.tables.push(table);
      const filters: Record<string, unknown> = {};
      const chain = {
        delete: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        is: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        then: (resolve: (v: { error: null }) => unknown) => {
          dbCalls.deletes.push(filters);
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));

import { DELETE, POST } from './route';

const USER = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
  dbCalls.tables.length = 0;
  dbCalls.deletes.length = 0;
});

describe('POST /api/capital/fund-interest (disabled)', () => {
  it('refuses with capital_unavailable and never touches the database', async () => {
    authHolder.ctx = { appUser: { id: USER } };

    const res = await POST();
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe('capital_unavailable');
    expect(dbCalls.tables).toHaveLength(0);
  });

  it('refuses anonymous callers with 401', async () => {
    authHolder.error = new ApiError('session_expired', 401);

    const res = await POST();
    expect(res.status).toBe(401);
    expect(dbCalls.tables).toHaveLength(0);
  });
});

describe('DELETE /api/capital/fund-interest (retraction kept)', () => {
  it('deletes only the caller’s own standing fund-level invest row', async () => {
    authHolder.ctx = { appUser: { id: USER } };

    const res = await DELETE(new Request('https://xidig.test/api/capital/fund-interest', { method: 'DELETE' }));
    const body = (await res.json()) as { data?: { registered?: boolean } };

    expect(res.status).toBe(200);
    expect(body.data?.registered).toBe(false);
    expect(dbCalls.tables).toEqual(['interests']);
    expect(dbCalls.deletes[0]).toEqual({ user_id: USER, candidate_id: null, type: 'invest' });
  });
});
