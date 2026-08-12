import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums, Json } from '@xidig/db';

import { recordSignupConsents } from '@/lib/auth/consent';
import { issueSignupGrant } from '@/lib/auth/grants';
import { awardBadge } from '@/lib/reputation/service';

import { provisionAiAssistant } from '../run';

import { uploadPersonaMedia, uploadPostImage } from './avatars';
import {
  CANDIDATE_COPY,
  DM_THREADS,
  EVENTS,
  HITL_REVIEWS,
  LAB_ARTIFACTS,
  LAB_DECISIONS,
  LAB_UPDATES,
  LISTINGS,
  MODERATION_CASES,
  THREADS,
} from './content';
import {
  DM_THREADS_2,
  HITL_REVIEWS_2,
  LAB_ARTIFACTS_2,
  LAB_DECISIONS_2,
  LAB_UPDATES_2,
  MODERATION_CASES_2,
  THREADS_2,
  WAVE1_IMAGE_BACKFILL,
} from './content-wave2';
import {
  buildFollowEdges,
  CANDIDATE_FOLLOWS,
  ENDORSEMENTS,
  LAB_FOLLOWS,
  TAG_FOLLOWS,
  VOUCHES,
} from './graph';
import {
  getTestCommunityPassword,
  PERSONAS_BY_HANDLE,
  TEST_AI_HELPERS,
  TEST_COMMUNITY_LABEL,
  TEST_PERSONAS,
  testEmail,
  type TestPersona,
} from './personas';
import { CANDIDATE_META, SEED_COLLABORATION, SEED_SPACES, SEED_SPACES_WAVE2, type SeedSpace } from './spaces';
import type {
  HitlReview,
  ModerationCase,
  ModerationTarget,
  SeedComment,
  SeedDmThread,
  SeedLabArtifact,
  SeedLabDecision,
  SeedLabUpdate,
  SeedThread,
} from './types';

/**
 * TEST-COMMUNITY seeder (pre-launch test phase).
 *
 * Populates a NON-PRODUCTION database with a believable miniature society:
 * 60 personas + labelled AI helpers, Plaza threads, Spaces, Capital
 * candidates, DMs, notifications, moderation cases, follows, reputation and
 * media. Everything runs as the service role through the same verified
 * provisioning path as the launch seed (signup grant → admin.createUser).
 *
 * Idempotency model (deliberately different from the launch-density seed —
 * fake members must never enter the `seed_entities` registry):
 *  - accounts/profiles/media are skip-if-exists (safe to re-run any time);
 *  - the CONTENT phase runs once, guarded by a `seed_runs` marker row with
 *    label 'test-community-v1' (marker only — no seed_entities rows). A
 *    failed run leaves the marker; reset + re-run is the recovery path.
 */

type Admin = SupabaseClient<Database>;

const DAY_MS = 86_400_000;

interface Ctx {
  admin: Admin;
  now: number;
  /** handle → user id (personas + AI helpers + xidig_ai). */
  ids: Map<string, string>;
  /** tag name → id. */
  tagIds: Map<string, string>;
  /** lab slug → id. */
  labIds: Map<string, string>;
  /** thread key → post id. */
  postIds: Map<string, string>;
  /** `${threadKey}#${commentIndex}` → comment id. */
  commentIds: Map<string, string>;
  /** dm key → conversation id; `${dmKey}#${index}` → message id. */
  dmIds: Map<string, string>;
  candidateIds: Map<string, string>;
  listingIds: Map<string, string>;
  reputation: {
    userId: string;
    eventType: string;
    points: number;
    scoreClass: 'contribution' | 'helper';
    entityType: Enums<'entity_type'>;
    entityId: string;
    createdAt: string;
  }[];
  counts: Record<string, number>;
}

function iso(ctx: Ctx, daysAgo: number): string {
  return new Date(ctx.now - daysAgo * DAY_MS).toISOString();
}

function bump(ctx: Ctx, key: string, by = 1): void {
  ctx.counts[key] = (ctx.counts[key] ?? 0) + by;
}

function uid(ctx: Ctx, handle: string): string {
  const id = ctx.ids.get(handle);
  if (!id) throw new Error(`test-community: unknown handle "${handle}"`);
  return id;
}

/** Batch insert; on a duplicate-key failure retries row-by-row ignoring dupes. */
async function insertMany<T extends keyof Database['public']['Tables']>(
  ctx: Ctx,
  table: T,
  rows: Database['public']['Tables'][T]['Insert'][],
): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await ctx.admin.from(table).insert(chunk as never);
    if (!error) continue;
    if (error.code !== '23505') throw new Error(`${String(table)} insert failed: ${error.message}`);
    for (const row of chunk) {
      const single = await ctx.admin.from(table).insert(row as never);
      if (single.error && single.error.code !== '23505') {
        throw new Error(`${String(table)} insert failed: ${single.error.message}`);
      }
    }
  }
}

/** How long ago this persona "joined" (drives users/profiles.created_at). */
function joinDaysAgo(p: TestPersona): number {
  if (p.handle === 'tuute_cusub') return 1;
  if (p.handle === 'arday_hargeisa') return 2.5;
  let h = 0;
  for (const c of p.handle) h = (h * 31 + c.charCodeAt(0)) | 0;
  return 21 + (Math.abs(h) % 60) / 10; // 21–27 days ago, before all content
}

// ─────────────────────────────────────────────────────────────── accounts ──

async function createAuthAccount(ctx: Ctx, email: string): Promise<string> {
  await issueSignupGrant(ctx.admin, { email });
  const res = await ctx.admin.auth.admin.createUser({
    email,
    password: getTestCommunityPassword(),
    email_confirm: true,
  });
  if (res.error || !res.data?.user) {
    throw new Error(`createUser(${email}) failed: ${res.error?.message ?? 'no user returned'}`);
  }
  return res.data.user.id;
}

/** Existing accounts get their password reset to the documented one, so the
 * generated README is always correct even after the convention changes. */
async function resetPassword(ctx: Ctx, userId: string, handle: string): Promise<void> {
  const { error } = await ctx.admin.auth.admin.updateUserById(userId, {
    password: getTestCommunityPassword(),
  });
  if (error) console.warn(`[test-community] password reset failed for ${handle}:`, error.message);
}

async function ensurePersona(ctx: Ctx, p: TestPersona): Promise<{ created: boolean }> {
  const existing = await ctx.admin
    .from('profiles')
    .select('user_id')
    .eq('handle', p.handle)
    .maybeSingle();
  if (existing.error) throw new Error(`profile lookup failed: ${existing.error.message}`);
  if (existing.data) {
    ctx.ids.set(p.handle, existing.data.user_id);
    await resetPassword(ctx, existing.data.user_id, p.handle);
    return { created: false };
  }

  const userId = await createAuthAccount(ctx, testEmail(p.handle));
  ctx.ids.set(p.handle, userId);
  const joinedAt = iso(ctx, joinDaysAgo(p));

  const userPatch = await ctx.admin
    .from('users')
    .update({
      role: p.role,
      preferred_language: p.preferredLanguage,
      low_bandwidth_enabled: p.lowBandwidth,
      onboarding_state: (p.completeness === 'bare' ? {} : { profileCompleted: true }) as Json,
      created_at: joinedAt,
    })
    .eq('id', userId);
  if (userPatch.error) throw new Error(`users patch failed: ${userPatch.error.message}`);

  const profile = await ctx.admin.from('profiles').insert({
    user_id: userId,
    display_name: p.displayName,
    handle: p.handle,
    bio: p.bio,
    location_city: p.locationCity,
    location_country: p.locationCountry,
    timezone: p.timezone,
    skills: p.skills,
    lanes: p.lanes,
    membership_tier_id: p.membershipTier,
    verification_status: p.verification,
    region_attested_at: p.locationCountry === 'SO' && p.openTo.includes('investing') ? joinedAt : null,
    created_at: joinedAt,
  });
  if (profile.error) throw new Error(`profile insert (${p.handle}) failed: ${profile.error.message}`);

  if (p.openTo.length > 0) {
    await insertMany(
      ctx,
      'profile_open_to',
      p.openTo.map((kind) => ({ user_id: userId, open_to_id: kind })),
    );
  }

  await recordSignupConsents(ctx.admin, userId);
  if (p.activity === 'high' || p.activity === 'medium') {
    await insertMany(ctx, 'consent_records', [
      { user_id: userId, consent_type: 'analytics', version: '1', method: 'signup' },
    ]);
  }

  return { created: true };
}

async function ensureAiHelpers(ctx: Ctx): Promise<void> {
  // The standard AI actor first (idempotent, existing plumbing).
  const xidigAiId = await provisionAiAssistant(ctx.admin);
  ctx.ids.set('xidig_ai', xidigAiId);

  for (const helper of TEST_AI_HELPERS) {
    const existing = await ctx.admin
      .from('profiles')
      .select('user_id')
      .eq('handle', helper.handle)
      .maybeSingle();
    if (existing.data) {
      ctx.ids.set(helper.handle, existing.data.user_id);
      await resetPassword(ctx, existing.data.user_id, helper.handle);
      continue;
    }
    const userId = await createAuthAccount(ctx, testEmail(helper.handle));
    ctx.ids.set(helper.handle, userId);

    const flag = await ctx.admin
      .from('users')
      .update({ is_ai: true, preferred_language: helper.preferredLanguage })
      .eq('id', userId);
    if (flag.error) throw new Error(`AI flag failed: ${flag.error.message}`);

    const profile = await ctx.admin.from('profiles').insert({
      user_id: userId,
      display_name: helper.displayName,
      handle: helper.handle,
      bio: helper.bio,
    });
    if (profile.error) throw new Error(`AI profile failed: ${profile.error.message}`);
    bump(ctx, 'aiHelpers');
  }
}

async function ensureMedia(ctx: Ctx): Promise<void> {
  // AI helpers get distinct labelled-bot art too; xidig_ai keeps app defaults.
  const subjects: { handle: string; displayName: string; hasAvatar: boolean; hasBanner: boolean }[] = [
    ...TEST_PERSONAS,
    ...TEST_AI_HELPERS.map((h) => ({ handle: h.handle, displayName: h.displayName, hasAvatar: true, hasBanner: true })),
  ];
  for (const p of subjects) {
    if (!p.hasAvatar && !p.hasBanner) continue;
    const userId = uid(ctx, p.handle);
    // Deterministic paths + upsert semantics: re-runs re-render and overwrite,
    // so art upgrades roll out with a plain re-seed.
    const patch: {
      avatar_path?: string;
      avatar_blurhash?: string | null;
      cover_path?: string;
      cover_blurhash?: string | null;
    } = {};
    if (p.hasAvatar) {
      const media = await uploadPersonaMedia(ctx.admin, {
        userId,
        handle: p.handle,
        displayName: p.displayName,
        kind: 'avatar',
      });
      if (media) {
        patch.avatar_path = media.path;
        patch.avatar_blurhash = media.blurhash;
        bump(ctx, 'avatars');
      }
    }
    if (p.hasBanner) {
      const media = await uploadPersonaMedia(ctx.admin, {
        userId,
        handle: p.handle,
        displayName: p.displayName,
        kind: 'cover',
      });
      if (media) {
        patch.cover_path = media.path;
        patch.cover_blurhash = media.blurhash;
        bump(ctx, 'banners');
      }
    }
    if (Object.keys(patch).length > 0) {
      await ctx.admin.from('profiles').update(patch).eq('user_id', userId);
    }
  }
}

