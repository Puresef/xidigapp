import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

/**
 * users.status / is_ai for a set of members — the one account-state primitive
 * every discovery and projection surface shares.
 *
 * Read via the service role: another member's users row is unreadable under
 * RLS (users_select_own), and the flags never leave the server. A missing row
 * fails closed: the account is not live, so it is not shown.
 *
 * Why this exists as a shared module: the member-visible RLS rule
 * (author_is_active) hides a non-live member's content, but service-role
 * projections bypass RLS and each grew its own gate — or none. Search had one
 * (module-private), the directory and the feed comment teaser had none, and a
 * deleted member surfaced on exactly the surfaces that skipped it.
 *
 * LIVE = 'active' or 'pending_deletion'. The §19 grace is ordinary membership
 * until the final transition (owner ruling, 11 Sep): a member who asked to be
 * deleted and can still cancel keeps their profile, directory row and content
 * exactly like an active member. This is the same set as the database's
 * current_account_can_use_client_api() and author_is_active()
 * (20260911000400 / 20260911000500), of has_entitlement() (20260911000600)
 * and of the device-push recipient check (lib/push/send.ts) — change them
 * together. Privilege checks (mod, admin, verifier, and the
 * governance/capital supporter capabilities) stay active-only and do not use
 * this.
 */
export const LIVE_ACCOUNT_STATUSES: readonly Enums<'account_status'>[] = [
  'active',
  'pending_deletion',
];

/** A member in good standing: active, or in the cancellable deletion grace. */
export function isLiveStatus(status: Enums<'account_status'> | null | undefined): boolean {
  return status !== null && status !== undefined && LIVE_ACCOUNT_STATUSES.includes(status);
}

export interface AccountFlags {
  status: Enums<'account_status'>;
  isAi: boolean;
  /**
   * Quarantined seeded/test account (users.is_test, migration
   * 20260912050000). Test accounts never count or appear as organic
   * community proof: not in counters, rankings, awards, trust, search,
   * discovery or public projections. See isOrganicAccount().
   */
  isTest: boolean;
}

export async function loadAccountFlags(
  admin: SupabaseClient<Database>,
  userIds: readonly string[],
): Promise<Map<string, AccountFlags>> {
  const flags = new Map<string, AccountFlags>();
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return flags;
  const { data, error } = await admin
    .from('users')
    .select('id, status, is_ai, is_test')
    .in('id', ids);
  if (error) throw new Error(`account flags lookup failed: ${error.message}`);
  for (const row of data ?? []) {
    flags.set(row.id, { status: row.status, isAi: row.is_ai, isTest: row.is_test });
  }
  return flags;
}

/** True only for a live account; unknown ids fail closed. */
export function isLiveAccount(flags: Map<string, AccountFlags>, userId: string): boolean {
  return isLiveStatus(flags.get(userId)?.status);
}

/** True for a quarantined seeded/test account. */
export function isTestAccount(flags: Map<string, AccountFlags>, userId: string): boolean {
  return flags.get(userId)?.isTest === true;
}

/**
 * A live account that is NOT a quarantined test account: the only accounts
 * whose presence, activity and edges may count as organic community proof.
 * Unknown ids fail closed. (AI accounts are labelled rather than hidden on
 * most surfaces; callers that also exclude AI check isAi themselves.)
 */
export function isOrganicAccount(flags: Map<string, AccountFlags>, userId: string): boolean {
  const flag = flags.get(userId);
  return flag !== undefined && isLiveStatus(flag.status) && !flag.isTest;
}

/**
 * Every quarantined test account id (service role). Small by design; used to
 * build `not in` filters for counts and lists that cannot be filtered after
 * the fact. Throws on error: a proof surface that cannot tell test accounts
 * apart must not guess.
 */
export async function loadTestAccountIds(admin: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await admin.from('users').select('id').eq('is_test', true);
  if (error) throw new Error(`test account lookup failed: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

/**
 * A PostgREST list literal for `.not(column, 'in', …)`. Only uuids reach it
 * (ids come from users.id), so no quoting is needed.
 */
export function postgrestIdList(ids: readonly string[]): string {
  return `(${ids.join(',')})`;
}
