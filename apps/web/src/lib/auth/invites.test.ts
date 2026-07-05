import { describe, expect, it, vi } from 'vitest';

import { generateInviteCode, normalizeInviteCode, validateInviteCode } from './invites';

describe('generateInviteCode', () => {
  it('matches the XIDIG-XXXX-XXXX shape with the confusion-free alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toMatch(/^XIDIG-[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/);
      // no I, L, O, U, 0, 1 in the random blocks — survives handwriting and
      // WhatsApp forwards (the XIDIG prefix itself is fixed branding)
      expect(code.slice('XIDIG-'.length)).not.toMatch(/[ILOU01]/);
    }
  });

  it('does not repeat in a small sample', () => {
    const seen = new Set(Array.from({ length: 500 }, generateInviteCode));
    expect(seen.size).toBe(500);
  });
});

describe('normalizeInviteCode', () => {
  it('uppercases and strips whitespace variance', () => {
    expect(normalizeInviteCode('  xidig-ab2c-9xyz ')).toBe('XIDIG-AB2C-9XYZ');
    expect(normalizeInviteCode('XIDIG- AB2C -9XYZ')).toBe('XIDIG-AB2C-9XYZ');
  });
});

/** Minimal chainable stub of the supabase query builder for invites lookups. */
function adminStub(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle };
  const from = vi.fn(() => chain);
  // Cast through unknown: only the invites lookup surface is stubbed.
  return { client: { from } as never, from, maybeSingle };
}

const validRow = {
  id: 'inv-1',
  code: 'XIDIG-AB2C-9XYZ',
  revoked_at: null,
  expires_at: null,
  redeemed_by_user_id: null,
};

describe('validateInviteCode', () => {
  it('short-circuits malformed codes without touching the database', async () => {
    const { client, from } = adminStub(validRow);
    const result = await validateInviteCode(client, 'WRONG-FORMAT');
    expect(result).toEqual({ ok: false, code: 'invite_invalid' });
    expect(from).not.toHaveBeenCalled();
  });

  it('accepts a live invite (case-insensitive input)', async () => {
    const { client } = adminStub(validRow);
    const result = await validateInviteCode(client, 'xidig-ab2c-9xyz');
    expect(result.ok).toBe(true);
  });

  it('rejects unknown codes', async () => {
    const { client } = adminStub(null);
    expect(await validateInviteCode(client, 'XIDIG-AB2C-9XYZ')).toEqual({
      ok: false,
      code: 'invite_invalid',
    });
  });

  it('rejects revoked codes', async () => {
    const { client } = adminStub({ ...validRow, revoked_at: '2026-07-01T00:00:00Z' });
    expect(await validateInviteCode(client, 'XIDIG-AB2C-9XYZ')).toEqual({
      ok: false,
      code: 'invite_invalid',
    });
  });

  it('rejects expired codes', async () => {
    const { client } = adminStub({ ...validRow, expires_at: '2020-01-01T00:00:00Z' });
    expect(await validateInviteCode(client, 'XIDIG-AB2C-9XYZ')).toEqual({
      ok: false,
      code: 'invite_invalid',
    });
  });

  it('rejects already-redeemed codes with the single-use §27 copy', async () => {
    const { client } = adminStub({ ...validRow, redeemed_by_user_id: 'user-2' });
    expect(await validateInviteCode(client, 'XIDIG-AB2C-9XYZ')).toEqual({
      ok: false,
      code: 'invite_used',
    });
  });

  it('accepts codes with a future expiry', async () => {
    const { client } = adminStub({ ...validRow, expires_at: '2099-01-01T00:00:00Z' });
    expect((await validateInviteCode(client, 'XIDIG-AB2C-9XYZ')).ok).toBe(true);
  });
});
