import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

/**
 * users.status / is_ai / is_test for a set of members — the account-state
 * primitive the test-account quarantine (users.is_test, migration
 * 20260912050000) reads on every projection and discovery surface.
 *
 * Read via the service role: another member's users row is unreadable under
 * RLS (users_select_own), and the flags never leave the server. Every loader
 * THROWS on a lookup error: a proof surface that cannot tell test accounts
 * apart must not guess. That is why the migration has to be applied before
 * app code that reads the column (docs/test-account-quarantine.md).
 *
 * This is the hotfix subset of the integration line's lib/account-flags.ts
 * (same names and signatures, so a later merge takes that superset).
 */
export interface AccountFlags {
  status: Enums<'account_status'>;
  isAi: boolean;
  /**
   * Quarantined seeded/test account (users.is_test). Test accounts never
   * count or appear as organic community proof: not in counters, rankings,
   * awards, search, discovery or public projections.
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

/** True for a quarantined seeded/test account. */
export function isTestAccount(flags: Map<string, AccountFlags>, userId: string): boolean {
  return flags.get(userId)?.isTest === true;
}

/**
 * Every quarantined test account id (service role). Small by design; used to
 * build `not in` filters for counts and lists that cannot be filtered after
 * the fact. Throws on error.
 */
export async function loadTestAccountIds(admin: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await admin.from('users').select('id').eq('is_test', true);
  if (error) throw new Error(`test account lookup failed: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

/**
 * A PostgREST list literal for `.not(column, 'in', …)`. Only uuids reach it
 * (ids come from users.id), so no quoting is needed. Callers skip the filter
 * when the list is empty (`()` is not a valid PostgREST list).
 */
export function postgrestIdList(ids: readonly string[]): string {
  return `(${ids.join(',')})`;
}
