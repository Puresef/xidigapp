import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST_LIMIT_FREE } from '@/lib/plaza/constants';

/**
 * POST /api/posts — the §26 quota tier rides the elevated_limits capability
 * (drift-fix, Sep 2026), never a tier slug. This pins BOTH halves: the exact
 * capability name the route checks, and that a caller without it gets the
 * free quota. The 429 short-circuits before any write machinery, so the test
 * needs no content fakes.
 */

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const membershipMock = vi.hoisted(() => ({
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

beforeEach(() => {
  authHolder.ctx = { user: { id: USER_ID }, appUser: { id: USER_ID, role: 'member' } };
  membershipMock.hasCapability.mockClear();
  rateLimitMock.checkRateLimit.mockClear();
});

describe('POST /api/posts quota tier', () => {
  it('checks the elevated_limits capability and applies the FREE cap without it', async () => {
    membershipMock.hasCapability.mockResolvedValueOnce(false);
    rateLimitMock.checkRateLimit.mockResolvedValueOnce(false);

    const response = await POST(
      new Request('https://app.xidig.net/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'update', body: 'salaan wanaagsan' }),
      }),
    );

    expect(response.status).toBe(429);
    // The capability NAME is the contract (a swap to another gate the
    // supporter tier holds today would only surface under a third tier).
    expect(membershipMock.hasCapability).toHaveBeenCalledWith(expect.anything(), 'elevated_limits');
    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      `posts:${USER_ID}`,
      expect.objectContaining({ max: POST_LIMIT_FREE }),
    );
  });
});
