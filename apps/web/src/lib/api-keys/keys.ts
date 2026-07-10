import { createHash, randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@xidig/db';

import { env } from '@/env';

import type { ApiScope } from './scopes';

/**
 * API-key minting, hashing and verification (PRD §21).
 *
 * Storage rule: only a SHA-256 hash of the key is ever persisted (`key_hash`,
 * unique). The plaintext key is shown exactly once, at creation, and never
 * again — there is no code path that can read it back. Keys are high-entropy
 * (32 random bytes), so a straight SHA-256 (no per-row salt) is the right
 * primitive — same posture as GitHub/Stripe personal tokens.
 *
 * All operations here run through the SERVICE-ROLE client (api_keys is
 * RLS-locked to every client role); callers must authorise separately.
 */

export type ApiKeyRow = Tables<'api_keys'>;

/** Public marker in the key prefix — cosmetic, distinguishes envs at a glance. */
const KEY_MARKER = env.NODE_ENV === 'production' ? 'live' : 'test';

/** Hash a raw key for storage / lookup. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface GeneratedKey {
  /** The full plaintext key — returned to the creator ONCE, never stored. */
  raw: string;
  /** Display prefix stored in the row (safe to show in a list). */
  prefix: string;
  /** SHA-256 of `raw`, stored in `key_hash`. */
  hash: string;
}

/** Generate a fresh key: `xdg_<marker>_<43-char secret>`. */
export function generateApiKey(): GeneratedKey {
  const secret = randomBytes(32).toString('base64url');
  const raw = `xdg_${KEY_MARKER}_${secret}`;
  // Prefix reveals the marker + 6 secret chars — enough to identify a key in a
  // list, far too little to reconstruct it.
  const prefix = `xdg_${KEY_MARKER}_${secret.slice(0, 6)}`;
  return { raw, prefix, hash: hashApiKey(raw) };
}

/** Safe projection of a key row — never includes `key_hash`. */
export interface ApiKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMinute: number | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function toApiKeyView(row: ApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    rateLimitPerMinute: row.rate_limit_per_minute,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export interface MintOptions {
  ownerUserId: string;
  name: string;
  scopes: ApiScope[];
  /** ISO timestamp; null/undefined = never expires. */
  expiresAt?: string | null;
  rateLimitPerMinute?: number | null;
}

export interface MintResult {
  view: ApiKeyView;
  /** Plaintext key — surface once, then discard. */
  raw: string;
}

/** Create a key. Returns the safe view PLUS the one-time plaintext key. */
export async function mintApiKey(
  admin: SupabaseClient<Database>,
  opts: MintOptions,
): Promise<MintResult> {
  const { raw, prefix, hash } = generateApiKey();
  const { data, error } = await admin
    .from('api_keys')
    .insert({
      owner_user_id: opts.ownerUserId,
      name: opts.name,
      key_hash: hash,
      key_prefix: prefix,
      scopes: opts.scopes,
      expires_at: opts.expiresAt ?? null,
      rate_limit_per_minute: opts.rateLimitPerMinute ?? null,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`api key insert failed: ${error?.message ?? 'no row'}`);
  }
  return { view: toApiKeyView(data), raw };
}

export type VerifyStatus = 'ok' | 'invalid' | 'expired' | 'revoked';

export interface VerifyResult {
  status: VerifyStatus;
  key?: ApiKeyRow;
}

/**
 * Look a raw key up by its hash and classify it. Pure verification — NO scope
 * check, NO side effects (last_used is touched by the caller/guard). A blank or
 * malformed key short-circuits to `invalid` without a DB round-trip.
 */
export async function verifyApiKey(
  admin: SupabaseClient<Database>,
  raw: string | null | undefined,
): Promise<VerifyResult> {
  if (!raw || !raw.startsWith('xdg_')) return { status: 'invalid' };

  const { data, error } = await admin
    .from('api_keys')
    .select('*')
    .eq('key_hash', hashApiKey(raw))
    .maybeSingle();
  if (error || !data) return { status: 'invalid' };

  if (data.revoked_at !== null) return { status: 'revoked', key: data };
  if (data.expires_at !== null && new Date(data.expires_at).getTime() <= Date.now()) {
    return { status: 'expired', key: data };
  }
  return { status: 'ok', key: data };
}

/** Best-effort last-used stamp. Failures are swallowed — auth already succeeded. */
export async function touchLastUsed(
  admin: SupabaseClient<Database>,
  keyId: string,
): Promise<void> {
  const { error } = await admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyId);
  if (error) console.warn('[api-keys] last_used update failed:', error.message);
}

/** Revoke a key (idempotent). Returns true if a row was newly revoked. */
export async function revokeApiKey(
  admin: SupabaseClient<Database>,
  opts: { keyId: string; ownerUserId?: string | undefined },
): Promise<boolean> {
  let q = admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', opts.keyId)
    .is('revoked_at', null);
  if (opts.ownerUserId) q = q.eq('owner_user_id', opts.ownerUserId);
  const { data, error } = await q.select('id');
  if (error) throw new Error(`api key revoke failed: ${error.message}`);
  return (data ?? []).length > 0;
}

/** List a member's keys (safe projection, newest first). */
export async function listApiKeys(
  admin: SupabaseClient<Database>,
  ownerUserId: string,
): Promise<ApiKeyView[]> {
  const { data, error } = await admin
    .from('api_keys')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`api key list failed: ${error.message}`);
  return (data ?? []).map(toApiKeyView);
}