// ───────────────────────────────────────────────────────────────── content ──

async function ensureTags(ctx: Ctx): Promise<void> {
  const wanted = new Set<string>(Object.keys(TAG_FOLLOWS));
  for (const t of THREADS) t.tags.forEach((x) => wanted.add(x));
  for (const l of LISTINGS) (l.tags ?? []).forEach((x) => wanted.add(x));

  const existing = await ctx.admin.from('tags').select('id, name');
  if (existing.error) throw new Error(`tags lookup failed: ${existing.error.message}`);
  for (const row of existing.data ?? []) ctx.tagIds.set(row.name, row.id);

  for (const name of wanted) {
    if (ctx.tagIds.has(name)) continue;
    const { data, error } = await ctx.admin
      .from('tags')
      .insert({ name, source: 'seed' })
      .select('id')
      .single();
    if (error) throw new Error(`tag create (${name}) failed: ${error.message}`);
    ctx.tagIds.set(name, data.id);
    bump(ctx, 'tags');
  }
}

async function seedSpaceList(ctx: Ctx, spaces: SeedSpace[]): Promise<void> {
  for (const space of spaces) {
    const existing = await ctx.admin.from('labs').select('id').eq('slug', space.slug).maybeSingle();
    if (existing.error) throw new Error(`lab lookup (${space.slug}) failed: ${existing.error.message}`);
    if (existing.data) {
      ctx.labIds.set(space.slug, existing.data.id);
      continue;
    }
    const leadId = uid(ctx, space.leadHandle);
    const createdAt = iso(ctx, space.createdDaysAgo);
    const { data: lab, error } = await ctx.admin
      .from('labs')
      .insert({
        slug: space.slug,
        name: space.name,
        short_description: space.shortDescription,
        space_mode: space.spaceMode,
        visibility: space.visibility,
        member_list_visibility: space.memberListVisibility,
        is_supporter_only: space.isSupporterOnly,
        is_listed: space.isListed,
        join_mode: space.joinMode,
        stage: space.stage,
        lead_user_id: leadId,
        problem_statement: space.charter?.problemStatement ?? null,
        hypothesis: space.charter?.hypothesis ?? null,
        success_definition: space.charter?.successDefinition ?? null,
        charter_completed_at: space.charter ? createdAt : null,
        promoted_at: space.spaceMode === 'lab' ? iso(ctx, space.promotedDaysAgo ?? space.createdDaysAgo) : null,
        created_at: createdAt,
        last_activity_at: iso(ctx, space.lastActivityDaysAgo ?? space.createdDaysAgo),
        dormant_since: space.dormantSinceDaysAgo !== undefined ? iso(ctx, space.dormantSinceDaysAgo) : null,
      })
      .select('id')
      .single();
    if (error) throw new Error(`lab insert (${space.slug}) failed: ${error.message}`);
    ctx.labIds.set(space.slug, lab.id);
    bump(ctx, 'spaces');

    await insertMany(
      ctx,
      'lab_members',
      space.members.map((m) => ({
        lab_id: lab.id,
        user_id: uid(ctx, m.handle),
        role: m.role,
        specialization: m.specialization ?? null,
        status: m.status ?? 'active',
        joined_at: (m.status ?? 'active') === 'active' ? iso(ctx, Math.max(space.createdDaysAgo - 0.5, 0.5)) : null,
        requested_at: m.status === 'requested' ? iso(ctx, 1.5) : null,
        created_at: iso(ctx, Math.max(space.createdDaysAgo - 0.5, 0.5)),
      })),
    );
    await insertMany(
      ctx,
      'lab_skill_needs',
      space.skillNeeds.map((skill) => ({ lab_id: lab.id, skill, created_at: createdAt })),
    );
    await insertMany(ctx, 'lab_events', [
      {
        lab_id: lab.id,
        actor_user_id: leadId,
        event_type: 'created',
        metadata: { seed: TEST_COMMUNITY_LABEL } as Json,
        created_at: createdAt,
      },
      ...(space.promotedDaysAgo !== undefined
        ? [
            {
              lab_id: lab.id,
              actor_user_id: leadId,
              event_type: 'promoted',
              metadata: {} as Json,
              created_at: iso(ctx, space.promotedDaysAgo),
            },
          ]
        : []),
    ]);
  }
}

async function seedSpaces(ctx: Ctx): Promise<void> {
  await seedSpaceList(ctx, SEED_SPACES);

  const collab = await ctx.admin
    .from('lab_collaborations')
    .insert({
      lab_a_id: ctx.labIds.get(SEED_COLLABORATION.labASlug)!,
      lab_b_id: ctx.labIds.get(SEED_COLLABORATION.labBSlug)!,
      status: 'accepted',
      proposed_by_user_id: uid(ctx, SEED_COLLABORATION.proposedByHandle),
      created_at: iso(ctx, SEED_COLLABORATION.proposedDaysAgo),
      responded_at: iso(ctx, SEED_COLLABORATION.respondedDaysAgo),
    })
    .select('id')
    .single();
  if (collab.error) throw new Error(`collaboration insert failed: ${collab.error.message}`);
  ctx.dmIds.set('collab:main', collab.data.id);
}

async function seedLabContent(
  ctx: Ctx,
  updates: SeedLabUpdate[],
  artifacts: SeedLabArtifact[],
  decisions: SeedLabDecision[],
): Promise<void> {
  const collabId = ctx.dmIds.get('collab:main') ?? null;

  for (const u of updates) {
    const labId = ctx.labIds.get(u.labSlug);
    if (!labId) continue;
    const authorId = uid(ctx, u.authorHandle);
    const createdAt = iso(ctx, u.daysAgo);
    const { data, error } = await ctx.admin
      .from('lab_updates')
      .insert({
        lab_id: labId,
        author_user_id: authorId,
        title: u.title,
        body: u.body,
        source: u.source ?? 'member',
        collaboration_id: u.collaboration ? collabId : null,
        created_at: createdAt,
      })
      .select('id')
      .single();
    if (error) throw new Error(`lab_update failed: ${error.message}`);
    bump(ctx, 'labUpdates');

    // Cross-post the collaboration update into the partner space (mirrors addUpdate).
    if (u.collaboration && collabId) {
      const partnerSlug =
        u.labSlug === SEED_COLLABORATION.labASlug ? SEED_COLLABORATION.labBSlug : SEED_COLLABORATION.labASlug;
      const partnerId = ctx.labIds.get(partnerSlug);
      if (partnerId) {
        await ctx.admin.from('lab_updates').insert({
          lab_id: partnerId,
          author_user_id: authorId,
          title: u.title,
          body: u.body,
          source: u.source ?? 'member',
          collaboration_id: collabId,
          created_at: createdAt,
        });
        bump(ctx, 'labUpdates');
      }
    }

    if ((u.source ?? 'member') === 'member') {
      ctx.reputation.push({
        userId: authorId,
        eventType: 'lab_update_published',
        points: 5,
        scoreClass: 'contribution',
        entityType: 'lab_update',
        entityId: data.id,
        createdAt,
      });
    }

    // A recent update notifies a couple of fellow members (inbox variety).
    if (u.daysAgo <= 4) {
      const space = SEED_SPACES.find((s) => s.slug === u.labSlug);
      const others = (space?.members ?? [])
        .filter((m) => m.handle !== u.authorHandle && PERSONAS_BY_HANDLE.has(m.handle))
        .slice(0, 3);
      await insertMany(
        ctx,
        'notifications',
        others.map((m) => ({
          user_id: uid(ctx, m.handle),
          actor_user_id: authorId,
          type: 'lab_update',
          entity_type: 'lab_update' as const,
          entity_id: data.id,
          payload: { labSlug: u.labSlug, title: u.title } as Json,
          bundle_key: `lab_update:${labId}`,
          created_at: createdAt,
          read_at: u.daysAgo > 2 ? iso(ctx, u.daysAgo - 0.3) : null,
        })),
      );
    }
  }

  await insertMany(
    ctx,
    'lab_artifacts',
    artifacts.flatMap((a) => {
      const labId = ctx.labIds.get(a.labSlug);
      if (!labId) return [];
      return [
        {
          lab_id: labId,
          added_by_user_id: uid(ctx, a.addedByHandle),
          title: a.title,
          url: a.url,
          description: a.description,
        },
      ];
    }),
  );
  bump(ctx, 'labArtifacts', artifacts.length);

  await insertMany(
    ctx,
    'lab_decisions',
    decisions.flatMap((d) => {
      const labId = ctx.labIds.get(d.labSlug);
      if (!labId) return [];
      return [
        {
          lab_id: labId,
          created_by_user_id: uid(ctx, d.createdByHandle),
          title: d.title,
          context: d.context,
          decision: d.decision,
          decided_at: iso(ctx, d.daysAgo),
          created_at: iso(ctx, d.daysAgo),
        },
      ];
    }),
  );
  bump(ctx, 'labDecisions', decisions.length);
}

