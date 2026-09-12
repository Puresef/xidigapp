import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * /api/candidates/[id]/interests — A2 containment contract:
 *
 *   * type='invest' POST is DISABLED: truthful capital_unavailable refusal
 *     BEFORE any candidate lookup (reveals nothing about the candidate), no
 *     gate evaluation, no row — the direct-API bypass is closed;
 *   * help and cosign remain never-gated, and NEITHER awards a badge any
 *     more — the Early Backer award (previously granted on cosign/invest) is
 *     stopped; historical badges stay, new ones do not accrue;
 *   * DELETE ?type=invest is KEPT so a member can retract an invest intent
 *     recorded while the old funnel was live.
 */

const authHolder = vi.hoisted(() => ({
  ctx: null as unknown,
  error: null as Error | null,
}));
const candidateHolder = vi.hoisted(() => ({ loads: 0 }));
const dbCalls = vi.hoisted(() => ({
  upserts: [] as Array<Record<string, unknown>>,
  deletes: [] as Array<Record<string, unknown>>,
  rpc: [] as string[],
}));
const badgeCalls = vi.hoisted(() => ({ awards: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));
vi.mock('@/lib/capital/candidates-api', () => ({
  parseCandidateId: (id: string) => id,
  loadCandidateForViewer: async () => {
    candidateHolder.loads += 1;
    return { id: 'cand-1' };
  },
}));
vi.mock('@/lib/reputation/service', () => ({
  awardBadge: async (_admin: unknown, input: Record<string, unknown>) => {
    badgeCalls.awards.push(input);
  },
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: () => {},
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    rpc: async (name: string) => {
      dbCalls.rpc.push(name);
      // A non-zero legacy invest tally, as Dev really holds: the projection
      // must drop it, not merely happen to see a zero.
      return { data: [{ help: 1, cosign: 2, invest: 7 }], error: null };
    },
    from: (table: string) => {
      if (table !== 'interests') throw new Error(`unexpected table ${table}`);
      const filters: Record<string, unknown> = {};
      const chain = {
        upsert: async (row: Record<string, unknown>) => {
          dbCalls.upserts.push(row);
          return { error: null };
        },
        delete: () => chain,
        eq: (col: string, val: unknown) => {
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
const CAND = '22222222-2222-4222-8222-222222222222';

function ctxOf(): unknown {
  return { appUser: { id: USER } };
}

function postReq(body: Record<string, unknown>) {
  return new Request(`https://xidig.test/api/candidates/${CAND}/interests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeCtx() {
  return { params: Promise.resolve({ id: CAND }) };
}

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
  candidateHolder.loads = 0;
  dbCalls.upserts.length = 0;
  dbCalls.deletes.length = 0;
  dbCalls.rpc.length = 0;
  badgeCalls.awards.length = 0;
});

describe('POST invest (disabled)', () => {
  it('refuses with capital_unavailable before any candidate lookup; writes nothing', async () => {
    authHolder.ctx = ctxOf();

    const res = await POST(postReq({ type: 'invest', attested: true }), routeCtx());
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe('capital_unavailable');
    expect(candidateHolder.loads).toBe(0);
    expect(dbCalls.upserts).toHaveLength(0);
    expect(badgeCalls.awards).toHaveLength(0);
  });

  it('refuses anonymous callers with 401', async () => {
    authHolder.error = new ApiError('session_expired', 401);

    const res = await POST(postReq({ type: 'invest' }), routeCtx());
    expect(res.status).toBe(401);
  });
});

describe('help / cosign stay never-gated, badge-free', () => {
  it('cosign records the interest and awards NO badge', async () => {
    authHolder.ctx = ctxOf();

    const res = await POST(postReq({ type: 'cosign' }), routeCtx());
    const body = (await res.json()) as { data?: { counts?: { cosign?: number } } };

    expect(res.status).toBe(200);
    expect(body.data?.counts?.cosign).toBe(2);
    expect(candidateHolder.loads).toBe(1);
    expect(dbCalls.upserts[0]).toMatchObject({ candidate_id: CAND, user_id: USER, type: 'cosign' });
    expect(badgeCalls.awards).toHaveLength(0);
  });

  it('returns only help + support counts — never the legacy invest tally', async () => {
    authHolder.ctx = ctxOf();

    const res = await POST(postReq({ type: 'cosign' }), routeCtx());
    const text = await res.text();
    const body = JSON.parse(text) as { data: { counts: Record<string, number> } };

    expect(body.data.counts).toEqual({ help: 1, cosign: 2 });
    expect(text).not.toMatch(/invest/i);
  });

  it('help records the interest and awards NO badge', async () => {
    authHolder.ctx = ctxOf();

    const res = await POST(postReq({ type: 'help' }), routeCtx());

    expect(res.status).toBe(200);
    expect(dbCalls.upserts[0]).toMatchObject({ type: 'help' });
    expect(badgeCalls.awards).toHaveLength(0);
  });
});

describe('DELETE retraction kept (invest included)', () => {
  it('lets the caller retract their own invest intent', async () => {
    authHolder.ctx = ctxOf();

    const res = await DELETE(
      new Request(`https://xidig.test/api/candidates/${CAND}/interests?type=invest`, {
        method: 'DELETE',
      }),
      routeCtx(),
    );

    expect(res.status).toBe(200);
    expect(dbCalls.deletes[0]).toEqual({ candidate_id: CAND, user_id: USER, type: 'invest' });
    // The retraction still works; its response still carries no invest count.
    const body = (await res.json()) as { data: { counts: Record<string, number> } };
    expect(Object.keys(body.data.counts).sort()).toEqual(['cosign', 'help']);
  });
});
