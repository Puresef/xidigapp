import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * §19 auth shutdown — owner-selected Option A. Runs after anonymise_user()
 * has committed, for every account in 'deleted' whose GoTrue identity has not
 * yet been confirmed shut.
 *
 * Why it is needed: the database transition scrubs public.users but never
 * touches auth.users. Observed on Dev after anonymisation: the member could
 * still refresh their session AND sign in again with their password at GoTrue
 * directly, and every token so minted authenticates to PostgREST/Realtime.
 *
 * What it does, through the supported admin API only (never a direct write to
 * auth.users, never deleteUser):
 *
 *   1. BAN for a terminal horizon. GoTrue then refuses every grant — password,
 *      OTP, magic link, recovery verification — and every refresh, and its own
 *      /user endpoint rejects existing access tokens.
 *   2. PSEUDONYMISE the email to deleted-<uuid>@deleted.invalid. The member's
 *      address stops being an identifier GoTrue can be asked about, so
 *      recovery/magic-link requests for it find nothing; `.invalid` (RFC 2606)
 *      can never resolve, and GoTrue refuses to mail it (email_address_invalid,
 *      verified on Dev). Deterministic, so a retry writes the same value, and
 *      it carries nothing but the UUID the tombstone already keeps.
 *   3. READ BACK and verify both, under the same UUID. Only a read-back counts
 *      as done — a provider "success" is not evidence.
 *
 * Order: ban BEFORE email. If the email step fails after a ban, the account
 * is already unable to obtain or refresh any session and only its address
 * remains to replace. The reverse order could leave a pseudonymised but
 * UNBANNED identity: the password grant would accept the (guessable,
 * deterministic) pseudonym and the old refresh token would keep working.
 * Two calls rather than one combined update for the same reason — a combined
 * update that failed validation on the email would also drop the ban.
 *
 * NOT done, deliberately: the phone. GoTrue silently ignores phone null/''
 * and only accepts a replacement E.164 value, which would store a number that
 * could belong to a real person (owner ruling: no fake E.164). The phone
 * therefore REMAINS in auth.users — the ban makes it unusable for sign-in,
 * but it is retained, not erased. public.users.phone is already null and the
 * mirror guard (20260911000000) stops it coming back.
 *
 * NOT covered: an access token issued before the ban keeps authenticating to
 * PostgREST/Realtime until it expires (Postgres validates JWTs locally).
 * Option A caps that window; it does not close it.
 *
 * Idempotent: an identity already banned + pseudonymised gets no provider
 * writes (changed: false). Failures come back as a coarse category — never a
 * provider message, which can echo the address.
 */

type Admin = SupabaseClient<Database>;

/** ~100 years. GoTrue has no "permanent"; Go durations top out near 292y. */
export const AUTH_BAN_DURATION = '876000h';

/** A ban shorter than this (e.g. a moderation ban) is extended to terminal. */
const MIN_TERMINAL_BAN_MS = 50 * 365 * 86_400_000;

const PSEUDONYM_DOMAIN = 'deleted.invalid';

export function authPseudonymEmail(userId: string): string {
  return `deleted-${userId}@${PSEUDONYM_DOMAIN}`;
}

export type AuthCleanupFailure =
  'provider_unavailable' | 'provider_rejected' | 'identity_missing' | 'verification_failed';

export type AuthShutdownResult =
  { outcome: 'completed'; changed: boolean } | { outcome: 'failed'; failure: AuthCleanupFailure };

function categorise(error: unknown): AuthCleanupFailure {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 404) return 'identity_missing';
  if (
    typeof status !== 'number' ||
    status === 0 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  ) {
    return 'provider_unavailable';
  }
  return 'provider_rejected';
}

function isTerminallyBanned(user: User, now: Date): boolean {
  if (!user.banned_until) return false;
  return new Date(user.banned_until).getTime() - now.getTime() >= MIN_TERMINAL_BAN_MS;
}

function holdsPseudonym(user: User, userId: string): boolean {
  return (user.email ?? '').toLowerCase() === authPseudonymEmail(userId);
}

type Step = { user: User } | { failure: AuthCleanupFailure };

async function readUser(admin: Admin, userId: string): Promise<Step> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return { failure: categorise(error) };
    if (!data.user) return { failure: 'identity_missing' };
    return { user: data.user };
  } catch (error) {
    return { failure: categorise(error) };
  }
}

async function update(
  admin: Admin,
  userId: string,
  attributes: { ban_duration: string } | { email: string },
): Promise<AuthCleanupFailure | null> {
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, attributes);
    return error ? categorise(error) : null;
  } catch (error) {
    return categorise(error);
  }
}

export async function shutDownAuthIdentity(
  admin: Admin,
  userId: string,
  now: Date = new Date(),
): Promise<AuthShutdownResult> {
  const before = await readUser(admin, userId);
  if ('failure' in before) return { outcome: 'failed', failure: before.failure };
  // The UUID is the one thing that must never change; an answer about any
  // other identity is not an answer about this one.
  if (before.user.id !== userId) return { outcome: 'failed', failure: 'verification_failed' };

  let changed = false;

  if (!isTerminallyBanned(before.user, now)) {
    const failure = await update(admin, userId, { ban_duration: AUTH_BAN_DURATION });
    if (failure) return { outcome: 'failed', failure };
    changed = true;
  }

  if (!holdsPseudonym(before.user, userId)) {
    const failure = await update(admin, userId, { email: authPseudonymEmail(userId) });
    if (failure) return { outcome: 'failed', failure };
    changed = true;
  }

  if (!changed) return { outcome: 'completed', changed: false };

  const after = await readUser(admin, userId);
  if ('failure' in after) return { outcome: 'failed', failure: after.failure };
  if (
    after.user.id !== userId ||
    !isTerminallyBanned(after.user, now) ||
    !holdsPseudonym(after.user, userId)
  ) {
    return { outcome: 'failed', failure: 'verification_failed' };
  }
  return { outcome: 'completed', changed: true };
}

// ---------------------------------------------------------------------------
// Durable state (public.users, migration 20260911000300).
// ---------------------------------------------------------------------------

/**
 * Deleted accounts whose auth shutdown is still owed — including ones whose
 * earlier attempt failed. Never-attempted first, then least-recently
 * attempted, so a permanently failing account cannot starve the rest.
 */
export async function findAccountsOwingAuthCleanup(admin: Admin, limit = 200): Promise<string[]> {
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('status', 'deleted')
    .is('auth_cleaned_at', null)
    .order('auth_cleanup_attempted_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`auth cleanup scan failed: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

/**
 * Persist the outcome. Returns false when the bookkeeping write failed — the
 * caller must then count the account as still owed (the next run re-reads the
 * provider, finds it already shut, writes nothing there, and marks it).
 */
export async function recordAuthCleanup(
  admin: Admin,
  userId: string,
  result: AuthShutdownResult,
  now: Date = new Date(),
): Promise<boolean> {
  const at = now.toISOString();
  const { error } =
    result.outcome === 'completed'
      ? await admin
          .from('users')
          .update({
            auth_cleaned_at: at,
            auth_cleanup_attempted_at: at,
            auth_cleanup_failure: null,
          })
          .eq('id', userId)
          .eq('status', 'deleted')
      : await admin
          .from('users')
          .update({ auth_cleanup_attempted_at: at, auth_cleanup_failure: result.failure })
          .eq('id', userId)
          .eq('status', 'deleted')
          .is('auth_cleaned_at', null);
  return !error;
}