async function seedCandidates(ctx: Ctx): Promise<void> {
  // Candidate 1: submitted, live Supporter vote window.
  const meta = CANDIDATE_META.xawilaad;
  const copy = CANDIDATE_COPY.xawilaad;
  const submittedAt = iso(ctx, meta.submittedDaysAgo);
  const { data: cand, error } = await ctx.admin
    .from('venture_candidates')
    .insert({
      lab_id: ctx.labIds.get(meta.labSlug)!,
      created_by_user_id: uid(ctx, meta.createdByHandle),
      name: copy.name,
      one_liner: copy.oneLiner,
      problem: copy.problem,
      solution: copy.solution,
      traction: copy.traction,
      team: copy.team,
      ask: copy.ask,
      status: meta.status,
      visibility: meta.visibility,
      region_gated: meta.regionGated,
      timeline_public: meta.timelinePublic,
      submitted_at: submittedAt,
      vote_opens_at: submittedAt,
      vote_closes_at: iso(ctx, meta.submittedDaysAgo - 7),
      created_at: iso(ctx, meta.submittedDaysAgo + 4),
    })
    .select('id')
    .single();
  if (error) throw new Error(`candidate insert failed: ${error.message}`);
  ctx.candidateIds.set('xawilaad', cand.id);
  bump(ctx, 'candidates');

  await insertMany(
    ctx,
    'candidate_reviews',
    meta.reviews.map((r) => ({
      candidate_id: cand.id,
      reviewer_user_id: uid(ctx, r.reviewerHandle),
      team_score: r.team,
      traction_score: r.traction,
      feasibility_score: r.feasibility,
      notes: r.notes,
    })),
  );
  const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
  await ctx.admin
    .from('venture_candidates')
    .update({
      rubric_team_score: mean(meta.reviews.map((r) => r.team)),
      rubric_traction_score: mean(meta.reviews.map((r) => r.traction)),
      rubric_feasibility_score: mean(meta.reviews.map((r) => r.feasibility)),
      status: 'in_review',
    })
    .eq('id', cand.id);

  await insertMany(
    ctx,
    'candidate_votes',
    meta.votes.map((v) => ({
      candidate_id: cand.id,
      voter_user_id: uid(ctx, v.handle),
      vote: v.vote,
      created_at: iso(ctx, Math.max(meta.submittedDaysAgo - 2, 0.2)),
    })),
  );
  await insertMany(ctx, 'interests', [
    ...meta.helpInterests.map((h) => ({
      candidate_id: cand.id,
      user_id: uid(ctx, h),
      type: 'help' as const,
      message: null,
    })),
    ...meta.cosignInterests.map((h) => ({
      candidate_id: cand.id,
      user_id: uid(ctx, h),
      type: 'cosign' as const,
      message: null,
    })),
    ...meta.investGranted.map((h) => ({
      candidate_id: cand.id,
      user_id: uid(ctx, h),
      type: 'invest' as const,
      message: 'Maalgeli intent (test community)',
    })),
  ]);

  // Region-gate compliance log: one granted, one denied evaluation.
  await insertMany(ctx, 'capital_gate_evaluations', [
    ...meta.investGranted.map((h) => ({
      user_id: uid(ctx, h),
      profile_country: 'SO',
      geo_ip_country: 'SO',
      attested: true,
      granted: true,
      reason: 'granted',
      candidate_id: cand.id,
    })),
    ...meta.investDenied.map((d) => ({
      user_id: uid(ctx, d.handle),
      profile_country: d.profileCountry,
      geo_ip_country: d.profileCountry,
      attested: true,
      granted: false,
      reason: d.reason,
      candidate_id: cand.id,
    })),
  ]);

  // Candidate 2: a draft only lab members/creator/mods can see.
  const draft = await ctx.admin
    .from('venture_candidates')
    .insert({
      lab_id: ctx.labIds.get(CANDIDATE_META.hooyo.labSlug)!,
      created_by_user_id: uid(ctx, CANDIDATE_META.hooyo.createdByHandle),
      name: CANDIDATE_COPY.hooyo.name,
      one_liner: CANDIDATE_COPY.hooyo.oneLiner,
      problem: CANDIDATE_COPY.hooyo.problem,
      solution: CANDIDATE_COPY.hooyo.solution,
      traction: CANDIDATE_COPY.hooyo.traction,
      team: CANDIDATE_COPY.hooyo.team,
      ask: CANDIDATE_COPY.hooyo.ask,
      status: 'draft',
      visibility: CANDIDATE_META.hooyo.visibility,
      region_gated: CANDIDATE_META.hooyo.regionGated,
      timeline_public: CANDIDATE_META.hooyo.timelinePublic,
      created_at: iso(ctx, 2),
    })
    .select('id')
    .single();
  if (draft.error) throw new Error(`draft candidate failed: ${draft.error.message}`);
  ctx.candidateIds.set('hooyo', draft.data.id);
  bump(ctx, 'candidates');
}

const HANDLE_SET = new Set([...TEST_PERSONAS.map((p) => p.handle), ...TEST_AI_HELPERS.map((h) => h.handle), 'xidig_ai']);

function mentionedHandles(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/(?:^|[^a-z0-9_@])@([a-z0-9_]{3,30})/gi)) {
    const handle = m[1]!.toLowerCase();
    if (HANDLE_SET.has(handle)) out.add(handle);
  }
  return [...out];
}

/** Normalise comment times: strictly after the post, in listed order. */
function commentTimes(thread: SeedThread): number[] {
  let prev = thread.daysAgo;
  return thread.comments.map((c) => {
    let d = Math.min(c.daysAgo, prev - 0.02);
    if (d <= 0.01) d = Math.max(prev * 0.5, 0.01);
    prev = d;
    return d;
  });
}

async function seedThread(ctx: Ctx, thread: SeedThread): Promise<void> {
  const authorId = uid(ctx, thread.authorHandle);
  const createdAt = iso(ctx, thread.daysAgo);
  const isAsk = thread.type === 'ask';
  const hasCredit = thread.comments.some((c) => c.credited);
  const source = thread.source ?? (thread.authorHandle.endsWith('_ai') ? 'ai' : 'member');

  const { data: post, error } = await ctx.admin
    .from('posts')
    .insert({
      author_user_id: authorId,
      type: thread.type,
      title: thread.title,
      body: thread.body,
      source,
      status: thread.status ?? 'published',
      ask_status: isAsk ? (hasCredit ? 'answered' : (thread.askStatus ?? 'open')) : null,
      poll_status: thread.type === 'poll' ? (thread.poll && thread.poll.closesInDays < 0 ? 'closed' : 'open') : null,
      poll_closes_at:
        thread.type === 'poll' && thread.poll ? iso(ctx, -thread.poll.closesInDays) : null,
      pinned_at: thread.pinned ? iso(ctx, Math.max(thread.daysAgo - 0.05, 0.01)) : null,
      created_at: createdAt,
    })
    .select('id')
    .single();
  if (error) throw new Error(`post insert (${thread.key}) failed: ${error.message}`);
  ctx.postIds.set(thread.key, post.id);
  bump(ctx, 'posts');

  if (thread.image) {
    const path = await uploadPostImage(ctx.admin, {
      userId: authorId,
      postId: post.id,
      threadKey: thread.key,
      scene: thread.image.scene,
      alt: thread.image.alt,
    });
    if (path) {
      // image_urls holds STORAGE PATHS (the view builder resolves the URL).
      await ctx.admin.from('posts').update({ image_urls: [path] }).eq('id', post.id);
      bump(ctx, 'postImages');
    }
  }

  if (source === 'member' && (thread.status ?? 'published') === 'published') {
    ctx.reputation.push({
      userId: authorId,
      eventType: 'post_created',
      points: 5,
      scoreClass: 'contribution',
      entityType: 'post',
      entityId: post.id,
      createdAt,
    });
  }

  await insertMany(
    ctx,
    'post_tags',
    thread.tags.flatMap((t) => {
      const tagId = ctx.tagIds.get(t);
      return tagId ? [{ post_id: post.id, tag_id: tagId }] : [];
    }),
  );

  if (thread.type === 'poll' && thread.poll) {
    const optionRows = thread.poll.options.map((label, position) => ({
      post_id: post.id,
      post_type: 'poll' as const,
      label,
      position,
    }));
    const options = await ctx.admin.from('poll_options').insert(optionRows).select('id, position');
    if (options.error) throw new Error(`poll options failed: ${options.error.message}`);
    const byPosition = new Map(options.data.map((o) => [o.position, o.id]));
    await insertMany(
      ctx,
      'poll_votes',
      thread.poll.votes.flatMap((v) => {
        const optionId = byPosition.get(v.option);
        if (!optionId) return [];
        return [
          {
            post_id: post.id,
            poll_option_id: optionId,
            voter_user_id: uid(ctx, v.handle),
            created_at: iso(ctx, Math.max(thread.daysAgo - 0.2, 0.05)),
          },
        ];
      }),
    );
    bump(ctx, 'pollVotes', thread.poll.votes.length);
  }

  // Comments (+ credited answer, reactions, notifications, mentions).
  const times = commentTimes(thread);
  const notified = new Set<string>([thread.authorHandle]);
  for (let i = 0; i < thread.comments.length; i++) {
    const c: SeedComment = thread.comments[i]!;
    const commentAuthorId = uid(ctx, c.authorHandle);
    const commentAt = iso(ctx, times[i]!);
    const commentSource = c.source ?? (c.authorHandle.endsWith('_ai') ? 'ai' : 'member');
    const { data: comment, error: cErr } = await ctx.admin
      .from('comments')
      .insert({
        post_id: post.id,
        author_user_id: commentAuthorId,
        body: c.body,
        source: commentSource,
        is_credited_answer: c.credited ?? false,
        created_at: commentAt,
      })
      .select('id')
      .single();
    if (cErr) throw new Error(`comment insert (${thread.key}#${i}) failed: ${cErr.message}`);
    ctx.commentIds.set(`${thread.key}#${i}`, comment.id);
    bump(ctx, 'comments');

    if (commentSource === 'member') {
      ctx.reputation.push({
        userId: commentAuthorId,
        eventType: 'comment_created',
        points: 2,
        scoreClass: 'contribution',
        entityType: 'comment',
        entityId: comment.id,
        createdAt: commentAt,
      });
    }
    if (c.credited) {
      ctx.reputation.push({
        userId: commentAuthorId,
        eventType: 'ask_credited',
        points: 10,
        scoreClass: 'helper',
        entityType: 'comment',
        entityId: comment.id,
        createdAt: commentAt,
      });
      await insertMany(ctx, 'notifications', [
        {
          user_id: commentAuthorId,
          actor_user_id: authorId,
          type: 'ask_credited',
          entity_type: 'post',
          entity_id: post.id,
          payload: { title: thread.title } as Json,
          bundle_key: null,
          created_at: commentAt,
          read_at: times[i]! > 2 ? iso(ctx, times[i]! - 0.4) : null,
        },
      ]);
    }

    // Reply notification to the post author (skip self, dedupe like the app).
    if (c.authorHandle !== thread.authorHandle) {
      await insertMany(ctx, 'notifications', [
        {
          user_id: authorId,
          actor_user_id: commentAuthorId,
          type: 'reply',
          entity_type: 'post',
          entity_id: post.id,
          payload: { preview: c.body.slice(0, 140) } as Json,
          bundle_key: `reply:${post.id}`,
          created_at: commentAt,
          read_at: times[i]! > 2.5 ? iso(ctx, times[i]! - 0.5) : null,
        },
      ]);
    }

    // Mentions inside comments.
    for (const handle of mentionedHandles(c.body)) {
      if (notified.has(handle) || handle === c.authorHandle) continue;
      notified.add(handle);
      await insertMany(ctx, 'notifications', [
        {
          user_id: uid(ctx, handle),
          actor_user_id: commentAuthorId,
          type: 'mention',
          entity_type: 'comment',
          entity_id: comment.id,
          payload: { preview: c.body.slice(0, 140) } as Json,
          bundle_key: `mention:comment:${comment.id}`,
          created_at: commentAt,
          read_at: times[i]! > 2.5 ? iso(ctx, times[i]! - 0.4) : null,
        },
      ]);
    }

    await insertMany(
      ctx,
      'reactions',
      (c.reactions ?? []).flatMap((r) =>
        r.handle === c.authorHandle
          ? []
          : [
              {
                user_id: uid(ctx, r.handle),
                comment_id: comment.id,
                type: r.type,
                created_at: iso(ctx, Math.max(times[i]! - 0.1, 0.02)),
              },
            ],
      ),
    );
  }

  // Mentions in the post body.
  for (const handle of mentionedHandles(thread.body)) {
    if (handle === thread.authorHandle) continue;
    await insertMany(ctx, 'notifications', [
      {
        user_id: uid(ctx, handle),
        actor_user_id: authorId,
        type: 'mention',
        entity_type: 'post',
        entity_id: post.id,
        payload: { preview: thread.body.slice(0, 140) } as Json,
        bundle_key: `mention:post:${post.id}`,
        created_at: createdAt,
        read_at: thread.daysAgo > 2.5 ? iso(ctx, thread.daysAgo - 0.4) : null,
      },
    ]);
  }

  await insertMany(
    ctx,
    'reactions',
    thread.reactions.flatMap((r) =>
      r.handle === thread.authorHandle
        ? []
        : [
            {
              user_id: uid(ctx, r.handle),
              post_id: post.id,
              type: r.type,
              created_at: iso(ctx, Math.max(thread.daysAgo - 0.3, 0.02)),
            },
          ],
    ),
  );
  bump(ctx, 'reactions', thread.reactions.length);
}

