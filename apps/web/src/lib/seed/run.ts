import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { issueSignupGrant } from '@/lib/auth/grants';

import { AI_ASSISTANT, getSeedActorUserId } from './actor';
import {
  createSeededListing,
  createSeededPlaybook,
  createSeededPost,
  createSeededTag,
} from './content';
import {
  AI_ASSISTANT_EMAIL,
  SEED_LISTINGS,
  SEED_PLAYBOOKS,
  SEED_POSTS,
  SEED_RUN_LABEL,
  SEED_TAGS,
} from './data';
import { ensureSeedRun } from './registry';

/**
 * Seed orchestration (PRD §21). Idempotent end-to-end: provisions the badged
 * AI-assistant account, records a named seed run, then seeds tags, Lab
 * templates, Plaza posts and starter listings — all through the shared,
 * label-safe content builders. Re-running is a no-op (deterministic dedup
 * keys). `resetSeed` tears a run's content back down for local/staging.
 *
 * This runs as the SERVICE ROLE (from the admin seed route or the CLI wrapper).
 */

/**
 * Find-or-create the AI-assistant user. Uses the signup-grant path (a grant +
 * admin createUser) rather than the app_metadata gate-bypass, which is the
 * combination verified to work on real GoTrue. Idempotent on the handle.
 */
export async function provisionAiAssistant(admin: SupabaseClient<Database>): Promise<string> {
  const existing = await admin
    .from('profiles')
    .select('user_id')
    .eq('handle', AI_ASSISTANT.handle)
    .maybeSingle();
  if (existing.error) throw new Error(`AI account lookup failed: ${existing.error.message}`);
  if (existing.data) {
    // Defensive: make sure the AI flag is set (drives labelling + reputation block).
    await admin.from('users').update({ is_ai: true }).eq('id', existing.data.user_id);
    return existing.data.user_id;
  }

  await issueSignupGrant(admin, { email: AI_ASSISTANT_EMAIL });
  const { data: created, error } = await admin.auth.admin.createUser({
    email: AI_ASSISTANT_EMAIL,
    email_confirm: true,
  });
  if (error || !created?.user) {
    throw new Error(`AI account create failed: ${error?.message ?? 'no user returned'}`);
  }
  const userId = created.user.id;

  // The on_auth_user_created trigger has mirrored public.users + consumed the
  // grant. Flag the account AI and give it its labelled profile.
  const flag = await admin.from('users').update({ is_ai: true }).eq('id', userId);
  if (flag.error) throw new Error(`AI flag set failed: ${flag.error.message}`);

  const profile = await admin.from('profiles').insert({
    user_id: userId,
    display_name: AI_ASSISTANT.displayName,
    handle: AI_ASSISTANT.handle,
    bio: AI_ASSISTANT.bio,
  });
  if (profile.error) throw new Error(`AI profile create failed: ${profile.error.message}`);

  return userId;
}

export interface SeedSummary {
  actorUserId: string;
  seedRunId: string;
  tags: number;
  playbooks: number;
  posts: number;
  listings: number;
}

