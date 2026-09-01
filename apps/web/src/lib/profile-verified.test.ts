import { describe, expect, it } from 'vitest';

import { VERIFIED_PROFILE_STATUSES, isVerifiedProfile } from './profile-verified';

/**
 * The single §14 verified-profile predicate. Every byline, DM gate, search
 * row, directory filter and vouch check routes through this module, so its
 * contract — exactly the two genuine verified tiers, nothing else — is locked
 * here once instead of asserted per-surface.
 */
describe('isVerifiedProfile', () => {
  it('accepts exactly the §14 verified tiers', () => {
    expect(isVerifiedProfile('community_verified')).toBe(true);
    expect(isVerifiedProfile('identity_verified')).toBe(true);
  });

  it('rejects the non-verified ladder states and absent values', () => {
    expect(isVerifiedProfile('unverified')).toBe(false);
    expect(isVerifiedProfile('pending')).toBe(false);
    expect(isVerifiedProfile(null)).toBe(false);
    expect(isVerifiedProfile(undefined)).toBe(false);
    expect(isVerifiedProfile('')).toBe(false);
  });

  it('exports the status list for query filters (.in) in ladder order', () => {
    expect([...VERIFIED_PROFILE_STATUSES]).toEqual(['community_verified', 'identity_verified']);
  });
});
