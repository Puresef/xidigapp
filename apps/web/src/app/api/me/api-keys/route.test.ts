import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/me/api-keys — what a caller may MINT follows their standing
 * (allowedScopesFor; owner ruling, 11 Sep): active admin → any scope incl.
 * `admin` and the operational write scopes; active member or mod → `read`
 * only (the write scopes publish under the platform's seed/AI account, so they
 * are admin-only); the deletion grace → `read` only; a demoted or grace admin
 * never mints `admin`. The refusal happens
 * before any key is generated (mintApiKey is never reached).
 */

const h = vi.hoisted(() => ({
  ctx: null as unknown,
  minted: [] as string[][],
}));

vi.mock('@/lib/auth/guards', () => ({ requireUser: async () => h.ctx }));
vi.mock('@/lib/api-keys/keys', () => ({
  listApiKeys: async () => [],
  mintApiKey: async (_admin: unknown, input: { scopes: string[] }) => {
    h.minted.push(input.scopes);
    return { view: { id: 'key-1' }, raw: 'xdg_not_a_real_key' };
  },
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => true }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function as(status: string, role: string) {
  h.ctx = { user: { id: USER_ID }, appUser: { id: USER_ID, status, role } };
}
async function mint(scopes: string[]): Promise<number> {
  const res = await POST(
    new Request('https://app.xidig.net/api/me/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'zz key', scopes }),
    }),
  );
  return res.status;
}

beforeEach(() => {
  h.minted = [];
});

describe('POST /api/me/api-keys minting follows the account standing', () => {
  it('active admin may mint the admin scope (control)', async () => {
    as('active', 'admin');
    expect(await mint(['admin'])).toBe(201);
    expect(h.minted).toEqual([['admin']]);
  });

  it('active admin may mint the operational write scopes (control)', async () => {
    as('active', 'admin');
    expect(await mint(['plaza:write', 'listings:write', 'labs:write'])).toBe(201);
  });

  it.each(['member', 'mod'])('active %s may mint read, never a write scope or admin', async (role) => {
    as('active', role);
    expect(await mint(['read'])).toBe(201);
    for (const scope of ['plaza:write', 'listings:write', 'labs:write', 'admin']) {
      expect(await mint(['read', scope]), scope).toBe(403);
    }
    expect(h.minted).toEqual([['read']]);
  });

  it('an admin in the grace cannot mint admin or any write scope', async () => {
    as('pending_deletion', 'admin');
    expect(await mint(['admin'])).toBe(403);
    expect(await mint(['plaza:write'])).toBe(403);
    expect(h.minted).toEqual([]);
  });

  it('a grace member may still mint a read-only key', async () => {
    as('pending_deletion', 'member');
    expect(await mint(['read'])).toBe(201);
    expect(await mint(['read', 'listings:write'])).toBe(403);
    expect(h.minted).toEqual([['read']]);
  });
});