async function seedEvents(ctx: Ctx): Promise<void> {
  for (const e of EVENTS) {
    const hostId = uid(ctx, e.hostHandle);
    const startsAt = new Date(ctx.now + e.daysFromNow * DAY_MS).toISOString();
    const { data: event, error } = await ctx.admin
      .from('events')
      .insert({
        slug: e.key,
        title: e.title,
        description: e.description,
        category_id: e.categorySlug,
        starts_at: startsAt,
        timezone: 'UTC',
        mode: e.mode,
        venue_name: e.venueName ?? null,
        venue_address: e.venueAddress ?? null,
        host_user_id: hostId,
        lab_id: e.labSlug ? (ctx.labIds.get(e.labSlug) ?? null) : null,
        visibility: 'members',
        capacity: e.capacity ?? null,
        status: 'published',
        created_at: iso(ctx, 3),
      })
      .select('id')
      .single();
    if (error) throw new Error(`event insert (${e.key}) failed: ${error.message}`);
    bump(ctx, 'events');

    await insertMany(
      ctx,
      'event_rsvps',
      e.rsvps.map((r) => ({
        event_id: event.id,
        user_id: uid(ctx, r.handle),
        status: r.status,
        show_publicly: r.showPublicly ?? false,
        created_at: iso(ctx, Math.random() * 0 + 1.5), // deterministic enough: all ~1.5d ago
      })),
    );
    bump(ctx, 'rsvps', e.rsvps.length);

    await insertMany(
      ctx,
      'notifications',
      e.rsvps.slice(0, 4).map((r, i) => ({
        user_id: hostId,
        actor_user_id: uid(ctx, r.handle),
        type: 'event_rsvp',
        entity_type: 'event' as const,
        entity_id: event.id,
        payload: { title: e.title, status: r.status } as Json,
        bundle_key: `event_rsvp:${event.id}`,
        created_at: iso(ctx, 1.4 - i * 0.2),
        read_at: i > 1 ? null : iso(ctx, 1),
      })),
    );
  }
}

async function seedListings(ctx: Ctx): Promise<void> {
  const categories = await ctx.admin.from('listing_categories').select('id, slug');
  if (categories.error) throw new Error(`categories lookup failed: ${categories.error.message}`);
  const bySlug = new Map(categories.data.map((c) => [c.slug, c.id]));

  for (const l of LISTINGS) {
    const categoryId = bySlug.get(l.categorySlug);
    if (!categoryId) {
      console.warn(`[test-community] unknown listing category ${l.categorySlug}; skipping ${l.key}`);
      continue;
    }
    const ownerId = l.ownerHandle ? uid(ctx, l.ownerHandle) : null;
    const { data: listing, error } = await ctx.admin
      .from('business_listings')
      .insert({
        owner_user_id: ownerId,
        business_name: l.businessName,
        category_id: categoryId,
        short_description: l.shortDescription,
        city: l.city,
        country: l.country,
        source: l.ownerHandle ? 'member' : 'seed',
        status: 'published',
        verification_status: l.verified ? 'verified' : 'unverified',
        created_at: iso(ctx, 8),
      })
      .select('id')
      .single();
    if (error) throw new Error(`listing insert (${l.key}) failed: ${error.message}`);
    ctx.listingIds.set(l.key, listing.id);
    bump(ctx, 'listings');

    await insertMany(
      ctx,
      'listing_tags',
      (l.tags ?? []).flatMap((t) => {
        const tagId = ctx.tagIds.get(t);
        return tagId ? [{ listing_id: listing.id, tag_id: tagId }] : [];
      }),
    );

    // Verified business → an approved business verification by the verifier.
    if (l.verified && ownerId) {
      await insertMany(ctx, 'verifications', [
        {
          user_id: ownerId,
          listing_id: listing.id,
          type: 'business',
          status: 'approved',
          verifier_user_id: uid(ctx, 'leyla_verifier'),
          consent_given: true,
          consent_recorded_at: iso(ctx, 6),
          decided_at: iso(ctx, 5),
          created_at: iso(ctx, 7),
        },
      ]);
      if (l.ownerHandle) {
        await awardBadge(ctx.admin, { userId: ownerId, slug: 'verified-business' });
      }
    }
  }

  // The unclaimed demo garage gets a PENDING claim from the mechanic (§18 queue).
  const garage = ctx.listingIds.get('bakara-auto-garage');
  if (garage) {
    await insertMany(ctx, 'listing_claims', [
      {
        listing_id: garage,
        claimant_user_id: uid(ctx, 'saciid_makaanik'),
        evidence: 'Garaashkan anigaa leh — waxaan halkan ka shaqeynayay 2016. Warqadda diiwaangelinta waan haystaa. (Test claim.)',
        status: 'pending',
        created_at: iso(ctx, 1.2),
      },
    ]);
    bump(ctx, 'claims');
  }
}

async function seedDms(ctx: Ctx, threads: SeedDmThread[]): Promise<void> {
  for (const t of threads) {
    const aId = uid(ctx, t.aHandle);
    const bId = uid(ctx, t.bHandle);
    const first = t.messages[0];
    const last = t.messages[t.messages.length - 1];
    if (!first || !last) continue;

    const { data: convo, error } = await ctx.admin
      .from('conversations')
      .insert({
        initiator_user_id: aId,
        recipient_user_id: bId,
        status: t.status,
        created_at: iso(ctx, first.daysAgo + 0.05),
      })
      .select('id')
      .single();
    if (error) throw new Error(`conversation (${t.key}) failed: ${error.message}`);
    ctx.dmIds.set(t.key, convo.id);
    bump(ctx, 'dmThreads');

    // Chronological inserts (the touch trigger bumps updated_at each time).
    let prev = first.daysAgo + 0.01;
    for (let i = 0; i < t.messages.length; i++) {
      const m = t.messages[i]!;
      const at = Math.min(m.daysAgo, prev - 0.005);
      prev = at;
      const { data: msg, error: mErr } = await ctx.admin
        .from('messages')
        .insert({
          conversation_id: convo.id,
          sender_user_id: uid(ctx, m.from),
          body: m.body,
          created_at: iso(ctx, Math.max(at, 0.01)),
        })
        .select('id')
        .single();
      if (mErr) throw new Error(`message (${t.key}#${i}) failed: ${mErr.message}`);
      ctx.dmIds.set(`${t.key}#${i}`, msg.id);
      bump(ctx, 'dmMessages');
    }

    // Repair updated_at (the trigger stamped now()) + set read state.
    const lastAt = iso(ctx, Math.max(Math.min(last.daysAgo, first.daysAgo), 0.01));
    const recipientIsA = t.unreadSide === 'a';
    const unreadFrom = t.messages.filter((m) => (recipientIsA ? m.from === t.bHandle : m.from === t.aHandle));
    const unreadBoundary = unreadFrom.slice(-t.unreadCountForRecipient)[0];
    const readUpTo = t.unreadCountForRecipient === 0 || !unreadBoundary ? 0.005 : unreadBoundary.daysAgo + 0.01;

    await ctx.admin
      .from('conversations')
      .update({
        updated_at: lastAt,
        // The sender side has always "seen" everything; the recipient side has
        // read up to just before their first unread message.
        initiator_last_read_at: recipientIsA ? iso(ctx, readUpTo) : lastAt,
        recipient_last_read_at: recipientIsA ? lastAt : iso(ctx, readUpTo),
      })
      .eq('id', convo.id);

    // Inbox rows for the unread inbound messages (mirrors notify()).
    const recipientId = recipientIsA ? aId : bId;
    const notifyType = t.status === 'pending' ? 'dm_request' : 'new_dm';
    for (const m of unreadFrom.slice(-t.unreadCountForRecipient)) {
      await insertMany(ctx, 'notifications', [
        {
          user_id: recipientId,
          actor_user_id: uid(ctx, m.from),
          type: notifyType,
          entity_type: 'conversation',
          entity_id: convo.id,
          payload: { preview: m.body.slice(0, 140) } as Json,
          bundle_key: notifyType === 'new_dm' ? `dm:${convo.id}` : null,
          created_at: iso(ctx, Math.max(m.daysAgo, 0.01)),
          read_at: null,
        },
      ]);
    }
  }
}

const ALL_THREADS = [...THREADS, ...THREADS_2];
const ALL_DM_THREADS = [...DM_THREADS, ...DM_THREADS_2];
const ALL_SPACES = [...SEED_SPACES, ...SEED_SPACES_WAVE2];

function resolveTarget(
  ctx: Ctx,
  target: ModerationTarget,
): { entityType: Enums<'entity_type'>; entityId: string; authorHandle: string; body: string } {
  if (target.kind === 'lab') {
    const space = ALL_SPACES.find((s) => s.slug === target.labSlug);
    const id = ctx.labIds.get(target.labSlug);
    if (!space || !id) throw new Error(`moderation target lab missing: ${target.labSlug}`);
    return { entityType: 'lab', entityId: id, authorHandle: space.leadHandle, body: space.shortDescription };
  }
  if (target.kind === 'post') {
    const thread = ALL_THREADS.find((t) => t.key === target.threadKey);
    const id = ctx.postIds.get(target.threadKey);
    if (!thread || !id) throw new Error(`moderation target post missing: ${target.threadKey}`);
    return { entityType: 'post', entityId: id, authorHandle: thread.authorHandle, body: thread.body };
  }
  if (target.kind === 'comment') {
    const thread = ALL_THREADS.find((t) => t.key === target.threadKey);
    const comment = thread?.comments[target.commentIndex];
    const id = ctx.commentIds.get(`${target.threadKey}#${target.commentIndex}`);
    if (!thread || !comment || !id) {
      throw new Error(`moderation target comment missing: ${target.threadKey}#${target.commentIndex}`);
    }
    return { entityType: 'comment', entityId: id, authorHandle: comment.authorHandle, body: comment.body };
  }
  const dm = ALL_DM_THREADS.find((d) => d.key === target.dmKey);
  const message = dm?.messages[target.messageIndex];
  const id = ctx.dmIds.get(`${target.dmKey}#${target.messageIndex}`);
  if (!dm || !message || !id) throw new Error(`moderation target message missing: ${target.dmKey}`);
  return { entityType: 'message', entityId: id, authorHandle: message.from, body: message.body };
}

