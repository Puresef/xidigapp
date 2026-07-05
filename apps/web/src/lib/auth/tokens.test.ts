import { describe, expect, it, vi } from 'vitest';

import { AUTH_LINK_TTL_MS, checkAuthToken, hashAppToken, mintAppToken } from './tokens';

/** Chainable stub for the auth_email_tokens lookup. */
function adminStub(
  row: { type: string; created_at: string; consumed_at: string | null } | null,
) {
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle };
  const from = vi.fn(() => chain);
  return { client: { from } as never, from };
}

describe('checkAuthToken — the 10-minute §26 window keyed on the RECORDED type', () => {
  it.each(['magiclink', 'signup', 'email_change', 'email_link'])(
    '%s: fresh token passes and reports its recorded type',
    async (type) => {
      const { client } = adminStub({
        type,
        created_at: new Date(Date.now() - 60_000).toISOString(),
        consumed_at: null,
      });
      expect(await checkAuthToken(client, 'hash')).toEqual({ status: 'ok', recordedType: type });
    },
  );

  it.each(['magiclink', 'signup', 'email_change', 'email_link'])(
    '%s: token older than 10 minutes is expired',
    async (type) => {
      const { client } = adminStub({
        type,
        created_at: new Date(Date.now() - AUTH_LINK_TTL_MS - 1000).toISOString(),
        consumed_at: null,
      });
      expect((await checkAuthToken(client, 'hash')).status).toBe('expired');
    },
  );

  it('a recorded 10-minute token stays expired regardless of what the caller CLAIMS it is', async () => {
    // The bypass the adversarial review found: the check must not depend on
    // a caller-supplied type — only the ledger row decides.
    const { client } = adminStub({
      type: 'magiclink',
      created_at: new Date(Date.now() - AUTH_LINK_TTL_MS - 1000).toISOString(),
      consumed_at: null,
    });
    const result = await checkAuthToken(client, 'hash');
    expect(result.status).toBe('expired');
    expect(result.recordedType).toBe('magiclink');
  });

  it('recovery tokens never expire app-side (GoTrue owns their 60 minutes)', async () => {
    const { client } = adminStub({
      type: 'recovery',
      created_at: new Date(Date.now() - AUTH_LINK_TTL_MS * 5).toISOString(),
      consumed_at: null,
    });
    expect(await checkAuthToken(client, 'hash')).toEqual({
      status: 'ok',
      recordedType: 'recovery',
    });
  });

  it('an already-consumed token is expired (single-use)', async () => {
    const { client } = adminStub({
      type: 'magiclink',
      created_at: new Date().toISOString(),
      consumed_at: new Date().toISOString(),
    });
    expect((await checkAuthToken(client, 'hash')).status).toBe('expired');
  });

  it('an unknown token defers to GoTrue (fail-open, no recorded type)', async () => {
    const { client } = adminStub(null);
    expect(await checkAuthToken(client, 'hash')).toEqual({ status: 'ok' });
  });
});

describe('findLatestEmailToken — numeric-code fallback lookup', () => {
  function listStub(row: { token_hash: string; type: string; created_at: string } | null) {
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle,
    };
    return { client: { from: vi.fn(() => chain) } as never, chain };
  }

  it('returns the fresh token with its type', async () => {
    const { client } = listStub({
      token_hash: 'h1',
      type: 'signup',
      created_at: new Date(Date.now() - 30_000).toISOString(),
    });
    const { findLatestEmailToken } = await import('./tokens');
    expect(await findLatestEmailToken(client, 'a@b.co')).toEqual({
      tokenHash: 'h1',
      type: 'signup',
      status: 'ok',
    });
  });

  it('flags tokens older than the 10-minute window as expired', async () => {
    const { client } = listStub({
      token_hash: 'h1',
      type: 'magiclink',
      created_at: new Date(Date.now() - AUTH_LINK_TTL_MS - 1000).toISOString(),
    });
    const { findLatestEmailToken } = await import('./tokens');
    expect((await findLatestEmailToken(client, 'a@b.co'))?.status).toBe('expired');
  });

  it('returns null when no open link token exists (no code was ever sent)', async () => {
    const { client } = listStub(null);
    const { findLatestEmailToken } = await import('./tokens');
    expect(await findLatestEmailToken(client, 'a@b.co')).toBeNull();
  });
});

describe('app-namespace tokens (email_link)', () => {
  it('mints url-safe raw values whose sha256 matches hashAppToken', () => {
    const token = mintAppToken();
    expect(token.raw).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(token.hash).toBe(hashAppToken(token.raw));
    expect(token.hash).toMatch(/^[0-9a-f]{64}$/);
    // raw never equals stored hash — a DB leak alone cannot replay links
    expect(token.hash).not.toBe(token.raw);
  });

  it('mints unique tokens', () => {
    const seen = new Set(Array.from({ length: 100 }, () => mintAppToken().raw));
    expect(seen.size).toBe(100);
  });
});