export async function runSeed(admin: SupabaseClient<Database>): Promise<SeedSummary> {
  const actorUserId = await provisionAiAssistant(admin);
  const seedRunId = await ensureSeedRun(admin, {
    label: SEED_RUN_LABEL,
    description: 'Launch-density seed: tags, Lab templates, Plaza posts, starter listings.',
    source: 'seed',
    actorUserId,
  });

  // Tags (idempotent on name).
  const tagIds = new Map<string, string>();
  for (const name of SEED_TAGS) {
    tagIds.set(name, await createSeededTag(admin, { name, actorUserId, source: 'seed' }));
  }

  // Lab templates / playbooks (idempotent on slug).
  for (const pb of SEED_PLAYBOOKS) {
    await createSeededPlaybook(admin, {
      slug: pb.slug,
      name: pb.name,
      ventureType: pb.ventureType,
      template: pb.template,
      actorUserId,
      source: 'seed',
    });
  }

  // Plaza posts (registry-keyed idempotency).
  for (const post of SEED_POSTS) {
    await createSeededPost(admin, {
      actorUserId,
      source: post.source,
      dedupKey: `seed:${SEED_RUN_LABEL}:post:${post.key}`,
      seedRunId,
      type: post.type,
      title: post.title,
      body: post.body,
      tagIds: (post.tags ?? []).map((t) => tagIds.get(t)).filter((x): x is string => Boolean(x)),
    });
  }

  // Starter listings (registry-keyed idempotency).
  for (const listing of SEED_LISTINGS) {
    const { data: category } = await admin
      .from('listing_categories')
      .select('id')
      .eq('slug', listing.categorySlug)
      .maybeSingle();
    if (!category) throw new Error(`seed listing category not found: ${listing.categorySlug}`);

    await createSeededListing(admin, {
      source: 'seed',
      dedupKey: `seed:${SEED_RUN_LABEL}:listing:${listing.key}`,
      seedRunId,
      businessName: listing.businessName,
      categoryId: category.id,
      shortDescription: listing.shortDescription,
      city: listing.city,
      country: listing.country,
      latitude: listing.latitude ?? null,
      longitude: listing.longitude ?? null,
      tagIds: (listing.tags ?? []).map((t) => tagIds.get(t)).filter((x): x is string => Boolean(x)),
    });
  }

  return {
    actorUserId,
    seedRunId,
    tags: SEED_TAGS.length,
    playbooks: SEED_PLAYBOOKS.length,
    posts: SEED_POSTS.length,
    listings: SEED_LISTINGS.length,
  };
}

export interface ResetSummary {
  posts: number;
  listings: number;
  playbooks: number;
}

/**
 * Tear down a seed run's content (local/staging only). Deletes the registered
 * posts + listings and the demo playbooks, then the run (cascading its
 * registry rows). Leaves shared tags and the AI account intact (reusable).
 */
export async function resetSeed(admin: SupabaseClient<Database>): Promise<ResetSummary> {
  const run = await admin.from('seed_runs').select('id').eq('label', SEED_RUN_LABEL).maybeSingle();
  if (run.error) throw new Error(`seed run lookup failed: ${run.error.message}`);
  if (!run.data) return { posts: 0, listings: 0, playbooks: 0 };

  const entities = await admin
    .from('seed_entities')
    .select('entity_type, entity_id')
    .eq('seed_run_id', run.data.id)
    .not('entity_id', 'is', null);
  if (entities.error) throw new Error(`seed entities lookup failed: ${entities.error.message}`);

  const postIds = (entities.data ?? [])
    .filter((e) => e.entity_type === 'post' && e.entity_id)
    .map((e) => e.entity_id as string);
  const listingIds = (entities.data ?? [])
    .filter((e) => e.entity_type === 'listing' && e.entity_id)
    .map((e) => e.entity_id as string);

  if (postIds.length > 0) {
    const { error } = await admin.from('posts').delete().in('id', postIds);
    if (error) throw new Error(`seed post delete failed: ${error.message}`);
  }
  if (listingIds.length > 0) {
    const { error } = await admin.from('business_listings').delete().in('id', listingIds);
    if (error) throw new Error(`seed listing delete failed: ${error.message}`);
  }

  // Demo playbooks (never a member-authored one).
  const slugs = SEED_PLAYBOOKS.map((p) => p.slug);
  const pb = await admin
    .from('lab_playbooks')
    .delete()
    .in('slug', slugs)
    .neq('source', 'member')
    .select('id');
  if (pb.error) throw new Error(`seed playbook delete failed: ${pb.error.message}`);

  // Drop the run (cascade removes its seed_entities rows).
  const { error: runDelError } = await admin.from('seed_runs').delete().eq('id', run.data.id);
  if (runDelError) throw new Error(`seed run delete failed: ${runDelError.message}`);

  return { posts: postIds.length, listings: listingIds.length, playbooks: (pb.data ?? []).length };
}

/** Re-export so the seed route can resolve the actor without a second import. */
export { getSeedActorUserId };
