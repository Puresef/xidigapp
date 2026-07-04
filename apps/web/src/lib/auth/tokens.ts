import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * Issued-at ledger for self-sent auth email links (auth_email_tokens).
 *
 * Why it exists: GoTrue has ONE global email-OTP expiry, but the PRD needs a
 * split — magic links / signup confirmations expire after 10 minutes, while
 * password-reset links live 60 minutes (§26, §27). The global GoTrue expiry
 * is set to 60 minutes (the longest), and /auth/confirm enforces the shorter
 * 10-minute window app-side using the created_at recorded here.
 *
 * Fail-open by design: a token_hash with no row (e.g. sent before a deploy
 * that cleared the table) falls through to GoTrue verification, which still
 * enforces the 60-minute ceiling and single-use.
 */

/** Types whose links die after 10 minutes (PRD: "link/code expiry: 10 minutes"). */
const TEN_MINUTE_TYPES = new Set(['magiclink', 'signup', 'email_change']);

export const AUTH_LINK_TTL_MS = 10 * 60 * 1000;

export async function recordAuthToken(
  admin: SupabaseClient<Database>,
  opts: { tokenHash: string; email: string; type: string; userId?: string },
): Promise<void> {
  // Opportunistic cleanup — anything older than 24h is long dead (GoTrue
  // ceiling is 60 min). Keeps the table tiny without a cron.
  await admin
    .from('auth_email_tokens')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { error } = await admin.from('auth_email_tokens').insert({
    token_hash: opts.tokenHash,
    email: opts.email,
    type: opts.type,
    user_id: opts.userId ?? null,
  });
  if (error) throw new Error(`Failed to record auth token: ${error.message}`);
}

export type TokenCheck = 'ok' | 'expired';

/**
 * App-side expiry check for a link that just came back to /auth/confirm.
 * Only the 10-minute types can come back 'expired' here; everything else
 * (recovery at 60 min, unknown rows) defers to GoTrue.
 */
export async function checkAuthToken(
  admin: SupabaseClient<Database>,
  tokenHash: string,
  type: string,
): Promise<TokenCheck> {
  if (!TEN_MINUTE_TYPES.has(type)) return 'ok';

  const { data } = await admin
    .from('auth_email_tokens')
    .select('created_at, consumed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!data) return 'ok'; // unknown → GoTrue decides
  if (data.consumed_at) return 'expired'; // already used
  if (Date.now() - new Date(data.created_at).getTime() > AUTH_LINK_TTL_MS) return 'expired';
  return 'ok';
}

export async function consumeAuthToken(
  admin: SupabaseClient<Database>,
  tokenHash: string,
): Promise<void> {
  await admin
    .from('auth_email_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('consumed_at', null);
}
