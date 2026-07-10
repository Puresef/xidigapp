import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json, TablesInsert, TablesUpdate } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';

import { createSeededEntity, type SeedSource } from './registry';

/**
 * Seeded / AI content builders (PRD §21). ONE code path shared by the seed
 * script, the external REST API, and the MCP tools, so labelling + idempotency
 * are guaranteed everywhere:
 *
 *   * Every row carries a non-'member' `source` ('seed' | 'ai') → the UI labels
 *     it and the admin surface finds it.
 *   * Posts + listings are de-duplicated through the seed_entities registry
 *     (external idempotency keys / deterministic seed keys).
 *   * Tags + Lab templates de-duplicate on their natural unique key (name/slug).
 *   * NONE of these call award_reputation — seeded/AI content earns no
 *     reputation, so an AI account can never climb a human leaderboard (§14).
 *
 * Author impersonation is impossible: seeded posts are authored by the badged
 * AI-assistant account (see actor.ts), never a human member.
 */

function emitCreated(source: SeedSource, entityType: 'post' | 'listing' | 'lab' | 'tag', kind?: 'post' | 'digest' | 'summary') {
  emitServer(event('seeded_content_created', { entity_type: entityType, source }), {
    distinctId: 'seed',
  });
  if (source === 'ai') {
    emitServer(event('ai_content_created', { kind: kind ?? 'post' }), { distinctId: 'seed' });
  }
}

// ---------------------------------------------------------------------------
// Tags (natural key = name)
// ---------------------------------------------------------------------------
export async function createSeededTag(
  admin: SupabaseClient<Database>,
  args: { name: string; actorUserId?: string | null; source?: SeedSource },
): Promise<string> {
  const source = args.source ?? 'seed';
  // Idempotent on the unique citext name.
  const existing = await admin.from('tags').select('id').eq('name', args.name).maybeSingle();
  if (existing.data) return existing.data.id;

  const { data, error } = await admin
    .from('tags')
    .insert({ name: args.name, source, created_by_user_id: args.actorUserId ?? null })
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const raced = await admin.from('tags').select('id').eq('name', args.name).single();
      if (raced.error || !raced.data) throw new Error(`seeded tag re-read failed: ${raced.error?.message}`);
      return raced.data.id;
    }
    throw new Error(`seeded tag insert failed: ${error.message}`);
  }
  emitCreated(source, 'tag');
  return data!.id;
}

// ---------------------------------------------------------------------------
// Lab templates / playbooks (natural key = slug). This is the §21 "Lab
// templates" seed target — a charter starter, NOT a live build-in-public Lab.
// ---------------------------------------------------------------------------
export interface SeededPlaybookArgs {
  slug: string;
  name: string;
  ventureType: string;
  template?: Record<string, unknown>;
  actorUserId?: string | null;
  source?: SeedSource;
  isActive?: boolean;
}

export interface SeededPlaybookResult {
  playbookId: string;
  created: boolean;
}

