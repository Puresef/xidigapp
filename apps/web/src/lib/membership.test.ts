import { describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/lib/auth/guards';

import { hasCapability, hasEntitlement } from './membership';

/**
 * The two membership checks are separate on purpose (20260911000600):
 *   hasEntitlement — ordinary paid allowances; the has_entitlement rpc admits
 *     active + pending_deletion (the §19 grace is ordinary membership);
 *   hasCapability — governance/capital powers; the has_capability rpc is
 *     active-only.
 * The parameter types come from @xidig/db's classification, so passing a
 * governance capability to hasEntitlement (or a quota to hasCapability) does
 * not compile — the @ts-expect-error lines below fail typecheck if that
 * protection is ever lost.
 */

function ctxReturning(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { ctx: { supabase: { rpc } } as unknown as AuthContext, rpc };
}

describe('hasEntitlement', () => {
  it('asks the grace-admitting has_entitlement rpc, never has_capability', async () => {
    const { ctx, rpc } = ctxReturning(true);
    expect(await hasEntitlement(ctx, 'elevated_limits')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('has_entitlement', { cap: 'elevated_limits' });
    expect(rpc).not.toHaveBeenCalledWith('has_capability', expect.anything());
  });

  it('is false unless the rpc says exactly true', async () => {
    expect(await hasEntitlement(ctxReturning(false).ctx, 'supporter_spaces')).toBe(false);
    expect(await hasEntitlement(ctxReturning(null).ctx, 'supporter_spaces')).toBe(false);
  });

  it('throws on an rpc error instead of guessing', async () => {
    await expect(
      hasEntitlement(ctxReturning(null, { message: 'boom' }).ctx, 'elevated_limits'),
    ).rejects.toThrow('entitlement check failed: boom');
  });
});

describe('hasCapability', () => {
  it('asks the active-only has_capability rpc', async () => {
    const { ctx, rpc } = ctxReturning(true);
    expect(await hasCapability(ctx, 'vote_candidate')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('has_capability', { cap: 'vote_candidate' });
  });

  it('throws on an rpc error instead of guessing', async () => {
    await expect(
      hasCapability(ctxReturning(null, { message: 'boom' }).ctx, 'builder_path'),
    ).rejects.toThrow('capability check failed: boom');
  });
});

describe('the classification is enforced by the types', () => {
  it('rejects crossing the line at compile time', () => {
    const { ctx } = ctxReturning(false);
    // @ts-expect-error — a governance vote is never an ordinary entitlement
    void hasEntitlement(ctx, 'vote_candidate');
    // @ts-expect-error — a quota is not an active-only capability
    void hasCapability(ctx, 'elevated_limits');
    expect(true).toBe(true);
  });
});
