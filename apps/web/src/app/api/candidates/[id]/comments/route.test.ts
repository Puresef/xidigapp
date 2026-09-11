import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMENT_LIMIT_FREE, COMMENT_LIMIT_SUPPORTER } from '@/lib/plaza/constants';

/**
 * POST /api/candidates/[id]/comments — the comment QUOTA is the ordinary
 * elevated_limits entitlement (20260911000600), shared with Plaza comments, so
 * it continues through the §19 deletion grace. The quota is not a governance
 * power: who may comment at all is decided by candidate visibility
 * (loadCandidateForViewer / can_read_candidate), unchanged here. The
 * governance vote stays on the active-only capability check (vote route).
 */

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const membershipMock = vi.hoisted(() => ({
  hasEntitlement: vi.fn(async () => false),
  hasCapability: vi.fn(async () => false),
}));
const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => false),
}));
const CAND_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/membership', () => membershipMock);
vi.mock('@/lib/rate-limit', () => rateLimitMock);
vi.mock('@/lib/capital/candidates-api', () => ({
  parseCandidateId: (raw: string) => raw,
  loadCandidateForViewer: async () => ({ id: CAND_ID, status: 'submitted' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({}),
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: () => {},
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function comment() {
  return POST(
    new Request(`https://app.xidig.net/api/candidates/${CAND_ID}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'su’aal' }),
    }),
    { params: Promise.resolve({ id: CAND_ID }) },
  );
}

beforeEach(() => {
  membershipMock.hasEntitlement.mockClear();
  membershipMock.hasCapability.mockClear();
  rateLimitMock.checkRateLimit.mockClear();
});

describe('POST /api/candidates/[id]/comments quota tier', () => {
  it('free member: FREE cap, via the entitlement check', async () => {
    authHolder.ctx = { user: { id: USER_ID }, appUser: { id: USER_ID, status: 'active' } };
    membershipMock.hasEntitlement.mockResolvedValueOnce(false);

    expect((await comment()).status).toBe(429);
    expect(membershipMock.hasEntitlement).toHaveBeenCalledWith(
      expect.anything(),
      'elevated_limits',
    );
    expect(membershipMock.hasCapability).not.toHaveBeenCalled();
    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      `comments:${USER_ID}`,
      expect.objectContaining({ max: COMMENT_LIMIT_FREE }),
    );
  });

  it('a Supporter in the deletion grace keeps the Supporter comment quota', async () => {
    authHolder.ctx = {
      user: { id: USER_ID },
      appUser: { id: USER_ID, status: 'pending_deletion' },
    };
    membershipMock.hasEntitlement.mockResolvedValueOnce(true);

    expect((await comment()).status).toBe(429);
    expect(membershipMock.hasCapability).not.toHaveBeenCalled();
    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      `comments:${USER_ID}`,
      expect.objectContaining({ max: COMMENT_LIMIT_SUPPORTER }),
    );
  });
});
