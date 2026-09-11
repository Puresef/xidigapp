import { describe, expect, it } from 'vitest';

import {
  effectivePlatformRole,
  hasActiveRole,
  isActiveAccount,
  isActiveAdmin,
  isActiveModOrAdmin,
  isAdminRole,
  isModRole,
} from './privilege';

/**
 * Platform privilege needs the role AND a fully active account (owner ruling,
 * 11 Sep): admin/mod powers are never usable by pending_deletion, suspended,
 * deactivated or deleted accounts. These helpers are the ONLY place a role
 * literal may be compared (role-literal-ratchet.test.ts enforces it).
 */

const STATUSES = ['active', 'pending_deletion', 'suspended', 'deactivated', 'deleted'] as const;
const ROLES = ['member', 'mod', 'admin'] as const;

describe('hasActiveRole / isActiveModOrAdmin / isActiveAdmin', () => {
  it.each(STATUSES.flatMap((status) => ROLES.map((role) => [role, status] as const)))(
    '%s in %s',
    (role, status) => {
      const active = status === 'active';
      expect(isActiveModOrAdmin({ role, status })).toBe(active && role !== 'member');
      expect(hasActiveRole({ role, status }, 'mod')).toBe(active && role !== 'member');
      expect(isActiveAdmin({ role, status })).toBe(active && role === 'admin');
      expect(hasActiveRole({ role, status }, 'admin')).toBe(active && role === 'admin');
    },
  );
});

describe('effectivePlatformRole', () => {
  it('is the real role only while active; every other status acts as a member', () => {
    for (const role of ROLES) {
      expect(effectivePlatformRole({ role, status: 'active' })).toBe(role);
      for (const status of STATUSES.filter((s) => s !== 'active')) {
        expect(effectivePlatformRole({ role, status })).toBe('member');
      }
    }
  });
});

describe('pure role predicates (for already-effective roles)', () => {
  it('admin inherits mod', () => {
    expect(isModRole('admin')).toBe(true);
    expect(isModRole('mod')).toBe(true);
    expect(isModRole('member')).toBe(false);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('mod')).toBe(false);
  });
});

describe('isActiveAccount', () => {
  it.each(STATUSES)('%s', (status) => {
    expect(isActiveAccount({ status })).toBe(status === 'active');
  });
});
