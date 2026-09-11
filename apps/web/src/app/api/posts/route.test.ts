import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST_LIMIT_FREE, POST_LIMIT_SUPPORTER } from '@/lib/plaza/constants';

/**
 * POST /api/posts — the §26 quota tier rides the elevated_limits ENTITLEMENT
 * (drift-fix, Sep 2026; entitlement split 20260911000600), never a tier slug
 * and never the active-only capability check. This pins the exact check the
 * route makes, that a caller without it gets the free quota, and that a
 * Supporter in the §19 deletion grace keeps the Supporter quota (the grace is
 * ordinary membership; has_entitlement admits it — see
 * packages/db/src/grace-entitlements.test.ts for the database half). The 429
 * short-circuits before any write machinery, so the test needs no content
 * fakes.
 */

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const membershipMock = vi.hoisted(() => ({
  hasEntitlement: vi.fn(async () => false),
  hasCapability: vi.fn(async () => false),
}));
const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => false),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/membership', () => membershipMock);
vi.mock('@/lib/rate-limit', () => rateLimitMock);
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

function post() {
  return POST(
    new Request('https://app.xidig.net/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'update', body: 'salaan wanaagsan' }),
    }),
  );
}

beforeEach(() => {
  authHolder.ctx = {
    user: { id: USER_ID },
    appUser: { id: USER_ID, role: 'member', status: 'active' },
  };
  membershipMock.hasEntitlement.mockClear();
  membershipMock.hasCapability.mockClear();
  rateLimitMock.checkRateLimit.mockClear();
});

describe('POST /api/posts quota tier', () => {
  it('checks the elevated_limits entitlement and applies the FREE cap without it', async () => {
    membershipMock.hasEntitlement.mockResolvedValueOnce(false);
    rateLimitMock.checkRateLimit.mockResolvedValueOnce(false);

    const response = await post();

    expect(response.status).toBe(429);
    // The entitlement NAME is the contract (a swap to another gate the
    // supporter tier holds today would only surface under a third tier).
    expect(membershipMock.hasEntitlement).toHaveBeenCalledWith(
      expect.anything(),
      'elevated_limits',
    );
    expect(membershipMock.hasCapability).not.toHaveBeenCalled();
    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      `posts:${USER_ID}`,
      expect.objectContaining({ max: POST_LIMIT_FREE }),
    );
  });

  it('a Supporter in the deletion grace keeps the Supporter quota', async () => {
    authHolder.ctx = {
      user: { id: USER_ID },
      appUser: { id: USER_ID, role: 'member', status: 'pending_deletion' },
    };
    membershipMock.hasEntitlement.mockResolvedValueOnce(true);
    rateLimitMock.checkRateLimit.mockResolvedValueOnce(false);

    expect((await post()).status).toBe(429);
    expect(membershipMock.hasCapability).not.toHaveBeenCalled();
    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      `posts:${USER_ID}`,
      expect.objectContaining({ max: POST_LIMIT_SUPPORTER }),
    );
  });
});