async function seedModerationCases(ctx: Ctx, cases: ModerationCase[]): Promise<void> {
  for (const mcase of cases) {
    const target = resolveTarget(ctx, mcase.target);
    const reporterId = uid(ctx, mcase.reporterHandle);
    const reportedId = uid(ctx, target.authorHandle);
    const reportAt = iso(ctx, mcase.reportDaysAgo);

    const { data: report, error } = await ctx.admin
      .from('reports')
      .insert({
        reporter_user_id: reporterId,
        target_type: target.entityType,
        target_id: target.entityId,
        reason: mcase.reason,
        details: mcase.details,
        status: mcase.status,
        assigned_to_user_id: mcase.assignedToHandle ? uid(ctx, mcase.assignedToHandle) : null,
        assigned_at: mcase.assignedToHandle ? iso(ctx, Math.max(mcase.reportDaysAgo - 0.3, 0.05)) : null,
        resolution: mcase.resolution ?? null,
        resolved_by_user_id: mcase.resolvedByHandle ? uid(ctx, mcase.resolvedByHandle) : null,
        resolved_at: mcase.resolvedDaysAgo !== undefined ? iso(ctx, mcase.resolvedDaysAgo) : null,
        created_at: reportAt,
      })
      .select('id')
      .single();
    if (error) throw new Error(`report insert (${mcase.key}) failed: ${error.message}`);
    bump(ctx, 'reports');

    // §19 evidence snapshot (mod queue reads this, never the live thread).
    await insertMany(ctx, 'report_snapshots', [
      {
        report_id: report.id,
        entity_type: target.entityType,
        entity_id: target.entityId,
        captured_body: target.body.slice(0, 2000),
        captured_context: { authorHandle: target.authorHandle, seededCase: mcase.key } as Json,
        created_at: reportAt,
      },
    ]);

    let lastActionId: string | null = null;
    for (const action of mcase.actions ?? []) {
      const actorId = uid(ctx, action.actorHandle);
      const actionAt = iso(ctx, action.daysAgo);
      const { data: modAction, error: aErr } = await ctx.admin
        .from('mod_actions')
        .insert({
          actor_user_id: actorId,
          action: action.action,
          target_type: action.action.includes('user') ? 'user' : target.entityType,
          target_id: action.action.includes('user') ? reportedId : target.entityId,
          report_id: report.id,
          reason: action.reason,
          created_at: actionAt,
        })
        .select('id')
        .single();
      if (aErr) throw new Error(`mod_action (${mcase.key}) failed: ${aErr.message}`);
      lastActionId = modAction.id;
      bump(ctx, 'modActions');

      if (action.notifyType) {
        await insertMany(ctx, 'notifications', [
          {
            user_id: reportedId,
            actor_user_id: null,
            type: action.notifyType,
            entity_type: action.action.includes('user') ? 'user' : target.entityType,
            entity_id: action.action.includes('user') ? reportedId : target.entityId,
            payload: {} as Json,
            bundle_key: null,
            created_at: actionAt,
            read_at: action.daysAgo > 1 ? iso(ctx, action.daysAgo - 0.2) : null,
          },
        ]);
      }
      await ctx.admin.from('audit_logs').insert({
        actor_user_id: actorId,
        action: `mod_action.${action.action}`,
        target_type: action.action.includes('user') ? 'user' : target.entityType,
        target_id: action.action.includes('user') ? reportedId : target.entityId,
        metadata: { reportId: report.id, seededCase: mcase.key } as Json,
        created_at: actionAt,
      });
    }

    if (mcase.status === 'resolved' || mcase.status === 'dismissed') {
      await insertMany(ctx, 'notifications', [
        {
          user_id: reporterId,
          actor_user_id: null,
          type: 'report_resolved',
          entity_type: 'report',
          entity_id: report.id,
          payload: { resolution: mcase.resolution ?? '' } as Json,
          bundle_key: null,
          created_at: iso(ctx, mcase.resolvedDaysAgo ?? Math.max(mcase.reportDaysAgo - 1, 0.1)),
          read_at: null,
        },
      ]);
    }

    if (mcase.appeal && lastActionId) {
      const decidedAt = iso(ctx, mcase.appeal.decidedDaysAgo);
      const appeal = await ctx.admin.from('appeals').insert({
        mod_action_id: lastActionId,
        appellant_user_id: reportedId,
        body: mcase.appeal.body,
        status: mcase.appeal.status,
        reviewed_by_user_id: uid(ctx, mcase.appeal.reviewedByHandle),
        decision_notes: mcase.appeal.decisionNotes,
        decided_at: decidedAt,
        created_at: iso(ctx, mcase.appeal.filedDaysAgo),
      });
      if (appeal.error) throw new Error(`appeal (${mcase.key}) failed: ${appeal.error.message}`);
      bump(ctx, 'appeals');
      await insertMany(ctx, 'notifications', [
        {
          user_id: reportedId,
          actor_user_id: null,
          type: 'appeal_decided',
          entity_type: 'appeal',
          entity_id: null,
          payload: { outcome: mcase.appeal.status } as Json,
          bundle_key: null,
          created_at: decidedAt,
          read_at: null,
        },
      ]);
    }
  }

}

// HITL queue (§15): AI pre-scan verdicts on specific posts.
async function seedHitl(ctx: Ctx, reviews: HitlReview[]): Promise<void> {
  for (const review of reviews) {
    const thread = ALL_THREADS.find((t) => t.key === review.threadKey);
    const postId = ctx.postIds.get(review.threadKey);
    if (!thread || !postId) continue;
    const { error } = await ctx.admin.from('moderation_reviews').insert({
      entity_type: 'post',
      entity_id: postId,
      author_user_id: uid(ctx, thread.authorHandle),
      reason: review.reason,
      language: review.language,
      content_excerpt: thread.body.slice(0, 500),
      ai_verdict: { seeded: TEST_COMMUNITY_LABEL, verdict: review.reason } as Json,
      status: review.status,
      reviewed_by_user_id: review.reviewedByHandle ? uid(ctx, review.reviewedByHandle) : null,
      review_note: review.reviewNote ?? null,
      reviewed_at: review.status === 'pending' ? null : iso(ctx, Math.max(review.daysAgo - 0.5, 0.05)),
      created_at: iso(ctx, review.daysAgo),
    });
    if (error && error.code !== '23505') throw new Error(`moderation_review failed: ${error.message}`);
    bump(ctx, 'hitlReviews');

    if (review.reason === 'ai_flagged' && review.status === 'pending') {
      await insertMany(ctx, 'notifications', [
        {
          user_id: uid(ctx, thread.authorHandle),
          actor_user_id: null,
          type: 'moderation_hold',
          entity_type: 'post',
          entity_id: postId,
          payload: {} as Json,
          bundle_key: null,
          created_at: iso(ctx, review.daysAgo),
          read_at: null,
        },
      ]);
    }
  }

}

// Account lifecycle states (suspension from the case above; one deactivation).
async function seedLifecycle(ctx: Ctx): Promise<void> {
  const burhaan = uid(ctx, 'burhaan_qaylo');
  await ctx.admin
    .from('users')
    .update({
      status: 'suspended',
      suspended_at: iso(ctx, 2),
      suspension_reason: 'Harassment in DMs after warnings (test case).',
    })
    .eq('id', burhaan);
  const daahir = uid(ctx, 'daahir_maqan');
  await ctx.admin.from('users').update({ status: 'deactivated', deactivated_at: iso(ctx, 5) }).eq('id', daahir);

  // The harassed member blocks the suspended account (block + blocked thread).
  await insertMany(ctx, 'user_blocks', [
    { blocker_user_id: uid(ctx, 'xaawo_hadal'), blocked_user_id: burhaan, created_at: iso(ctx, 2.4) },
  ]);
}

async function seedGraph(ctx: Ctx): Promise<void> {
  const follows = buildFollowEdges().flatMap(([follower, target]) => {
    if (!ctx.ids.has(follower) || !ctx.ids.has(target)) return [];
    return [
      {
        follower_user_id: uid(ctx, follower),
        target_type: 'user' as const,
        target_id: uid(ctx, target),
      },
    ];
  });
  await insertMany(ctx, 'follows', follows);
  bump(ctx, 'follows', follows.length);

  const tagFollows = Object.entries(TAG_FOLLOWS).flatMap(([tag, handles]) => {
    const tagId = ctx.tagIds.get(tag);
    if (!tagId) return [];
    return handles.map((h) => ({
      follower_user_id: uid(ctx, h),
      target_type: 'tag' as const,
      target_id: tagId,
    }));
  });
  await insertMany(ctx, 'follows', tagFollows);

  const labFollows = Object.entries(LAB_FOLLOWS).flatMap(([slug, handles]) => {
    const labId = ctx.labIds.get(slug);
    if (!labId) return [];
    return handles.map((h) => ({
      follower_user_id: uid(ctx, h),
      target_type: 'lab' as const,
      target_id: labId,
    }));
  });
  await insertMany(ctx, 'follows', labFollows);

  const candidateId = ctx.candidateIds.get('xawilaad');
  if (candidateId) {
    await insertMany(
      ctx,
      'follows',
      CANDIDATE_FOLLOWS.map((h) => ({
        follower_user_id: uid(ctx, h),
        target_type: 'candidate' as const,
        target_id: candidateId,
      })),
    );
  }

  await insertMany(
    ctx,
    'skill_endorsements',
    ENDORSEMENTS.map(([endorser, endorsee, skill]) => ({
      endorser_user_id: uid(ctx, endorser),
      endorsee_user_id: uid(ctx, endorsee),
      skill,
    })),
  );
  bump(ctx, 'endorsements', ENDORSEMENTS.length);

  for (const [vouchee, vouchers] of Object.entries(VOUCHES)) {
    await insertMany(
      ctx,
      'vouches',
      vouchers.map((v) => ({
        voucher_user_id: uid(ctx, v),
        vouchee_user_id: uid(ctx, vouchee),
        created_at: iso(ctx, 10 + (vouchee.length % 5)),
      })),
    );
    if (vouchers.length >= 3) {
      const persona = PERSONAS_BY_HANDLE.get(vouchee);
      if (persona?.verification === 'community_verified') {
        await awardBadge(ctx.admin, { userId: uid(ctx, vouchee), slug: 'community-verified' });
        await insertMany(ctx, 'notifications', [
          {
            user_id: uid(ctx, vouchee),
            actor_user_id: null,
            type: 'community_verified',
            entity_type: 'user',
            entity_id: uid(ctx, vouchee),
            payload: {} as Json,
            bundle_key: null,
            created_at: iso(ctx, 9),
            read_at: iso(ctx, 8.5),
          },
        ]);
      }
    }
  }
  bump(ctx, 'vouches', Object.values(VOUCHES).flat().length);

  // Identity verifications: approved rows for identity_verified personas,
  // plus one scheduled (pending) call for the nurse.
  for (const p of TEST_PERSONAS) {
    if (p.verification !== 'identity_verified') continue;
    await insertMany(ctx, 'verifications', [
      {
        user_id: uid(ctx, p.handle),
        type: 'identity',
        status: 'approved',
        verifier_user_id: uid(ctx, 'leyla_verifier'),
        consent_given: true,
        consent_recorded_at: iso(ctx, 12),
        decided_at: iso(ctx, 11),
        created_at: iso(ctx, 13),
      },
    ]);
    await awardBadge(ctx.admin, { userId: uid(ctx, p.handle), slug: 'identity-verified' });
    bump(ctx, 'verifications');
  }
  await insertMany(ctx, 'verifications', [
    {
      user_id: uid(ctx, 'maryan_kalkaal'),
      type: 'identity',
      status: 'scheduled',
      scheduled_at: new Date(ctx.now + 2 * DAY_MS).toISOString(),
      booking_url: 'https://example.com/verify/maryan',
      consent_given: true,
      consent_recorded_at: iso(ctx, 1.5),
      created_at: iso(ctx, 1.6),
    },
  ]);
  await insertMany(ctx, 'notifications', [
    {
      user_id: uid(ctx, 'maryan_kalkaal'),
      actor_user_id: null,
      type: 'verification_scheduled',
      entity_type: 'verification',
      entity_id: null,
      payload: { scheduledInDays: 2 } as Json,
      bundle_key: null,
      created_at: iso(ctx, 1.5),
      read_at: null,
    },
  ]);
}

