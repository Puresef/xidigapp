import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * Shared helpers for external write routes (PRD §21). Deterministic dedup keys
 * make retries idempotent; tag resolution attaches ONLY pre-existing tags (an
 * external caller can never mint new tags — that would be a spam vector).
 */

/**
 * Namespaced idempotency key: `ext:<api_key_id>:<key>`. When the caller gives
 * no idempotency key, fall back to a content hash so an identical retry still
 * de-duplicates.
 */
export function externalDedupKey(
  apiKeyId: string,
  idempotencyKey: string | undefined,
  content: unknown,
): string {
  if (idempotencyKey) return `ext:${apiKeyId}:${idempotencyKey}`;
  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32);
  return `ext:${apiKeyId}:auto:${hash}`;
}

/** Resolve tag NAMES to ids, keeping only tags that already exist. */
export async function resolveExistingTagIds(
  admin: SupabaseClient<Database>,
  names: string[] | undefined,
): Promise<string[]> {
  const wanted = [...new Set((names ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const { data, error } = await admin.from('tags').select('id').in('name', wanted);
  if (error) throw new Error(`tag resolution failed: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}
