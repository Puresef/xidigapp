import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums, Json } from '@xidig/db';

/**
 * Append-only audit trail writes (§19: immutable audit log). Insert-only by
 * design — the migration revokes UPDATE/DELETE on audit_logs from every
 * client role including service_role.
 */
export async function writeAudit(
  admin: SupabaseClient<Database>,
  entry: {
    actorUserId: string | null;
    action: string;
    // exactOptionalPropertyTypes: accept explicit undefined (coalesced to null
    // below) so callers can pass a maybe-undefined id without a guard dance.
    targetType?: Enums<'entity_type'> | undefined;
    targetId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    // §21: external REST/MCP writes are audited WITH the key that made them.
    apiKeyId?: string | undefined;
  },
): Promise<void> {
  const { error } = await admin.from('audit_logs').insert({
    actor_user_id: entry.actorUserId,
    api_key_id: entry.apiKeyId ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: (entry.metadata ?? {}) as Json,
  });
  if (error) {
    // An audit failure must be loud (it's the §19 guarantee) but must not
    // take the admin action down with it — log and continue.
    console.error(`[audit] failed to record "${entry.action}":`, error.message);
  }
}