async function seedReputation(ctx: Ctx, opts: { includeHistory: boolean }): Promise<void> {
  // Historical helper credit so trust levels differ meaningfully (the live
  // content above only covers ~3 weeks). Synthetic entity ids are fine — the
  // ledger has no FK on entity_id. Wave-1 only (re-running would duplicate).
  if (opts.includeHistory) {
    const history: [handle: string, eventType: string, points: number, scoreClass: 'contribution' | 'helper', n: number][] = [
      ['maryan_kalkaal', 'ask_credited', 10, 'helper', 4],
      ['ayaan_dev', 'ask_credited', 10, 'helper', 2],
      ['amina_biyo', 'ask_credited', 10, 'helper', 1],
      ['cali_macalin', 'ask_credited', 10, 'helper', 1],
      ['yusuf_xawilaad', 'comment_created', 2, 'contribution', 5],
    ];
    for (const [handle, eventType, points, scoreClass, n] of history) {
      for (let i = 0; i < n; i++) {
        ctx.reputation.push({
          userId: uid(ctx, handle),
          eventType,
          points,
          scoreClass,
          entityType: 'comment',
          entityId: randomUUID(),
          createdAt: iso(ctx, 25 + i * 6),
        });
      }
    }
  }

  await insertMany(
    ctx,
    'reputation_events',
    ctx.reputation.map((r) => ({
      user_id: r.userId,
      event_type: r.eventType,
      points: r.points,
      score_class: r.scoreClass,
      entity_type: r.entityType,
      entity_id: r.entityId,
      created_at: r.createdAt,
    })),
  );
  bump(ctx, 'reputationEvents', ctx.reputation.length);

  const recompute = await ctx.admin.rpc('recompute_reputation_scores', {} as never);
  if (recompute.error) {
    console.warn('[test-community] recompute_reputation_scores failed:', recompute.error.message);
  }

  // Milestone badges consistent with the seeded scores/roles.
  await awardBadge(ctx.admin, { userId: uid(ctx, 'ayaan_dev'), slug: 'lab-lead' });
  await awardBadge(ctx.admin, { userId: uid(ctx, 'khadra_coop'), slug: 'lab-lead' });
  await awardBadge(ctx.admin, { userId: uid(ctx, 'maryan_kalkaal'), slug: 'top-helper' });
  await awardBadge(ctx.admin, { userId: uid(ctx, 'fartuun_forsa'), slug: 'mentor-in-residence' });
}

async function seedSettings(ctx: Ctx): Promise<void> {
  // NB: rows in one PostgREST batch must be COLUMN-HOMOGENEOUS — missing keys
  // are sent as NULL (not column defaults), which violates the NOT NULL
  // constraints here. Spell out every non-default column on every row.
  const settingsDefaults = {
    discoverable_directory: true,
    discoverable_search_engines: true,
    location_granularity: 'city',
    dm_privacy: 'everyone',
    digest_frequency: 'weekly',
  };
  await insertMany(ctx, 'user_settings', [
    { ...settingsDefaults, user_id: uid(ctx, 'nimco_caafimaad'), location_granularity: 'region' },
    { ...settingsDefaults, user_id: uid(ctx, 'daahir_maqan'), discoverable_directory: false },
    { ...settingsDefaults, user_id: uid(ctx, 'qali_qarsoon'), dm_privacy: 'verified' },
    { ...settingsDefaults, user_id: uid(ctx, 'abwaan_dhool'), digest_frequency: 'off' },
  ]);
  await insertMany(
    ctx,
    'push_subscriptions',
    ['ayaan_dev', 'khalid_codes', 'hodan_mod'].map((h) => ({
      user_id: uid(ctx, h),
      endpoint: `https://example.com/push/${h}`,
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
      user_agent: 'test-community-seeder',
    })),
  );

  // Verifier capability (grant sits beside roles — never a users.role value).
  const grant = await ctx.admin.from('verifier_grants').upsert(
    {
      user_id: uid(ctx, 'leyla_verifier'),
      granted_by_user_id: uid(ctx, 'warsame_admin'),
      note: 'Test-community verifier',
      revoked_at: null,
    },
    { onConflict: 'user_id' },
  );
  if (grant.error) throw new Error(`verifier grant failed: ${grant.error.message}`);
}

// ──────────────────────────────────────────────────────────────── wave 2 ──

/** Backfill generated images onto wave-1 posts (looked up by author+title,
 * since wave-1 postIds aren't in ctx when its content phase was skipped). */
async function backfillWave1Images(ctx: Ctx): Promise<void> {
  for (const [threadKey, image] of Object.entries(WAVE1_IMAGE_BACKFILL)) {
    const thread = THREADS.find((t) => t.key === threadKey);
    if (!thread || !thread.title) continue;
    const authorId = uid(ctx, thread.authorHandle);
    const { data: post } = await ctx.admin
      .from('posts')
      .select('id, image_urls')
      .eq('author_user_id', authorId)
      .eq('title', thread.title)
      .maybeSingle();
    if (!post || (post.image_urls ?? []).length > 0) continue;
    const path = await uploadPostImage(ctx.admin, {
      userId: authorId,
      postId: post.id,
      threadKey,
      scene: image.scene,
      alt: image.alt,
    });
    if (path) {
      await ctx.admin.from('posts').update({ image_urls: [path] }).eq('id', post.id);
      bump(ctx, 'postImages');
    }
  }
}

/** Re-render every seeded post image (idempotent upsert on the deterministic
 * storage path) so procedural-art upgrades reach already-seeded posts. Looked
 * up by author + title, like the wave-1 backfill. */
async function refreshPostImages(ctx: Ctx): Promise<void> {
  for (const thread of ALL_THREADS) {
    if (!thread.image || !thread.title) continue;
    const authorId = uid(ctx, thread.authorHandle);
    const { data: post } = await ctx.admin
      .from('posts')
      .select('id')
      .eq('author_user_id', authorId)
      .eq('title', thread.title)
      .maybeSingle();
    if (!post) continue;
    const path = await uploadPostImage(ctx.admin, {
      userId: authorId,
      postId: post.id,
      threadKey: thread.key,
      scene: thread.image.scene,
      alt: thread.image.alt,
    });
    if (path) {
      await ctx.admin.from('posts').update({ image_urls: [path] }).eq('id', post.id);
      bump(ctx, 'postImagesRefreshed');
    }
  }
}

/** The lab_updates touch-trigger bumps last_activity_at/dormant_since on
 * insert — re-apply the designed dormancy state afterwards. */
async function reapplySpaceStates(ctx: Ctx): Promise<void> {
  for (const space of ALL_SPACES) {
    if (space.dormantSinceDaysAgo === undefined && space.lastActivityDaysAgo === undefined) continue;
    const labId = ctx.labIds.get(space.slug);
    if (!labId) continue;
    await ctx.admin
      .from('labs')
      .update({
        last_activity_at: iso(ctx, space.lastActivityDaysAgo ?? space.createdDaysAgo),
        dormant_since: space.dormantSinceDaysAgo !== undefined ? iso(ctx, space.dormantSinceDaysAgo) : null,
      })
      .eq('id', labId);
  }
}

/** Notification cases beyond what content seeding emits organically:
 * join requests, dormancy, skill gaps, candidate status, stale asks. */
async function seedNotificationCases(ctx: Ctx): Promise<void> {
  const notify = (row: Database['public']['Tables']['notifications']['Insert']) =>
    insertMany(ctx, 'notifications', [row]);

  // Join requests → the space lead (lab_members rows carry status 'requested').
  const joinRequests: [space: string, requester: string, lead: string][] = [
    ['caafimaadka-hooyada', 'axmed_caafi', 'maryan_kalkaal'],
    ['af-soomaali-online', 'xaliimo_hooyo', 'warda_gabay'],
  ];
  for (const [slug, requester, lead] of joinRequests) {
    const labId = ctx.labIds.get(slug);
    if (!labId) continue;
    await notify({
      user_id: uid(ctx, lead),
      actor_user_id: uid(ctx, requester),
      type: 'lab_join_request',
      entity_type: 'lab',
      entity_id: labId,
      payload: { labSlug: slug } as Json,
      bundle_key: `lab_join:${labId}`,
      created_at: iso(ctx, 1.4),
      read_at: null,
    });
  }

  // Dormancy notice to the abandoned space's lead (mirrors the cron sweep).
  const dormant = ctx.labIds.get('suuq-nadiifin');
  if (dormant) {
    await notify({
      user_id: uid(ctx, 'nuur_samafal'),
      actor_user_id: null,
      type: 'lab_dormant',
      entity_type: 'lab',
      entity_id: dormant,
      payload: { labSlug: 'suuq-nadiifin' } as Json,
      bundle_key: null,
      created_at: iso(ctx, 4),
      read_at: null,
    });
  }

  // Skill-gap alerts (7-day unfilled needs) — stamp alerted_at + notify leads.
  const gapSpaces: [slug: string, lead: string][] = [
    ['caafimaadka-hooyada', 'maryan_kalkaal'],
    ['bajaaj-coop', 'faarax_gaadiid'],
  ];
  for (const [slug, lead] of gapSpaces) {
    const labId = ctx.labIds.get(slug);
    if (!labId) continue;
    await ctx.admin
      .from('lab_skill_needs')
      .update({ alerted_at: iso(ctx, 0.5) })
      .eq('lab_id', labId)
      .is('filled_at', null)
      .is('alerted_at', null);
    await notify({
      user_id: uid(ctx, lead),
      actor_user_id: null,
      type: 'lab_skill_gap',
      entity_type: 'lab',
      entity_id: labId,
      payload: { labSlug: slug } as Json,
      bundle_key: null,
      created_at: iso(ctx, 0.5),
      read_at: null,
    });
  }

  // Candidate status → creator (submitted → in_review after the mod reviews).
  const candidate = ctx.candidateIds.get('xawilaad');
  if (candidate) {
    await notify({
      user_id: uid(ctx, 'ayaan_dev'),
      actor_user_id: null,
      type: 'candidate_status',
      entity_type: 'candidate',
      entity_id: candidate,
      payload: { status: 'in_review' } as Json,
      bundle_key: null,
      created_at: iso(ctx, 2),
      read_at: iso(ctx, 1.8),
    });
  }

  // Stale-ask nudge on the open Somali speech-datasets ask (wave 1).
  const staleAsk = THREADS.find((t) => t.key === 'zakariye-somali-asr-ask');
  if (staleAsk?.title) {
    const authorId = uid(ctx, staleAsk.authorHandle);
    const { data: post } = await ctx.admin
      .from('posts')
      .select('id')
      .eq('author_user_id', authorId)
      .eq('title', staleAsk.title)
      .maybeSingle();
    if (post) {
      await ctx.admin.from('posts').update({ ask_nudged_at: iso(ctx, 1) }).eq('id', post.id);
      await notify({
        user_id: authorId,
        actor_user_id: null,
        type: 'ask_stale',
        entity_type: 'post',
        entity_id: post.id,
        payload: { title: staleAsk.title } as Json,
        bundle_key: null,
        created_at: iso(ctx, 1),
        read_at: null,
      });
    }
  }
}

