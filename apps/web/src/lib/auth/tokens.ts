import { createHash, randomBytes } from 'node:crypto';

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
 * SECURITY: expiry decisions key off the RECORDED type for the token_hash —
 * never the caller-supplied ?type= query param — so rewriting the URL cannot
 * stretch a 10-minute link to 60 (adversarial-review finding). A token_hash
 * with no row falls through to GoTrue verification (fail-open for
 * availability: GoTrue still enforces the 60-minute ceiling + single-use).
 *
 * Two token namespaces share the table:
 *  - GoTrue tokens: hashed_token from generateLink(), stored verbatim;
 *  - app tokens ('email_link'): minted here, stored as sha256(raw) — the raw
 *    value goes in the emailed URL, so a DB read-only leak cannot replay them.
 */

/** Types whose links die after 10 minutes (PRD: "link/code expiry: 10 minutes"). */
const TEN_MINUTE_TYPES = new Set(['magiclink', 'signup', 'email_change', 'email_link']);

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

export interface TokenCheck {
  status: 'ok' | 'expired';
  /** The type the token was ISSUED as, when the ledger knows it. */
  recordedType?: string;
}

/**
 * App-side expiry check for a link that just came back to /auth/confirm.
 * Looks the token up unconditionally; when a row exists, the recorded type —
 * not the query param — decides whether the 10-minute window applies.
 */
export async function checkAuthToken(
  admin: SupabaseClient<Database>,
  tokenHash: string,
): Promise<TokenCheck> {
  const { data } = await admin
    .from('auth_email_tokens')
    .select('type, created_at, consumed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!data) return { status: 'ok' }; // unknown → GoTrue decides

  const result: TokenCheck = { status: 'ok', recordedType: data.type };
  if (!TEN_MINUTE_TYPES.has(data.type)) return result; // e.g. recovery: 60 min via GoTrue

  if (data.consumed_at) return { ...result, status: 'expired' }; // already used
  if (Date.now() - new Date(data.created_at).getTime() > AUTH_LINK_TTL_MS) {
    return { ...result, status: 'expired' };
  }
  return result;
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

export interface LatestEmailToken {
  tokenHash: string;
  /** 'magiclink' | 'signup' — the flow the companion code belongs to. */
  type: string;
  status: 'ok' | 'expired';
}

/**
 * The numeric-code fallback verifies against the LATEST open link token for
 * an email (link and code are the same underlying GoTrue token). Expiry uses
 * the same 10-minute ledger window as the link itself.
 */
export async function findLatestEmailToken(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<LatestEmailToken | null> {
  const { data } = await admin
    .from('auth_email_tokens')
    .select('token_hash, type, created_at')
    .eq('email', email)
    .in('type', ['magiclink', 'signup'])
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const expired = Date.now() - new Date(data.created_at).getTime() > AUTH_LINK_TTL_MS;
  return { tokenHash: data.token_hash, type: data.type, status: expired ? 'expired' : 'ok' };
}

/** Mint an app-namespace token (email_link): raw goes in the URL, hash in the DB. */
export function mintAppToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashAppToken(raw) };
}

export function hashAppToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}
