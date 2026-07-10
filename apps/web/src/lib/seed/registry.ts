import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

/**
 * The seed / external-write idempotency registry (PRD §21 "idempotent, safe to
 * re-run"). One `seed_entities` row per created entity, keyed by a deterministic
 * (entity_type, dedup_key). A re-run (seed script) or a retry (external API with
 * the same idempotency key) resolves to the existing entity instead of creating
 * a duplicate.
 *
 * `dedup_key` is namespaced by the caller so two callers never collide:
 *   * seed scripts:  'seed:<run_label>:<natural_key>'
 *   * external API:  'ext:<api_key_id>:<client_idempotency_key>'
 *
 * Concurrency: the unique (entity_type, dedup_key) index is the serialization
 * point — a claim-first INSERT means only one writer materialises a given key.
 * The seed script is single-threaded and external retries are sequential per
 * agent, so concurrent creates of the SAME key are a non-case in practice; the
 * claim-then-backfill handles the ordinary "already exists" path exactly.
 */

export type SeedSource = Extract<Enums<'content_source'>, 'seed' | 'ai'>;

export interface EnsureSeedRunArgs {
  label: string;
  description?: string | null;
  source?: SeedSource;
  actorUserId?: string | null;
}

/** Find-or-create the named batch. Re-running the same label reuses the row. */
export async function ensureSeedRun(
  admin: SupabaseClient<Database>,
  args: EnsureSeedRunArgs,
): Promise<string> {
  const existing = await admin.from('seed_runs').select('id').eq('label', args.label).maybeSingle();
  if (existing.error) throw new Error(`seed_run lookup failed: ${existing.error.message}`);
  if (existing.data) return existing.data.id;

  const { data, error } = await admin
    .from('seed_runs')
    .insert({
      label: args.label,
      description: args.description ?? null,
      source: args.source ?? 'seed',
      actor_user_id: args.actorUserId ?? null,
    })
    .select('id')
    .maybeSingle();
  // Lost a create race → re-read.
  if (error) {
    if (error.code === '23505') {
      const raced = await admin.from('seed_runs').select('id').eq('label', args.label).single();
      if (raced.error || !raced.data) throw new Error(`seed_run re-read failed: ${raced.error?.message}`);
      return raced.data.id;
    }
    throw new Error(`seed_run insert failed: ${error.message}`);
  }
  return data!.id;
}

export interface CreateSeededEntityArgs {
  dedupKey: string;
  entityType: Enums<'entity_type'>;
  source: SeedSource;
  seedRunId?: string | null;
  apiKeyId?: string | null;
  /** Creates the underlying content row and returns its id. */
  create: () => Promise<string>;
}

export interface SeededResult {
  entityId: string;
  /** true = the content was created now; false = idempotent hit (already existed). */
  created: boolean;
}

/**
 * Idempotently create a content entity, registering it against its dedup key.
 * Returns the (existing or new) entity id and whether it was created now.
 */
export async function createSeededEntity(
  admin: SupabaseClient<Database>,
  args: CreateSeededEntityArgs,
): Promise<SeededResult> {
  // 1. Fast path — already registered AND materialised.
  const existing = await admin
    .from('seed_entities')
    .select('id, entity_id')
    .eq('entity_type', args.entityType)
    .eq('dedup_key', args.dedupKey)
    .maybeSingle();
  if (existing.error) throw new Error(`seed_entities lookup failed: ${existing.error.message}`);
  if (existing.data?.entity_id) return { entityId: existing.data.entity_id, created: false };

  // 2. Claim the dedup key (INSERT is the serialization point).
  let registryId = existing.data?.id ?? null;
  if (!registryId) {
    const claim = await admin
      .from('seed_entities')
      .insert({
        dedup_key: args.dedupKey,
        entity_type: args.entityType,
        source: args.source,
        seed_run_id: args.seedRunId ?? null,
        api_key_id: args.apiKeyId ?? null,
        entity_id: null,
      })
      .select('id')
      .maybeSingle();
    if (claim.error) {
      if (claim.error.code !== '23505') {
        throw new Error(`seed_entities claim failed: ${claim.error.message}`);
      }
      const raced = await admin
        .from('seed_entities')
        .select('id, entity_id')
        .eq('entity_type', args.entityType)
        .eq('dedup_key', args.dedupKey)
        .single();
      if (raced.error || !raced.data) throw new Error(`seed_entities re-read failed: ${raced.error?.message}`);
      if (raced.data.entity_id) return { entityId: raced.data.entity_id, created: false };
      registryId = raced.data.id;
    } else {
      registryId = claim.data!.id;
    }
  }

  // 3. Create the content and back-fill the registry row.
  const entityId = await args.create();
  const { error: backfillError } = await admin
    .from('seed_entities')
    .update({ entity_id: entityId })
    .eq('id', registryId)
    .is('entity_id', null);
  if (backfillError) throw new Error(`seed_entities backfill failed: ${backfillError.message}`);
  return { entityId, created: true };
}
