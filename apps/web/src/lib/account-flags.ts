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
 * (20260911000400 / 20260911000500) and of has_entitlement() (20260911000600)
 * — change them together. Privilege checks (mod, admin, verifier, and the
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
}

export async function loadAccountFlags(
  admin: SupabaseClient<Database>,
  userIds: readonly string[],
): Promise<Map<string, AccountFlags>> {
  const flags = new Map<string, AccountFlags>();
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return flags;
  const { data, error } = await admin.from('users').select('id, status, is_ai').in('id', ids);
  if (error) throw new Error(`account flags lookup failed: ${error.message}`);
  for (const row of data ?? []) flags.set(row.id, { status: row.status, isAi: row.is_ai });
  return flags;
}

/** True only for a live account; unknown ids fail closed. */
export function isLiveAccount(flags: Map<string, AccountFlags>, userId: string): boolean {
  return isLiveStatus(flags.get(userId)?.status);
}
