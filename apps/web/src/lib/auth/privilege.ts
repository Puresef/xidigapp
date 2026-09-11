import type { Enums } from '@xidig/db';

/**
 * Platform privilege — THE place a platform-role literal is compared.
 *
 * Owner ruling (11 Sep): admin/mod powers (and every power riding them —
 * verification, candidate review, venture oversight, admin-scope API keys)
 * need the role AND a fully ACTIVE account. pending_deletion (the §19 grace)
 * is ordinary membership, not continued power over other members; suspended,
 * deactivated and deleted accounts hold nothing.
 *
 * Why here and not only in the database: many privileged paths read or write
 * through the service role, where the database's active-only is_mod() /
 * is_admin() never run. A bare `role === 'admin'` on such a path keeps the
 * power for a grace, suspended or deleted admin. role-literal-ratchet.test.ts
 * fails on any role literal outside this file.
 */

export type PlatformRole = Enums<'user_role'>;
type AccountStatus = Enums<'account_status'>;

export interface AccountStanding {
  role: PlatformRole;
  status: AccountStatus;
}

/** A fully active account (not the grace, not suspended/deactivated/deleted). */
export function isActiveAccount(account: { status: AccountStatus }): boolean {
  return account.status === 'active';
}

/** An already-effective role at least mod (admin inherits every mod power). */
export function isModRole(role: PlatformRole): boolean {
  return role === 'mod' || role === 'admin';
}

/** An already-effective role that is admin. */
export function isAdminRole(role: PlatformRole): boolean {
  return role === 'admin';
}

/**
 * The role an account may exercise right now: its real role while active,
 * otherwise 'member'. For pure decision functions that take a role fact.
 */
export function effectivePlatformRole(account: AccountStanding): PlatformRole {
  return isActiveAccount(account) ? account.role : 'member';
}

/** Role at least `min` AND an active account. */
export function hasActiveRole(account: AccountStanding, min: 'mod' | 'admin'): boolean {
  const role = effectivePlatformRole(account);
  return min === 'admin' ? isAdminRole(role) : isModRole(role);
}

/** Active mod or admin — moderation reach. */
export function isActiveModOrAdmin(account: AccountStanding): boolean {
  return hasActiveRole(account, 'mod');
}

/** Active admin — platform administration and admin overrides. */
export function isActiveAdmin(account: AccountStanding): boolean {
  return hasActiveRole(account, 'admin');
}
