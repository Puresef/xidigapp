import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

type Admin = SupabaseClient<Database>;

/**
 * Admin waitlist projection — retained content (owner ruling 11 Sep): a
 * deleted member's email or phone must not appear in admin waitlist views as
 * ordinary contact data. The stored rows are NOT changed; no retention policy
 * is decided here.
 *
 * Only JOINED entries can belong to an account, and signup records exactly
 * which one: the signup trigger consumes a grant that carries the entry's id
 * (signup_grants.waitlist_entry_id → consumed_by_user_id), or redeems the
 * invite issued to it (waitlist_entries.invite_id → invites.redeemed_by_user_id).
 * The rule:
 *
 *   - linked account is DELETED        → contact withheld, "account deleted";
 *   - linked account exists otherwise  → shown (suspended/deactivated
 *                                        included — not a deletion);
 *   - no link on record (legacy/manual) → shown only while an existing,
 *                                        non-deleted account still holds the
 *                                        email or phone, else withheld as "no
 *                                        current account matches" (a deleted
 *                                        account's address was scrubbed, so it
 *                                        can never match).
 *
 * Pending and invited entries never became accounts and are untouched.
 */

export type WaitlistContactHidden = 'account_deleted' | 'no_matching_account';

export interface AdminWaitlistEntry {
  id: string;
  email: string | null;
  phone: string | null;
  status: 'pending' | 'invited' | 'joined';
  created_at: string;
  invited_at?: string | null;
  invite_id?: string | null;
  /** Why the stored contact is withheld, or null when it is shown. */
  contactHidden: WaitlistContactHidden | null;
}

type WaitlistRow = Omit<AdminWaitlistEntry, 'contactHidden'>;

export async function projectWaitlistForAdmin(
  admin: Admin,
  rows: readonly WaitlistRow[],
): Promise<AdminWaitlistEntry[]> {
  const joined = rows.filter((row) => row.status === 'joined');
  if (joined.length === 0) return rows.map((row) => ({ ...row, contactHidden: null }));

  // 1. The account each joined entry became (grant path, then invite path).
  const accountOf = new Map<string, string>();
  const [grants, entryInvites] = await Promise.all([
    admin
      .from('signup_grants')
      .select('waitlist_entry_id, consumed_by_user_id')
      .in(
        'waitlist_entry_id',
        joined.map((row) => row.id),
      )
      .not('consumed_by_user_id', 'is', null),
    admin
      .from('waitlist_entries')
      .select('id, invite_id')
      .in(
        'id',
        joined.map((row) => row.id),
      )
      .not('invite_id', 'is', null),
  ]);
  if (grants.error) throw new Error(`waitlist grant link failed: ${grants.error.message}`);
  if (entryInvites.error)
    throw new Error(`waitlist invite link failed: ${entryInvites.error.message}`);
  for (const grant of grants.data ?? []) {
    if (grant.waitlist_entry_id && grant.consumed_by_user_id) {
      accountOf.set(grant.waitlist_entry_id, grant.consumed_by_user_id);
    }
  }
  const inviteToEntry = new Map(
    (entryInvites.data ?? [])
      .filter((row) => row.invite_id && !accountOf.has(row.id))
      .map((row) => [row.invite_id as string, row.id]),
  );
  if (inviteToEntry.size > 0) {
    const { data: invites, error } = await admin
      .from('invites')
      .select('id, redeemed_by_user_id')
      .in('id', [...inviteToEntry.keys()])
      .not('redeemed_by_user_id', 'is', null);
    if (error) throw new Error(`waitlist invite lookup failed: ${error.message}`);
    for (const invite of invites ?? []) {
      const entryId = inviteToEntry.get(invite.id);
      if (entryId && invite.redeemed_by_user_id) accountOf.set(entryId, invite.redeemed_by_user_id);
    }
  }

  // 2. Status of every linked account.
  const statusOf = new Map<string, string>();
  const linkedIds = [...new Set(accountOf.values())];
  if (linkedIds.length > 0) {
    const { data, error } = await admin.from('users').select('id, status').in('id', linkedIds);
    if (error) throw new Error(`waitlist account status failed: ${error.message}`);
    for (const user of data ?? []) statusOf.set(user.id, user.status);
  }

  // 3. Fallback for unlinked joined entries: does a non-deleted account hold it?
  const unlinked = joined.filter((row) => !accountOf.has(row.id));
  const heldEmails = new Set<string>();
  const heldPhones = new Set<string>();
  const emails = [...new Set(unlinked.map((r) => r.email).filter((v): v is string => !!v))];
  const phones = [...new Set(unlinked.map((r) => r.phone).filter((v): v is string => !!v))];
  const [byEmail, byPhone] = await Promise.all([
    emails.length > 0
      ? admin.from('users').select('email').in('email', emails).neq('status', 'deleted')
      : Promise.resolve({ data: [], error: null }),
    phones.length > 0
      ? admin.from('users').select('phone').in('phone', phones).neq('status', 'deleted')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byEmail.error) throw new Error(`waitlist account match failed: ${byEmail.error.message}`);
  if (byPhone.error) throw new Error(`waitlist account match failed: ${byPhone.error.message}`);
  for (const row of (byEmail.data ?? []) as Array<{ email: string | null }>) {
    if (row.email) heldEmails.add(row.email.toLowerCase());
  }
  for (const row of (byPhone.data ?? []) as Array<{ phone: string | null }>) {
    if (row.phone) heldPhones.add(row.phone);
  }

  const withhold = (row: WaitlistRow, why: WaitlistContactHidden): AdminWaitlistEntry => ({
    ...row,
    email: null,
    phone: null,
    contactHidden: why,
  });

  return rows.map((row) => {
    if (row.status !== 'joined') return { ...row, contactHidden: null };
    const account = accountOf.get(row.id);
    if (account !== undefined) {
      return statusOf.get(account) === 'deleted'
        ? withhold(row, 'account_deleted')
        : { ...row, contactHidden: null };
    }
    const held =
      (row.email !== null && heldEmails.has(row.email.toLowerCase())) ||
      (row.phone !== null && heldPhones.has(row.phone));
    return held ? { ...row, contactHidden: null } : withhold(row, 'no_matching_account');
  });
}
