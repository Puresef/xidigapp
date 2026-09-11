import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { ApiError } from '@/lib/api';

/**
 * Lifecycle pre-check for decisions ABOUT another member — a verifier
 * approving a request, a moderator warning or suspending, an admin changing a
 * role, granting a capability or appointing a mentor. Those items sit in
 * queues and forms long enough for the member to be anonymised in between, so
 * the subject's status is read at decision time, through the trusted
 * service-role client (never the caller's own session, which the client
 * lifecycle gate would not answer for someone else anyway).
 *
 * Only deletion is this guard's concern. Suspended, deactivated and
 * grace-period members are still real accounts whose records a moderator may
 * legitimately act on; each flow keeps its own rules for those.
 */

type Admin = SupabaseClient<Database>;
export type AccountStatus = Enums<'account_status'>;

export async function loadSubjectStatus(
  admin: Admin,
  userId: string,
): Promise<AccountStatus | null> {
  const { data, error } = await admin.from('users').select('status').eq('id', userId).maybeSingle();
  if (error) throw new Error(`subject status lookup failed: ${error.message}`);
  return data ? (data.status as AccountStatus) : null;
}

/**
 * 404 when the account does not exist; 409 `account_deleted` when it has been
 * anonymised. Call BEFORE the first consequential write.
 */
export async function assertSubjectNotDeleted(
  admin: Admin,
  userId: string,
): Promise<AccountStatus> {
  const status = await loadSubjectStatus(admin, userId);
  if (status === null) throw new ApiError('not_found', 404);
  if (status === 'deleted') throw new ApiError('account_deleted', 409);
  return status;
}
