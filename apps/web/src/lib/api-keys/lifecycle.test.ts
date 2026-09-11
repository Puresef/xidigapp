import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

import { allowedScopesFor, effectiveScopes } from './scopes';

/**
 * API keys never bypass account lifecycle, and write scopes never simulate
 * organic activity (owner rulings, 11 Sep).
 *
 * Every external request re-reads the key OWNER's standing and narrows the
 * key's granted scopes to what that standing allows TODAY:
 *   active admin  — every scope (incl. `admin`): the write scopes are
 *     OPERATIONAL (they publish labelled content under the platform's seed/AI
 *     account — never a member's own voice) and stay admin-only, audited;
 *   active member / mod — `read` only (member write keys minted earlier stop
 *     working on use);
 *   pending_deletion (grace) — `read` only;
 *   suspended / deactivated / deleted / missing — nothing: the key does not
 *     authenticate at all.
 * The same function decides what a caller may MINT. Keys are compared by hash
 * only; no key material appears in these tests.
 */

const STANDINGS = [
  ['active', 'admin'],
  ['active', 'mod'],
  ['active', 'member'],
  ['pending_deletion', 'admin'],
  ['pending_deletion', 'member'],
  ['suspended', 'admin'],
  ['deactivated', 'member'],
  ['deleted', 'admin'],
] as const;

describe('allowedScopesFor (mint + use)', () => {
  it.each(STANDINGS)('%s %s', (status, role) => {
    const allowed = allowedScopesFor({ status, role });
    if (status === 'active' && role === 'admin') {
      expect(allowed).toEqual(['read', 'plaza:write', 'listings:write', 'labs:write', 'admin']);
    } else if (status === 'active' || status === 'pending_deletion') {
      expect(allowed).toEqual(['read']);
    } else {
      expect(allowed).toEqual([]);
    }
  });
});

describe('effectiveScopes', () => {
  it('a member or mod write key minted before the freeze is read-only on use', () => {
    const granted = ['read', 'plaza:write', 'listings:write', 'labs:write'];
    for (const role of ['member', 'mod'] as const) {
      expect(effectiveScopes(granted, { status: 'active', role })).toEqual(['read']);
    }
  });

  it('an admin key minted while active is read-only once its owner is in the grace', () => {
    const granted = ['admin', 'plaza:write', 'read'];
    expect(effectiveScopes(granted, { status: 'active', role: 'admin' })).toEqual(granted);
    expect(effectiveScopes(granted, { status: 'pending_deletion', role: 'admin' })).toEqual([
      'read',
    ]);
  });

  it('an admin key whose owner lost the admin role no longer carries admin', () => {
    expect(effectiveScopes(['admin'], { status: 'active', role: 'member' })).toEqual([]);
  });

  it('a blocked owner leaves nothing', () => {
    for (const status of ['suspended', 'deactivated', 'deleted'] as const) {
      expect(effectiveScopes(['read', 'admin'], { status, role: 'admin' })).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// requireApiKey — the one gate every external route passes through.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  verify: { status: 'ok' as string, key: null as Record<string, unknown> | null },
  owner: null as Record<string, unknown> | null,
  audits: [] as Array<Record<string, unknown>>,
  rejects: [] as string[],
}));

vi.mock('./keys', () => ({
  verifyApiKey: async () => h.verify,
  touchLastUsed: async () => {},
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'users') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: h.owner, error: null }) }),
        }),
      };
    },
  }),
}));
vi.mock('@/lib/audit', () => ({
  writeAudit: async (_admin: unknown, entry: Record<string, unknown>) => {
    h.audits.push(entry);
  },
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => true }));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: (e: { properties?: { reason?: string }; reason?: string }) => {
    const reason = (e as { properties?: { reason?: string } }).properties?.reason;
    if (reason) h.rejects.push(reason);
  },
}));

import { requireApiKey } from './guard';

const OWNER = '44444444-4444-4444-8444-444444444444';

function withKey(scopes: string[]) {
  h.verify = { status: 'ok', key: { id: 'key-1', owner_user_id: OWNER, scopes } };
}
function ownerIs(status: string | null, role = 'member') {
  h.owner = status === null ? null : { status, role };
}
const request = () =>
  new Request('https://app.xidig.net/api/external/listings', {
    headers: { authorization: 'Bearer xdg_test' },
  });

