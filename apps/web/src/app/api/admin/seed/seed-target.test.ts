import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The launch-density seed reset decides from the DATABASE target, not only
 * NODE_ENV (12 Sep 2026 production audit: a local dev server — NODE_ENV=
 * development — pointed at the Supabase project labelled "Dev Xidig App",
 * which is the live production database, passed a NODE_ENV-only guard and
 * seeded 62 fake members). This branch never carried the test-community
 * seeder; the destructive launch-seed reset is the seed write path it has.
 *
 * Pinned here for DELETE /api/admin/seed:
 *   - the production project ref is refused with NODE_ENV=development;
 *   - an undeterminable target (no URL) fails closed;
 *   - the unverified Staging project is refused (not on the allowlist);
 *   - a mismatch between the service and public URLs is refused;
 *   - NODE_ENV=production is still refused even on a loopback target;
 *   - the refusal happens before any Supabase client is built;
 *   - a loopback stack still resets.
 * POST (the labelled launch-density seed) is unchanged.
 */

const PROD = 'https://tbdryvhxxiqadseuxclm.supabase.co';
const LOCAL = 'http://127.0.0.1:54321';

const h = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  adminBuilt: 0,
  launchResetCalls: 0,
}));

vi.mock('@/env', () => ({
  get env() {
    return h.env;
  },
}));
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en'), getLocale: async () => 'en' };
});
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));
vi.mock('@/lib/auth/guards', () => ({
  requireRole: async () => ({ appUser: { id: 'admin-1', role: 'admin', status: 'active' } }),
}));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => {
    h.adminBuilt += 1;
    return {};
  },
}));
vi.mock('@/lib/seed/run', () => ({
  runSeed: async () => ({}),
  resetSeed: async () => {
    h.launchResetCalls += 1;
    return {};
  },
}));

import { DELETE } from './route';

const bearer = () =>
  new Request('http://localhost/api/admin/seed', {
    method: 'DELETE',
    headers: { authorization: 'Bearer cron-secret' },
  });

async function refusalReason(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { seedTarget?: { reason: string } }).seedTarget?.reason;
}

beforeEach(() => {
  h.env = { NODE_ENV: 'development', CRON_SECRET: 'cron-secret' };
  h.adminBuilt = 0;
  h.launchResetCalls = 0;
});

describe('launch-density seed reset target guard', () => {
  it('DELETE refuses the production project with NODE_ENV=development, before any client', async () => {
    h.env = { ...h.env, SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_URL: PROD };
    const res = await DELETE(bearer());
    expect(res.status).toBe(403);
    expect(await refusalReason(res)).toBe('target_production');
    expect(h.launchResetCalls).toBe(0);
    expect(h.adminBuilt).toBe(0);
  });

  it('DELETE refuses when only the public URL points at production', async () => {
    h.env = { ...h.env, SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: PROD };
    const res = await DELETE(bearer());
    expect(res.status).toBe(403);
    expect(h.launchResetCalls).toBe(0);
  });

  it('DELETE fails closed when the target is unknown', async () => {
    const res = await DELETE(bearer());
    expect(res.status).toBe(403);
    expect(await refusalReason(res)).toBe('target_unknown');
    expect(h.adminBuilt).toBe(0);
  });

  it('DELETE refuses the unverified Staging project (not on the allowlist)', async () => {
    const staging = 'https://sbeotgaaxwbhnchyuvdp.supabase.co';
    h.env = { ...h.env, SUPABASE_URL: staging, NEXT_PUBLIC_SUPABASE_URL: staging };
    const res = await DELETE(bearer());
    expect(res.status).toBe(403);
    expect(await refusalReason(res)).toBe('target_not_allowlisted');
  });

  it('NODE_ENV=production is still refused even on a loopback target', async () => {
    h.env = {
      ...h.env,
      NODE_ENV: 'production',
      SUPABASE_URL: LOCAL,
      NEXT_PUBLIC_SUPABASE_URL: LOCAL,
    };
    expect((await DELETE(bearer())).status).toBe(403);
    expect(h.launchResetCalls).toBe(0);
  });

  it('DELETE on a loopback stack still resets', async () => {
    h.env = { ...h.env, SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: LOCAL };
    expect((await DELETE(bearer())).status).toBe(200);
    expect(h.launchResetCalls).toBe(1);
  });
});