export async function createSeededPlaybook(
  admin: SupabaseClient<Database>,
  args: SeededPlaybookArgs,
): Promise<SeededPlaybookResult> {
  const source = args.source ?? 'seed';
  const insert: TablesInsert<'lab_playbooks'> = {
    slug: args.slug,
    name: args.name,
    venture_type: args.ventureType,
    template: (args.template ?? {}) as Json,
    source,
    is_active: args.isActive ?? true,
    created_by_user_id: args.actorUserId ?? null,
  };
  // Upsert on slug so re-running updates rather than duplicates.
  const { data, error } = await admin
    .from('lab_playbooks')
    .upsert(insert, { onConflict: 'slug' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seeded playbook upsert failed: ${error?.message ?? 'no row'}`);
  emitCreated(source, 'lab');
  // "created" is best-effort here (upsert can't cheaply tell insert vs update);
  // callers that need the distinction check seed_entities, not playbooks.
  return { playbookId: data.id, created: true };
}

/** Update a seeded Lab template (playbook). Guarded to never touch a
 * member-authored playbook. Returns true if a seeded row was updated. */
export async function updateSeededPlaybook(
  admin: SupabaseClient<Database>,
  playbookId: string,
  patch: {
    name?: string | undefined;
    ventureType?: string | undefined;
    template?: Record<string, unknown> | undefined;
    isActive?: boolean | undefined;
  },
): Promise<boolean> {
  const update: TablesUpdate<'lab_playbooks'> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.ventureType !== undefined) update.venture_type = patch.ventureType;
  if (patch.template !== undefined) update.template = patch.template as Json;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (Object.keys(update).length === 0) return false;

  const { data, error } = await admin
    .from('lab_playbooks')
    .update(update)
    .eq('id', playbookId)
    .neq('source', 'member')
    .select('id');
  if (error) throw new Error(`seeded playbook update failed: ${error.message}`);
  const ok = (data ?? []).length > 0;
  if (ok) emitServer(event('seeded_content_updated', { entity_type: 'lab' }), { distinctId: 'seed' });
  return ok;
}

// ---------------------------------------------------------------------------
// Plaza posts (registry-keyed idempotency)
// ---------------------------------------------------------------------------
export type SeededPostType = 'intro' | 'ask' | 'win' | 'update';

export interface SeededPostArgs {
  actorUserId: string;
  source: SeedSource;
  dedupKey: string;
  seedRunId?: string | null;
  apiKeyId?: string | null;
  type: SeededPostType;
  title?: string | null;
  body: string;
  linkUrl?: string | null;
  tagIds?: string[];
  labId?: string | null;
  /** Set the weekly-highlights pin (used by the digest post). */
  pinned?: boolean;
}

export interface SeededPostResult {
  postId: string;
  created: boolean;
}

export async function createSeededPost(
  admin: SupabaseClient<Database>,
  args: SeededPostArgs,
): Promise<SeededPostResult> {
  const result = await createSeededEntity(admin, {
    dedupKey: args.dedupKey,
    entityType: 'post',
    source: args.source,
    seedRunId: args.seedRunId ?? null,
    apiKeyId: args.apiKeyId ?? null,
    create: async () => {
      const insert: TablesInsert<'posts'> = {
        author_user_id: args.actorUserId,
        type: args.type,
        title: args.title ?? null,
        body: args.body,
        link_url: args.linkUrl ?? null,
        source: args.source,
        lab_id: args.labId ?? null,
      };
      if (args.type === 'ask') insert.ask_status = 'open';
      if (args.pinned) insert.pinned_at = new Date().toISOString();

      const { data, error } = await admin.from('posts').insert(insert).select('id').single();
      if (error || !data) throw new Error(`seeded post insert failed: ${error?.message ?? 'no row'}`);

      const tagIds = [...new Set(args.tagIds ?? [])];
      if (tagIds.length > 0) {
        const { error: tagError } = await admin
          .from('post_tags')
          .insert(tagIds.map((tagId) => ({ post_id: data.id, tag_id: tagId })));
        if (tagError) throw new Error(`seeded post tags insert failed: ${tagError.message}`);
      }
      return data.id;
    },
  });
  if (result.created) {
    emitCreated(args.source, 'post', args.pinned ? 'digest' : 'post');
  }
  return { postId: result.entityId, created: result.created };
}

// ---------------------------------------------------------------------------
// Business listings (registry-keyed idempotency; unclaimed by default)
// ---------------------------------------------------------------------------
export interface SeededListingArgs {
  source: SeedSource;
  dedupKey: string;
  seedRunId?: string | null;
  apiKeyId?: string | null;
  businessName: string;
  categoryId: string;
  shortDescription?: string | null;
  city?: string | null;
  country?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contactLinks?: Array<{ type: string; label?: string; value: string }>;
  tagIds?: string[];
}

export interface SeededListingResult {
  listingId: string;
  created: boolean;
}

export async function createSeededListing(
  admin: SupabaseClient<Database>,
  args: SeededListingArgs,
): Promise<SeededListingResult> {
  const result = await createSeededEntity(admin, {
    dedupKey: args.dedupKey,
    entityType: 'listing',
    source: args.source,
    seedRunId: args.seedRunId ?? null,
    apiKeyId: args.apiKeyId ?? null,
    create: async () => {
      const insert: TablesInsert<'business_listings'> = {
        // Unclaimed: real owners can claim seeded listings via the §18 flow.
        owner_user_id: null,
        business_name: args.businessName,
        category_id: args.categoryId,
        short_description: args.shortDescription ?? null,
        city: args.city ?? null,
        country: args.country ?? null,
        landmark: args.landmark ?? null,
        latitude: args.latitude ?? null,
        longitude: args.longitude ?? null,
        contact_links: (args.contactLinks ?? []) as Json,
        source: args.source,
      };
      const { data, error } = await admin
        .from('business_listings')
        .insert(insert)
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(`seeded listing insert failed: ${error?.message ?? 'no row'}`);
      }
      const tagIds = [...new Set(args.tagIds ?? [])];
      if (tagIds.length > 0) {
        const { error: tagError } = await admin
          .from('listing_tags')
          .insert(tagIds.map((tagId) => ({ listing_id: data.id, tag_id: tagId })));
        if (tagError) throw new Error(`seeded listing tags insert failed: ${tagError.message}`);
      }
      return data.id;
    },
  });
  if (result.created) emitCreated(args.source, 'listing');
  return { listingId: result.entityId, created: result.created };
}

/** Update a seeded listing's mutable fields (external PATCH). Only touches
 * rows that are actually seeded — never a real member's listing. */
export async function updateSeededListing(
  admin: SupabaseClient<Database>,
  listingId: string,
  patch: {
    shortDescription?: string | null | undefined;
    city?: string | null | undefined;
    country?: string | null | undefined;
    landmark?: string | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
  },
): Promise<boolean> {
  const update: TablesUpdate<'business_listings'> = {};
  if (patch.shortDescription !== undefined) update.short_description = patch.shortDescription;
  if (patch.city !== undefined) update.city = patch.city;
  if (patch.country !== undefined) update.country = patch.country;
  if (patch.landmark !== undefined) update.landmark = patch.landmark;
  if (patch.latitude !== undefined) update.latitude = patch.latitude;
  if (patch.longitude !== undefined) update.longitude = patch.longitude;
  if (Object.keys(update).length === 0) return false;

  const { data, error } = await admin
    .from('business_listings')
    .update(update)
    .eq('id', listingId)
    .neq('source', 'member') // never mutate a real member's listing…
    .is('owner_user_id', null) // …and never one a member has since CLAIMED
    .select('id');
  if (error) throw new Error(`seeded listing update failed: ${error.message}`);
  const ok = (data ?? []).length > 0;
  if (ok) emitServer(event('seeded_content_updated', { entity_type: 'listing' }), { distinctId: 'seed' });
  return ok;
}
