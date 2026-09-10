import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * POST /api/capital/gate — DISABLED under A2 containment. The endpoint must
 * refuse every caller with the truthful capital_unavailable error (never a
 * geography message), evaluate no gate, and write no compliance-log row. A
 * direct API caller — the bypass case — gets exactly the same refusal the
 * absent UI implies.
 */

const authHolder = vi.hoisted(() => ({
  ctx: null as unknown,
  error: null as Error | null,
}));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));

import { POST } from './route';

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
});

describe('POST /api/capital/gate (disabled)', () => {
  it('refuses an authenticated caller with capital_unavailable', async () => {
    authHolder.ctx = { appUser: { id: 'u1' } };

    const res = await POST();
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe('capital_unavailable');
  });

  it('refuses anonymous callers with 401', async () => {
    authHolder.error = new ApiError('session_expired', 401);

    const res = await POST();
    expect(res.status).toBe(401);
  });
});
