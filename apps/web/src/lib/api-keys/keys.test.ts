import { describe, expect, it } from 'vitest';

import { generateApiKey, hashApiKey, toApiKeyView, verifyApiKey, type ApiKeyRow } from './keys';
import {
  ALL_SCOPES,
  MEMBER_MINTABLE_SCOPES,
  isApiScope,
  scopeSatisfies,
} from './scopes';

/**
 * API-key security contract (PRD §21). Locks: hashed-only storage, key shape,
 * verification status classification (invalid / revoked / expired / ok), the
 * safe projection (never leaks key_hash), and the scope rules (admin superset,
 * members can't mint admin).
 */

/** Minimal fake service client: returns a canned api_keys row for the lookup. */
function fakeAdmin(row: ApiKeyRow | null) {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return chain as unknown as Parameters<typeof verifyApiKey>[0];
}

function baseRow(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: 'key-1',
    owner_user_id: 'user-1',
    name: 'test',
    key_hash: 'ignored',
    key_prefix: 'xdg_test_abc',
    scopes: ['read'],
    rate_limit_per_minute: null,
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: '2026-07-09T00:00:00Z',
    ...overrides,
  };
}

describe('key generation + hashing', () => {
  it('generates a prefixed high-entropy key and a matching hash', () => {
    const k = generateApiKey();
    expect(k.raw).toMatch(/^xdg_(live|test)_[A-Za-z0-9_-]{20,}$/);
    expect(k.prefix.startsWith('xdg_')).toBe(true);
    expect(k.raw.startsWith(k.prefix)).toBe(true);
    expect(k.hash).toBe(hashApiKey(k.raw));
    // two calls never collide
    expect(generateApiKey().raw).not.toBe(k.raw);
  });

  it('hash is deterministic and never equal to the plaintext (only a hash is stored)', () => {
    const raw = 'xdg_test_secret';
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
    expect(hashApiKey(raw)).not.toBe(raw);
    expect(hashApiKey(raw)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('the safe view never exposes key_hash', () => {
    const view = toApiKeyView(baseRow({ key_hash: 'topsecrethash' }));
    expect(JSON.stringify(view)).not.toContain('topsecrethash');
    expect(view).not.toHaveProperty('key_hash');
  });
});

describe('verifyApiKey status classification', () => {
  it('blank / non-xdg key is invalid without a DB lookup', async () => {
    expect((await verifyApiKey(fakeAdmin(null), '')).status).toBe('invalid');
    expect((await verifyApiKey(fakeAdmin(null), 'nope')).status).toBe('invalid');
    expect((await verifyApiKey(fakeAdmin(null), null)).status).toBe('invalid');
  });

  it('unknown key (no row) is invalid', async () => {
    expect((await verifyApiKey(fakeAdmin(null), 'xdg_test_x')).status).toBe('invalid');
  });

  it('revoked key is revoked', async () => {
    const res = await verifyApiKey(fakeAdmin(baseRow({ revoked_at: '2026-01-01T00:00:00Z' })), 'xdg_test_x');
    expect(res.status).toBe('revoked');
  });

  it('expired key is expired', async () => {
    const res = await verifyApiKey(fakeAdmin(baseRow({ expires_at: '2000-01-01T00:00:00Z' })), 'xdg_test_x');
    expect(res.status).toBe('expired');
  });

  it('valid, unexpired, unrevoked key is ok', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await verifyApiKey(fakeAdmin(baseRow({ expires_at: future })), 'xdg_test_x');
    expect(res.status).toBe('ok');
    expect(res.key?.id).toBe('key-1');
  });
});

describe('scopes', () => {
  it('admin is a superset that satisfies every scope', () => {
    for (const scope of ALL_SCOPES) {
      expect(scopeSatisfies(['admin'], scope)).toBe(true);
    }
  });

  it('a scoped key only satisfies its own scopes', () => {
    expect(scopeSatisfies(['read'], 'read')).toBe(true);
    expect(scopeSatisfies(['read'], 'plaza:write')).toBe(false);
    expect(scopeSatisfies(['plaza:write'], 'listings:write')).toBe(false);
  });

  it('members can never mint the admin scope', () => {
    expect(MEMBER_MINTABLE_SCOPES).not.toContain('admin');
    expect(isApiScope('admin')).toBe(true);
    expect(isApiScope('bogus')).toBe(false);
  });
});