// ─────────────────────────────────────────────────────── community awards ──

/** Quarter window for `ctx.now` shifted by `offset` quarters (0 = current). */
function quarterWindow(now: number, offset: number): { quarter: string; start: Date; end: Date } {
  const d = new Date(now);
  let year = d.getUTCFullYear();
  let qi = Math.floor(d.getUTCMonth() / 3) + offset;
  while (qi < 0) {
    qi += 4;
    year -= 1;
  }
  while (qi > 3) {
    qi -= 4;
    year += 1;
  }
  const startMonth = qi * 3;
  return {
    quarter: `${year}-Q${qi + 1}`,
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 1)),
  };
}

async function labIdBySlug(ctx: Ctx, slug: string): Promise<string | null> {
  if (ctx.labIds.has(slug)) return ctx.labIds.get(slug)!;
  const { data } = await ctx.admin.from('labs').select('id').eq('slug', slug).maybeSingle();
  if (data) ctx.labIds.set(slug, data.id);
  return data?.id ?? null;
}

async function winPostIdByTitle(ctx: Ctx, authorHandle: string, title: string): Promise<string | null> {
  const { data } = await ctx.admin
    .from('posts')
    .select('id')
    .eq('author_user_id', uid(ctx, authorHandle))
    .eq('title', title)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Community Awards (§20) — activates the dormant Phase-7 tables with a realistic
 * mid-quarter state: LAST quarter's cycle is closed with published winners (a
 * bilingual results post authored by the AI account), and THIS quarter's cycle
 * is open for voting. Ballots are one-per-category; the winner of each closed
 * category has a clear plurality so `award_vote_tally()` resolves cleanly.
 */
async function seedAwards(ctx: Ctx): Promise<void> {
  const prev = quarterWindow(ctx.now, -1);
  const curr = quarterWindow(ctx.now, 0);
  const DAY = DAY_MS;

  // Resolve targets (labs by slug, wins by title, members by handle).
  const labWinner = await labIdBySlug(ctx, 'xawilaad-sandbox');
  const labRunners = (
    await Promise.all([
      labIdBySlug(ctx, 'iskaashato-hooyo'),
      labIdBySlug(ctx, 'dixon-cup'),
      labIdBySlug(ctx, 'beeraha-iyo-biyaha'),
    ])
  ).filter((x): x is string => Boolean(x));
  const winWinner = await winPostIdByTitle(
    ctx,
    'ubax_beerta',
    'Guul! Yaanyadii ugu horreysay ee greenhouse-ka waxaan ka iibiyay hoteello Hargeysa',
  );
  const winRunners = (
    await Promise.all([
      winPostIdByTitle(ctx, 'muna_macaan', 'Macaan Bakery just hit 100 weekly orders — hiring our first delivery rider!'),
      winPostIdByTitle(ctx, 'koos_kubad', 'DIXON CUP IS FULL — 12 TEAMS ✅'),
    ])
  ).filter((x): x is string => Boolean(x));

  if (!labWinner || !winWinner) {
    console.warn('[test-community] awards: winning targets not found; skipping awards phase');
    return;
  }

  // Cycle rows (upsert on quarter — idempotent).
  const closedCycle = {
    quarter: prev.quarter,
    opens_at: prev.start.toISOString(),
    closes_at: prev.end.toISOString(),
  };
  const openCycle = {
    quarter: curr.quarter,
    opens_at: curr.start.toISOString(),
    closes_at: curr.end.toISOString(),
  };
  const up = await ctx.admin
    .from('award_cycles')
    .upsert([closedCycle, openCycle], { onConflict: 'quarter' });
  if (up.error) throw new Error(`award cycle upsert failed: ${up.error.message}`);
  bump(ctx, 'awardCycles', 2);

  // Eligible voters (active, non-AI) — a broad spread across clusters.
  const voters = [
    'ayaan_dev', 'khalid_codes', 'nasra_sec', 'sagal_ux', 'cawo_cargo', 'hamdi_agritech',
    'amina_biyo', 'xasan_beero', 'ubax_beerta', 'khadra_coop', 'fartuun_forsa', 'muna_macaan',
    'maryan_kalkaal', 'cabdi_daawo', 'cali_macalin', 'hafsa_dugsi', 'zamzam_dugsiga', 'bashiir_baro',
    'deeqa_dirham', 'ifrah_invest', 'yusuf_xawilaad', 'nuur_samafal', 'deeq_organiser', 'koos_kubad',
    'idil_warbaahin', 'warda_gabay', 'dalmar_dood', 'safiya_aragto',
  ];

  type Ballot = { category: Enums<'award_category'>; targetType: Enums<'entity_type'>; targetId: string };
  /** Distribute voters across [winner, ...runners] with the winner leading. */
  const distribute = (
    category: Enums<'award_category'>,
    targetType: Enums<'entity_type'>,
    winner: string,
    runners: string[],
    voterList: string[],
  ): { handle: string; ballot: Ballot }[] => {
    const targets = [winner, winner, ...runners]; // winner weighted → clear plurality
    return voterList.map((handle, i) => ({
      handle,
      ballot: { category, targetType, targetId: targets[i % targets.length]! },
    }));
  };

  // NOTE: a BEFORE-INSERT trigger (award_cycle_is_open) rejects votes into a
  // cycle whose window isn't currently open — it fires for the service role
  // too (triggers, unlike RLS, can't be bypassed). So we only cast ballots
  // into the OPEN cycle; the CLOSED quarter's winners are narrated in the
  // results post (member-facing tallies aren't shown for past cycles anyway).
  // `ayaan_dev` is intentionally excluded so the demo account can still vote
  // live at /awards (ballots are one-per-category and final).
  const openVoters = voters.filter((h) => h !== 'ayaan_dev').slice(0, 12);
  const votedAt = new Date(ctx.now - 4 * DAY).toISOString(); // recent, mid-open-window
  const ballots: { handle: string; ballot: Ballot }[] = [
    ...distribute('best_lab', 'lab', labWinner, labRunners, openVoters),
    ...distribute('best_win', 'post', winWinner, winRunners, openVoters),
    ...distribute('most_helpful', 'user', uid(ctx, 'maryan_kalkaal'),
      [uid(ctx, 'fartuun_forsa'), uid(ctx, 'yusuf_xawilaad')], openVoters),
    ...distribute('rising_builder', 'user', uid(ctx, 'khalid_codes'),
      [uid(ctx, 'hamdi_agritech'), uid(ctx, 'ubax_beerta'), uid(ctx, 'zakariye_ml')], openVoters),
  ];
  await insertMany(
    ctx,
    'award_votes',
    ballots.map((b) => ({
      quarter: curr.quarter,
      category: b.ballot.category,
      voter_user_id: uid(ctx, b.handle),
      target_type: b.ballot.targetType,
      target_id: b.ballot.targetId,
      created_at: votedAt,
    })),
  );
  bump(ctx, 'awardVotes', ballots.length);

  // Publish the closed quarter's winners as a labelled AI Plaza post + link it.
  const publishedAt = new Date(prev.end.getTime() + 2 * DAY).toISOString();
  const resultsTitle = `Community Awards — ${prev.quarter} winners`;
  const existing = await ctx.admin
    .from('posts')
    .select('id')
    .eq('author_user_id', uid(ctx, 'xidig_ai'))
    .eq('title', resultsTitle)
    .maybeSingle();
  let resultsPostId = existing.data?.id ?? null;
  if (!resultsPostId) {
    const body = [
      `Abaalmarinnada Bulshada — guulaystayaasha ${prev.quarter} / The community voted. Here are the standouts you chose.`,
      '',
      '🏅 Best Lab — Xawilaad Sandbox: building open remittance tooling in public.',
      '🏅 Best Win — Ubax Xasan: the first greenhouse tomato harvest sold to Hargeisa hotels.',
      '🏅 Most Helpful — Maryan Aadan: patient, plain-Somali health answers, the most-credited helper this quarter.',
      '🏅 Rising Builder — Khaalid Yuusuf: from first line of JavaScript to Lab contributor in one quarter.',
      '',
      `Hambalyo dhammaan! Codaynta ${curr.quarter} hadda way furan tahay — booqo Abaalmarinnada oo cod. / Congratulations all — ${curr.quarter} voting is open now: head to Community Awards and cast yours.`,
      '',
      'Qoraalkan waxaa diyaariyey kaaliyaha AI ee Xidig. / Compiled by Xidig\'s AI assistant.',
    ].join('\n');
    const post = await ctx.admin
      .from('posts')
      .insert({
        author_user_id: uid(ctx, 'xidig_ai'),
        type: 'update',
        title: resultsTitle,
        body,
        source: 'ai',
        status: 'published',
        pinned_at: publishedAt,
        created_at: publishedAt,
      })
      .select('id')
      .single();
    if (post.error) throw new Error(`awards results post failed: ${post.error.message}`);
    resultsPostId = post.data.id;
    bump(ctx, 'posts');
    // Tag the results post so it is discoverable under the community tag.
    const communityTag = ctx.tagIds.get('community');
    if (communityTag) {
      await insertMany(ctx, 'post_tags', [{ post_id: resultsPostId, tag_id: communityTag }]);
    }
  }

  const link = await ctx.admin
    .from('award_cycles')
    .update({ results_post_id: resultsPostId, published_at: publishedAt })
    .eq('quarter', prev.quarter);
  if (link.error) throw new Error(`award cycle publish link failed: ${link.error.message}`);
}

// ─────────────────────────────────────────────────────────────────── entry ──

export interface TestCommunityLogin {
  handle: string;
  email: string;
  displayName: string;
  role: string;
  tier: string;
  status: string;
  language: string;
  purpose: string;
}

export interface TestCommunitySummary {
  label: string;
  password: string;
  usersCreated: number;
  usersExisting: number;
  contentSeeded: boolean;
  counts: Record<string, number>;
  logins: TestCommunityLogin[];
}

