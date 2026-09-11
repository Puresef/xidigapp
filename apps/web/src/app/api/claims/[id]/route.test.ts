import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Listing-claim decision (PATCH /api/claims/[id]) — retained content.
 * A deleted member's pending claim outlives the account; approving it would
 * hand the listing to a tombstone, which reads as an owned (possibly
 * verified) business with nobody behind it. Approval is refused with
 * 409 account_deleted BEFORE any write; rejection stays open so the queue can
 * be cleared. Live claimants are unchanged.
 */

const CLAIM = '11111111-1111-4111-8111-111111111111';
const LISTING = '22222222-2222-4222-8222-222222222222';
const CLAIMANT = '33333333-3333-4333-8333-333333333333';

const state = vi.hoisted(() => ({
  claimantStatus: 'active' as string | null,
  writes: [] as Array<{ table: string; patch: unknown }>,
  audits: [] as unknown[],
}));

vi.mock('@/lib/auth/guards', () => ({
  requireRole: async () => ({ appUser: { id: 'mod-1', role: 'mod', status: 'active' } }),
}));
vi.mock('@/lib/audit', () => ({
  writeAudit: async (_admin: unknown, entry: unknown) => {
    state.audits.push(entry);
  },
}));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let patch: unknown = null;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.update = (value: unknown) => {
        patch = value;
        return chain;
      };
      chain.maybeSingle = () => {
        if (table === 'listing_claims') {
          return Promise.resolve({
            data: { id: CLAIM, listing_id: LISTING, claimant_user_id: CLAIMANT, status: 'pending' },
            error: null,
          });
        }
        if (table === 'users') {
          return Promise.resolve({
            data: state.claimantStatus === null ? null : { status: state.claimantStatus },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      };
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (patch !== null) state.writes.push({ table, patch });
        return Promise.resolve({ error: null }).then(resolve);
      };
      return chain;
    },
  }),
}));

import { PATCH } from './route';

function decide(status: 'approved' | 'rejected') {
  return PATCH(
    new Request(`https://xidig.test/api/claims/${CLAIM}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id: CLAIM }) },
  );
}

beforeEach(() => {
  state.claimantStatus = 'active';
  state.writes.length = 0;
  state.audits.length = 0;
});

describe('claim approval — a deleted claimant', () => {
  it('refuses to approve (409 account_deleted) and writes nothing', async () => {
    state.claimantStatus = 'deleted';
    const res = await decide('approved');
    const body = (await res.json()) as { error?: { code?: string } };
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe('account_deleted');
    expect(state.writes).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it('still lets a moderator REJECT it, so the queue can be cleared', async () => {
    state.claimantStatus = 'deleted';
    const res = await decide('rejected');
    expect(res.status).toBe(200);
    expect(state.writes).toEqual([
      { table: 'listing_claims', patch: expect.objectContaining({ status: 'rejected' }) },
    ]);
    // No ownership transfer on a rejection.
    expect(state.writes.some((write) => write.table === 'business_listings')).toBe(false);
  });
});

describe('claim approval — live claimants are unchanged', () => {
  it.each(['active', 'pending_deletion', 'suspended'])(
    'approves a %s claimant and transfers ownership',
    async (status) => {
      state.claimantStatus = status;
      const res = await decide('approved');
      expect(res.status).toBe(200);
      expect(state.writes).toContainEqual({
        table: 'business_listings',
        patch: { owner_user_id: CLAIMANT },
      });
    },
  );
});