async function outcome(scope: 'read' | 'plaza:write' | 'admin'): Promise<string> {
  try {
    const ctx = await requireApiKey(request(), scope, '/api/external/listings');
    return `ok:${ctx.scopes.join(',')}`;
  } catch (error) {
    if (error instanceof ApiError) return `${error.status} ${error.code}`;
    throw error;
  }
}

beforeEach(() => {
  h.audits = [];
  h.rejects = [];
});

describe('requireApiKey owner lifecycle', () => {
  it('active member key reads (control); its write scope is refused as admin-only', async () => {
    withKey(['read', 'plaza:write']);
    ownerIs('active');
    expect(await outcome('read')).toBe('ok:read');
    expect(await outcome('plaza:write')).toBe('403 insufficient_scope');
    expect(h.audits.at(-1)).toMatchObject({
      metadata: expect.objectContaining({ reason: 'scope_admin_only' }),
    });
  });

  it('active mod key: same — mods do not publish as the platform either', async () => {
    withKey(['plaza:write']);
    ownerIs('active', 'mod');
    expect(await outcome('plaza:write')).toBe('403 insufficient_scope');
  });

  it('active admin write key works (operational exception, control)', async () => {
    withKey(['plaza:write']);
    ownerIs('active', 'admin');
    expect(await outcome('plaza:write')).toBe('ok:plaza:write');
  });

  it('active admin key keeps the admin superset (control)', async () => {
    withKey(['admin']);
    ownerIs('active', 'admin');
    expect(await outcome('plaza:write')).toBe('ok:admin');
  });

  it.each(['suspended', 'deactivated', 'deleted', null])(
    'owner %s: the key does not authenticate (401 invalid_api_key)',
    async (status) => {
      withKey(['read', 'admin']);
      ownerIs(status, 'admin');
      expect(await outcome('read')).toBe('401 invalid_api_key');
      expect(h.rejects).toContain('invalid_key');
      expect(h.audits.at(-1)).toMatchObject({
        actorUserId: OWNER,
        apiKeyId: 'key-1',
        metadata: expect.objectContaining({ reason: 'owner_not_live' }),
      });
    },
  );

  it('grace owner: read still works, every write and admin scope is refused', async () => {
    withKey(['read', 'plaza:write', 'admin']);
    ownerIs('pending_deletion', 'admin');
    expect(await outcome('read')).toBe('ok:read');
    expect(await outcome('plaza:write')).toBe('403 insufficient_scope');
    expect(await outcome('admin')).toBe('403 insufficient_scope');
    expect(h.audits.at(-1)).toMatchObject({
      metadata: expect.objectContaining({ reason: 'owner_not_active' }),
    });
  });

  it('a key that never had the scope still reads as insufficient_scope', async () => {
    withKey(['read']);
    ownerIs('active');
    expect(await outcome('plaza:write')).toBe('403 insufficient_scope');
    expect(h.audits.at(-1)).toMatchObject({
      metadata: expect.objectContaining({ reason: 'insufficient_scope' }),
    });
  });

  it('no key material reaches the audit log, analytics or the console', async () => {
    const logs = vi.spyOn(console, 'log');
    const warns = vi.spyOn(console, 'warn');
    const errors = vi.spyOn(console, 'error');
    for (const [scopes, status, role, scope] of [
      [['read', 'plaza:write'], 'active', 'member', 'plaza:write'],
      [['admin'], 'pending_deletion', 'admin', 'admin'],
      [['read'], 'deleted', 'member', 'read'],
    ] as const) {
      withKey([...scopes]);
      ownerIs(status, role);
      await outcome(scope);
    }
    const seen = JSON.stringify([
      h.audits,
      h.rejects,
      logs.mock.calls,
      warns.mock.calls,
      errors.mock.calls,
    ]);
    expect(h.audits.length).toBeGreaterThan(0);
    expect(seen).not.toContain('xdg_');
    logs.mockRestore();
    warns.mockRestore();
    errors.mockRestore();
  });

  it('revoked / expired keys are refused before any owner lookup', async () => {
    h.verify = { status: 'revoked', key: { id: 'key-1', owner_user_id: OWNER, scopes: [] } };
    ownerIs('active');
    expect(await outcome('read')).toBe('401 invalid_api_key');
    h.verify = { status: 'expired', key: { id: 'key-1', owner_user_id: OWNER, scopes: [] } };
    expect(await outcome('read')).toBe('401 api_key_expired');
  });
});