export async function runTestCommunity(admin: Admin): Promise<TestCommunitySummary> {
  getTestCommunityPassword(); // fail fast on missing env before touching the DB
  const ctx: Ctx = {
    admin,
    now: Date.now(),
    ids: new Map(),
    tagIds: new Map(),
    labIds: new Map(),
    postIds: new Map(),
    commentIds: new Map(),
    dmIds: new Map(),
    candidateIds: new Map(),
    listingIds: new Map(),
    reputation: [],
    counts: {},
  };

  let usersCreated = 0;
  let usersExisting = 0;
  for (const persona of TEST_PERSONAS) {
    const { created } = await ensurePersona(ctx, persona);
    if (created) usersCreated++;
    else usersExisting++;
  }
  await ensureAiHelpers(ctx);
  await ensureMedia(ctx);
  // Avatars/banners regenerate above (unconditional upsert). Post images live
  // inside the marker-guarded content phase, so refresh them here too — this
  // rolls out procedural-art upgrades on a plain re-run. No-op on a fresh DB
  // (posts don't exist yet; seedThread renders them with the current style).
  await refreshPostImages(ctx);

  // Content phases: once per database each, guarded by marker runs.
  const checkMarker = async (label: string): Promise<boolean> => {
    const marker = await admin.from('seed_runs').select('id').eq('label', label).maybeSingle();
    if (marker.error) throw new Error(`marker lookup failed: ${marker.error.message}`);
    return Boolean(marker.data);
  };
  const placeMarker = async (label: string, description: string): Promise<void> => {
    const { error } = await admin.from('seed_runs').insert({
      label,
      description,
      source: 'seed',
      actor_user_id: ctx.ids.get('xidig_ai') ?? null,
    });
    if (error) throw new Error(`marker insert failed: ${error.message}`);
  };

  let contentSeeded = false;
  if (!(await checkMarker(TEST_COMMUNITY_LABEL))) {
    await placeMarker(
      TEST_COMMUNITY_LABEL,
      'TEST-COMMUNITY marker (fake members for the pre-launch test phase — content is NOT registered in seed_entities; reset via DELETE /api/admin/seed/test-community).',
    );
    await ensureTags(ctx);
    await seedSpaces(ctx);
    await seedLabContent(ctx, LAB_UPDATES, LAB_ARTIFACTS, LAB_DECISIONS);
    await seedCandidates(ctx);
    for (const thread of THREADS) await seedThread(ctx, thread);
    await seedEvents(ctx);
    await seedListings(ctx);
    await seedDms(ctx, DM_THREADS);
    await seedModerationCases(ctx, MODERATION_CASES);
    await seedHitl(ctx, HITL_REVIEWS);
    await seedLifecycle(ctx);
    await seedGraph(ctx);
    await seedReputation(ctx, { includeHistory: true });
    contentSeeded = true;
  }

  // Wave 2 — living-app density: more spaces (all lifecycle states), the
  // long-tail feed with images, more DMs, notification cases, marked
  // moderation fixtures. Layered on wave 1 under its own marker.
  if (!(await checkMarker(`${TEST_COMMUNITY_LABEL.replace(/-v1$/, '')}-v2`))) {
    await placeMarker(
      `${TEST_COMMUNITY_LABEL.replace(/-v1$/, '')}-v2`,
      'TEST-COMMUNITY wave-2 marker (living-app density: long-tail feed + images, extra spaces/DMs/notifications, marked moderation fixtures).',
    );
    await ensureTags(ctx);
    // Resolve wave-1 space/candidate ids for cross-references.
    await seedSpaceList(ctx, SEED_SPACES);
    const cand = await admin
      .from('venture_candidates')
      .select('id')
      .eq('name', CANDIDATE_COPY.xawilaad.name)
      .maybeSingle();
    if (cand.data) ctx.candidateIds.set('xawilaad', cand.data.id);

    await seedSpaceList(ctx, SEED_SPACES_WAVE2);
    await seedLabContent(ctx, LAB_UPDATES_2, LAB_ARTIFACTS_2, LAB_DECISIONS_2);
    await reapplySpaceStates(ctx);
    for (const thread of THREADS_2) await seedThread(ctx, thread);
    await seedDms(ctx, DM_THREADS_2);
    await seedModerationCases(ctx, MODERATION_CASES_2);
    await seedHitl(ctx, HITL_REVIEWS_2);
    await backfillWave1Images(ctx);
    await seedNotificationCases(ctx);
    await seedReputation(ctx, { includeHistory: false });
    contentSeeded = true;
  }

  // Community Awards — activates the dormant Phase-7 award tables. Separate
  // marker so it can be added to a database already seeded by v1/v2.
  if (!(await checkMarker('test-community-awards'))) {
    await placeMarker(
      'test-community-awards',
      'TEST-COMMUNITY awards marker (Phase-7 Community Awards: a closed+published quarter and an open voting quarter).',
    );
    await ensureTags(ctx); // guarantees the 'community' tag id is in ctx
    await seedAwards(ctx);
    contentSeeded = true;
  }

  // Settings/grants are idempotent (unique keys + upserts) and deliberately
  // OUTSIDE the markers so a failed tail retries on the next run.
  await seedSettings(ctx);

  const logins: TestCommunityLogin[] = [
    ...TEST_PERSONAS.map((p) => ({
      handle: p.handle,
      email: testEmail(p.handle),
      displayName: p.displayName,
      role: p.isVerifier ? `${p.role} + verifier` : p.role,
      tier: p.membershipTier,
      status: p.accountStatus,
      language: p.preferredLanguage,
      purpose: p.testPurpose,
    })),
    ...TEST_AI_HELPERS.map((h) => ({
      handle: h.handle,
      email: testEmail(h.handle),
      displayName: h.displayName,
      role: 'AI helper (is_ai)',
      tier: 'free',
      status: 'active',
      language: h.preferredLanguage,
      purpose: h.purpose,
    })),
  ];

  return {
    label: TEST_COMMUNITY_LABEL,
    password: getTestCommunityPassword(),
    usersCreated,
    usersExisting,
    contentSeeded,
    counts: ctx.counts,
    logins,
  };
}

// ─────────────────────────────────────────────────────────────────── reset ──

export interface TestCommunityResetSummary {
  usersDeleted: number;
  usersAnonymised: number;
  errors: string[];
}

/**
 * Best-effort teardown. Immutable rows (mod_actions, audit_logs, snapshots,
 * gate evaluations) and reports (DELETE revoked by §19) CANNOT be removed —
 * users referenced by them are anonymised in place instead of deleted,
 * mirroring the app's own anonymise-not-erase lifecycle.
 */
export async function resetTestCommunity(admin: Admin): Promise<TestCommunityResetSummary> {
  const errors: string[] = [];
  const users = await admin
    .from('users')
    .select('id, email')
    .like('email', '%@example.com');
  if (users.error) throw new Error(`test user lookup failed: ${users.error.message}`);
  const ids = (users.data ?? []).map((u) => u.id);
  if (ids.length === 0) {
    await admin.from('seed_runs').delete().like('label', 'test-community-%');
    return { usersDeleted: 0, usersAnonymised: 0, errors };
  }

  const tryDelete = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await fn();
    if (error) errors.push(`${label}: ${error.message}`);
  };

  // Content that references the users but is not cascade-deleted with them.
  await tryDelete('moderation_reviews', () => admin.from('moderation_reviews').delete().in('author_user_id', ids));
  await tryDelete('events', () => admin.from('events').delete().in('host_user_id', ids));
  await tryDelete('comments', () => admin.from('comments').delete().in('author_user_id', ids));
  await tryDelete('posts', () => admin.from('posts').delete().in('author_user_id', ids));
  await tryDelete('candidates', () => admin.from('venture_candidates').delete().in('created_by_user_id', ids));
  await tryDelete('labs', () => admin.from('labs').delete().in('lead_user_id', ids));
  await tryDelete('listing_claims', () => admin.from('listing_claims').delete().in('claimant_user_id', ids));
  // Unclaimed fixtures (the Bakara garage) have no owner to key on, and the
  // display name is member-facing copy, not a stable key. The launch-density
  // seeder registers every listing it creates in seed_entities; this seeder
  // deliberately registers none — so an owner-less source='seed' listing
  // OUTSIDE the registry is a test-community fixture, whatever its name says.
  const unclaimedFixtureIds: string[] = [];
  {
    const [unclaimed, registered] = await Promise.all([
      admin.from('business_listings').select('id').eq('source', 'seed').is('owner_user_id', null),
      admin.from('seed_entities').select('entity_id').eq('entity_type', 'listing'),
    ]);
    if (unclaimed.error) errors.push(`unclaimed listing lookup: ${unclaimed.error.message}`);
    if (registered.error) errors.push(`seed registry lookup: ${registered.error.message}`);
    if (!unclaimed.error && !registered.error) {
      const known = new Set((registered.data ?? []).map((r) => r.entity_id));
      for (const row of unclaimed.data ?? []) {
        if (!known.has(row.id)) unclaimedFixtureIds.push(row.id);
      }
    }
  }
  await tryDelete('listings', () =>
    admin
      .from('business_listings')
      .delete()
      .or(
        `owner_user_id.in.(${ids.join(',')})` +
          (unclaimedFixtureIds.length > 0 ? `,id.in.(${unclaimedFixtureIds.join(',')})` : ''),
      ),
  );
  await tryDelete('messages', () => admin.from('messages').delete().in('sender_user_id', ids));
  await tryDelete('conversations (a)', () => admin.from('conversations').delete().in('initiator_user_id', ids));
  await tryDelete('conversations (b)', () => admin.from('conversations').delete().in('recipient_user_id', ids));
  await tryDelete('follows (out)', () => admin.from('follows').delete().in('follower_user_id', ids));
  await tryDelete('follows (in)', () =>
    admin.from('follows').delete().eq('target_type', 'user').in('target_id', ids),
  );
  await tryDelete('media', () => admin.from('media_uploads').delete().in('owner_user_id', ids));
  await tryDelete('verifications', () => admin.from('verifications').delete().in('user_id', ids));
  await tryDelete('verifier_grants', () => admin.from('verifier_grants').delete().in('user_id', ids));
  await tryDelete('signup_grants', () =>
    admin.from('signup_grants').delete().like('email', '%@example.com'),
  );
  // Award votes cascade with their voters; drop the two seeded cycle windows.
  await tryDelete('award_cycles', () =>
    admin
      .from('award_cycles')
      .delete()
      .in('quarter', [quarterWindow(Date.now(), -1).quarter, quarterWindow(Date.now(), 0).quarter]),
  );

  let usersDeleted = 0;
  let usersAnonymised = 0;
  for (const id of ids) {
    const del = await admin.from('users').delete().eq('id', id);
    if (!del.error) {
      const auth = await admin.auth.admin.deleteUser(id);
      if (auth.error) errors.push(`auth delete ${id}: ${auth.error.message}`);
      usersDeleted++;
      continue;
    }
    // FK-blocked (reports / mod_actions / audit attribution) → anonymise (§19).
    usersAnonymised++;
    await admin
      .from('users')
      .update({ status: 'deleted', email: null, phone: null })
      .eq('id', id);
    await admin
      .from('profiles')
      .update({
        display_name: 'Deleted member',
        bio: null,
        avatar_path: null,
        avatar_blurhash: null,
        cover_path: null,
        cover_blurhash: null,
        skills: [],
        lanes: [],
      })
      .eq('user_id', id);
  }

  await tryDelete('markers', () => admin.from('seed_runs').delete().like('label', 'test-community-%'));
  return { usersDeleted, usersAnonymised, errors };
}
