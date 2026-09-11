import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMENT_LIMIT_FREE, COMMENT_LIMIT_SUPPORTER } from '@/lib/plaza/constants';

/**
 * POST /api/posts/[id]/comments — the daily comment quota rides the
 * elevated_limits ENTITLEMENT (20260911000600), which continues through the
 * §19 deletion grace; the active-only capability check is never consulted.
 * The 429 short-circuits before any write, so the only fake is the post
 * visibility read.
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
const POST_ID = '22222222-2222-4222-8222-222222222222';

function ctxWithStatus(status: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({
      data: { id: POST_ID, author_user_id: USER_ID, status: 'published' },
      error: null,
    }),
  };
  return {
    user: { id: USER_ID },
    appUser: { id: USER_ID, role: 'member', status },
    supabase: { from: () => chain },
  };
}

function comment() {
  return POST(
    new Request(`https://app.xidig.net/api/posts/${POST_ID}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'mahadsanid' }),
    }),
    { params: Promise.resolve({ id: POST_ID }) },
  );
}

beforeEach(() => {
  membershipMock.hasEntitlement.mockClear();
  membershipMock.hasCapability.mockClear();
  rateLimitMock.checkRateLimit.mockClear();
});

describe('POST /api/posts/[id]/comments quota tier', () => {
  it('free member: elevated_limits entitlement checked, FREE cap applied', async () => {
    authHolder.ctx = ctxWithStatus('active');
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
    authHolder.ctx = ctxWithStatus('pending_deletion');
    membershipMock.hasEntitlement.mockResolvedValueOnce(true);

    expect((await comment()).status).toBe(429);
    expect(membershipMock.hasCapability).not.toHaveBeenCalled();
    expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
      `comments:${USER_ID}`,
      expect.objectContaining({ max: COMMENT_LIMIT_SUPPORTER }),
    );
  });
});
