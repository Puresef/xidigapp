import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Seed routes decide from the DATABASE target, not NODE_ENV (12 Sep 2026
 * production audit: a local dev server — NODE_ENV=development — pointed at
 * the Supabase project labelled "Dev Xidig App", which is the live production
 * database, passed the old NODE_ENV-only guard and seeded 62 fake members).
 *
 * Pinned here, for the test-community seeder (run AND reset) and the
 * launch-density reset:
 *   - the production project ref is refused with NODE_ENV=development;
 *   - an undeterminable target (no URL) fails closed;
 *   - the refusal happens BEFORE auth and before any Supabase client is built;
 *   - a loopback stack is allowed and the lib is handed the target URLs.
 */

const PROD = 'https://tbdryvhxxiqadseuxclm.supabase.co';
const LOCAL = 'http://127.0.0.1:54321';

const h = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  authCalls: 0,
  adminBuilt: 0,
  runCalls: [] as unknown[],
  resetCalls: [] as unknown[],
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
  requireRole: async () => {
    h.authCalls += 1;
    return { appUser: { id: 'admin-1', role: 'admin', status: 'active' } };
  },
}));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => {
    h.adminBuilt += 1;
    return {};
  },
}));
vi.mock('@/lib/seed/test-community/run', () => ({
  runTestCommunity: async (_admin: unknown, target: unknown) => {
    h.runCalls.push(target);
    return { usersCreated: 0, usersExisting: 0, contentSeeded: false, counts: {} };
  },
  resetTestCommunity: async (_admin: unknown, target: unknown) => {
    h.resetCalls.push(target);
    return { usersDeleted: 0, usersAnonymised: 0, errors: [] };
  },
}));
vi.mock('@/lib/seed/run', () => ({
  runSeed: async () => ({}),
  resetSeed: async () => {
    h.launchResetCalls += 1;
    return {};
  },
}));

const bearer = () =>
  new Request('http://localhost/api/admin/seed/test-community', {
    headers: { authorization: 'Bearer cron-secret' },
  });

beforeEach(() => {
  h.env = { NODE_ENV: 'development', CRON_SECRET: 'cron-secret' };
  h.authCalls = 0;
  h.adminBuilt = 0;
  h.runCalls = [];
  h.resetCalls = [];
  h.launchResetCalls = 0;
});

async function testCommunity() {
  return import('./test-community/route');
}
async function launchSeed() {
  return import('./route');
}

describe('test-community seeder target guard', () => {
  it.each(['POST', 'DELETE'] as const)(
    '%s refuses the production project with NODE_ENV=development, before auth or any client',
    async (verb) => {
      h.env = { ...h.env, SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_URL: PROD };
      const route = await testCommunity();
      const res = await route[verb](bearer());
      expect(res.status).toBe(403);
      const body = (await res.json()) as { seedTarget?: { reason: string } };
      expect(body.seedTarget?.reason).toBe('target_production');
      expect(h.authCalls).toBe(0);
      expect(h.adminBuilt).toBe(0);
      expect(h.runCalls).toEqual([]);
      expect(h.resetCalls).toEqual([]);
    },
  );

  it('refuses when only the public URL points at production', async () => {
    h.env = { ...h.env, SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: PROD };
    const res = await (await testCommunity()).POST(bearer());
    expect(res.status).toBe(403);
    expect(h.runCalls).toEqual([]);
  });

  it.each(['POST', 'DELETE'] as const)('%s fails closed when the target is unknown', async (verb) => {
    const route = await testCommunity();
    const res = await route[verb](bearer());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { seedTarget?: { reason: string } };
    expect(body.seedTarget?.reason).toBe('target_unknown');
    expect(h.adminBuilt).toBe(0);
  });

  it('refuses the unverified Staging project (not on the allowlist)', async () => {
    const staging = 'https://sbeotgaaxwbhnchyuvdp.supabase.co';
    h.env = { ...h.env, SUPABASE_URL: staging, NEXT_PUBLIC_SUPABASE_URL: staging };
    const res = await (await testCommunity()).POST(bearer());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { seedTarget?: { reason: string } }).seedTarget?.reason).toBe(
      'target_not_allowlisted',
    );
  });

  it('a loopback stack is allowed and the lib receives the target URLs', async () => {
    h.env = { ...h.env, SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: LOCAL };
    const route = await testCommunity();
    expect((await route.POST(bearer())).status).toBe(200);
    expect((await route.DELETE(bearer())).status).toBe(200);
    expect(h.runCalls).toEqual([{ targetUrls: [LOCAL, LOCAL] }]);
    expect(h.resetCalls).toEqual([{ targetUrls: [LOCAL, LOCAL] }]);
  });

  it('NODE_ENV=production is still refused even on a loopback target', async () => {
    h.env = { ...h.env, NODE_ENV: 'production', SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: LOCAL };
    expect((await (await testCommunity()).POST(bearer())).status).toBe(403);
    expect(h.runCalls).toEqual([]);
  });
});

describe('launch-density seed reset target guard', () => {
  it('DELETE refuses the production project with NODE_ENV=development', async () => {
    h.env = { ...h.env, SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_URL: PROD };
    const res = await (await launchSeed()).DELETE(bearer());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { seedTarget?: { reason: string } }).seedTarget?.reason).toBe(
      'target_production',
    );
    expect(h.launchResetCalls).toBe(0);
    expect(h.adminBuilt).toBe(0);
  });

  it('DELETE on a loopback stack still resets', async () => {
    h.env = { ...h.env, SUPABASE_URL: LOCAL, NEXT_PUBLIC_SUPABASE_URL: LOCAL };
    expect((await (await launchSeed()).DELETE(bearer())).status).toBe(200);
    expect(h.launchResetCalls).toBe(1);
  });
});
