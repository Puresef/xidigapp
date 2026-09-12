import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Xidig Plus doctrine, P1 "pause, don't broaden" (owner rulings, 12 Sep).
 *
 * Xidig Plus must not gate candidate votes, candidate submission, Lab creation
 * or Venture/capital escalation, and no non-paid eligibility model is approved.
 * So every one of those paths is PAUSED for everyone:
 *
 *   POST /api/candidates                 → 403 put_forward_under_review
 *   POST /api/candidates/[id]/submit     → 403 put_forward_under_review
 *   POST /api/candidates/[id]/vote       → 403 vote_eligibility_under_review
 *   POST /api/labs/[id]/promote (lab)    → 403 lab_eligibility_under_review
 *   POST /api/labs/[id]/promote (cand.)  → 403 put_forward_under_review
 *   POST /api/labs/[id]/promote (vent.)  → 403 venture_promotion_under_review
 *
 * Pinned for each: the neutral code; NO cta (never an upgrade prompt); the tier
 * is never consulted (hasCapability is not called); nothing is written. The one
 * path kept open is DELETE on the vote (withdraw your OWN ballot, data control),
 * and it returns no tally.
 */

const h = vi.hoisted(() => ({
  status: 'active' as string,
  role: 'member' as string,
  loads: 0,
  managerChecks: 0,
  writes: [] as string[],
  filters: [] as string[],
  capabilityCalls: 0,
  cand: {
    id: 'cand-1',
    status: 'submitted',
    vote_opens_at: null as string | null,
    vote_closes_at: null as string | null,
  },
}));

function ctx() {
  return {
    appUser: { id: 'user-1', role: h.role, status: h.status },
    supabase: {},
  };
}

// Resolve copy with the real English dictionary so the envelope is realistic.
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en'), getLocale: async () => 'en' };
});
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ctx(),
  requireActiveUser: async () => {
    const { ApiError } = await import('@/lib/api');
    if (h.status !== 'active') throw new ApiError('forbidden', 403);
    return ctx();
  },
}));
vi.mock('@/lib/membership', () => ({
  hasCapability: async () => {
    h.capabilityCalls += 1;
    return true; // even a tier that WOULD have held the power is refused
  },
  hasEntitlement: async () => true,
}));
vi.mock('@/lib/capital/candidates-api', () => ({
  parseCandidateId: (id: string) => id,
  loadCandidateForViewer: async () => {
    h.loads += 1;
    return h.cand;
  },
  requireCandidateManager: async () => {
    h.managerChecks += 1;
  },
}));
vi.mock('@/lib/labs-api', () => ({
  parseLabId: (id: string) => id,
  loadLabForViewer: async () => {
    h.loads += 1;
    return { id: 'lab-1', lead_user_id: 'user-1', space_mode: 'lab' };
  },
  requireLabManager: () => {
    h.managerChecks += 1;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const chain = {
        insert: () => {
          h.writes.push(`insert:${table}`);
          return chain;
        },
        update: () => {
          h.writes.push(`update:${table}`);
          return chain;
        },
        upsert: () => {
          h.writes.push(`upsert:${table}`);
          return Promise.resolve({ error: null });
        },
        delete: () => {
          h.writes.push(`delete:${table}`);
          return chain;
        },
        eq: (col: string, val: unknown) => {
          h.filters.push(`${col}=${String(val)}`);
          return chain;
        },
        select: () => chain,
        single: async () => ({ data: null, error: null }),
        then: (resolve: (v: { error: null }) => unknown) =>
          Promise.resolve({ error: null }).then(resolve),
      };
      return chain;
    },
    rpc: async (name: string) => {
      h.writes.push(`rpc:${name}`);
      return { data: null, error: null };
    },
  }),
}));

const candidates = await import('./route');
const submit = await import('./[id]/submit/route');
const vote = await import('./[id]/vote/route');
const promote = await import('../labs/[id]/promote/route');

type Body = { data?: Record<string, unknown>; error?: { code?: string; cta?: unknown } };

async function call(res: Promise<Response>) {
  const r = await res;
  const body = (await r.json()) as Body;
  return { status: r.status, body };
}

const json = (body: unknown) =>
  new Request('https://app.xidig.net/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const candParams = { params: Promise.resolve({ id: 'cand-1' }) };
const labParams = { params: Promise.resolve({ id: 'lab-1' }) };

beforeEach(() => {
  h.status = 'active';
  h.role = 'member';
  h.loads = 0;
  h.managerChecks = 0;
  h.writes = [];
  h.filters = [];
  h.capabilityCalls = 0;
  h.cand = { id: 'cand-1', status: 'submitted', vote_opens_at: null, vote_closes_at: null };
});

function expectPaused(r: { status: number; body: Body }, code: string) {
  expect(r.status).toBe(403);
  expect(r.body.error?.code).toBe(code);
  expect(r.body.error?.cta ?? null).toBeNull();
  expect(h.capabilityCalls).toBe(0);
  expect(h.writes).toEqual([]);
}

describe('paused paths refuse everyone, neutrally, with no write and no tier lookup', () => {
  it.each(['member', 'admin'])('POST /api/candidates (retired entrance) — %s', async (role) => {
    h.role = role;
    const r = await call(candidates.POST());
    expectPaused(r, 'put_forward_under_review');
    expect(h.loads).toBe(0); // refused before reading anything
  });

  it.each(['member', 'admin'])('POST /api/candidates/[id]/submit — %s', async (role) => {
    h.role = role;
    h.cand.status = 'draft';
    const r = await call(submit.POST(json({}), candParams as never));
    expectPaused(r, 'put_forward_under_review');
    expect(h.managerChecks).toBe(1); // only someone who could have submitted is told
  });

  it.each(['member', 'admin'])('POST /api/candidates/[id]/vote — %s', async (role) => {
    h.role = role;
    const r = await call(vote.POST());
    expectPaused(r, 'vote_eligibility_under_review');
    expect(h.loads).toBe(0); // before any candidate lookup
  });

  it.each([
    ['lab', 'lab_eligibility_under_review'],
    ['candidate', 'put_forward_under_review'],
    ['venture', 'venture_promotion_under_review'],
  ])('POST /api/labs/[id]/promote target=%s', async (target, code) => {
    h.role = 'admin';
    const r = await call(promote.POST(json({ target, name: 'x' }), labParams as never));
    expectPaused(r, code);
  });
});

describe('withdrawing your own ballot stays open (data control) and returns no tally', () => {
  // The A2 retraction precedent: no window or status gate. Every stored ballot
  // was cast under the old paid gate, and no new window can open while
  // submission is paused, so withdrawal must never depend on one.
  it.each([
    ['an open window', 60_000],
    ['a long-closed window', -30 * 86_400_000],
    ['no window at all', null],
  ])('with %s: deletes only the caller’s own ballot, no tally', async (_label, offset) => {
    if (offset !== null) {
      const at = Date.now() + (offset as number);
      h.cand.vote_opens_at = new Date(at - 120_000).toISOString();
      h.cand.vote_closes_at = new Date(at).toISOString();
    }
    const r = await call(vote.DELETE(json({}), candParams as never));
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ myVote: null });
    expect(h.writes).toEqual(['delete:candidate_votes']);
    // The service role bypasses RLS: these two filters are the only thing
    // limiting the delete to the caller's own row.
    expect(h.filters).toEqual(['candidate_id=cand-1', 'voter_user_id=user-1']);
    expect(h.loads).toBe(1); // the candidate must still be readable (RLS → 404)
    expect(h.capabilityCalls).toBe(0);
  });
});
