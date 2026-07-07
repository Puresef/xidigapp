import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@xidig/db';

import { ApiError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/guards';
import { CANDIDATE_COLUMNS, type CandidateRow } from '@/lib/capital/views';
import { getLabMembership } from '@/lib/labs-api';

/**
 * Route-orchestration helpers for the /api/candidates* + /api/capital* families
 * (CAPITAL-API only — the UI never imports this; reusable read models live in
 * lib/capital/views.ts and lib/capital/schemas.ts).
 *
 * Reads run under the CALLER's RLS (can_read_candidate governs draft/
 * reviewers-only/members visibility, so a hidden candidate is a plain 404);
 * privileged writes go through the service role AFTER the route's own authz
 * check. Recusal + reviewer eligibility + region gating are enforced here and in
 * the individual routes, never trusted from the client.
 */

const uuidSchema = z.string().uuid();

/** Invalid uuid → 404 (don't leak the path-shape problem). */
export function parseCandidateId(raw: string): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

/** RLS-scoped single-candidate load; whatever RLS hides is a plain 404. */
export async function loadCandidateForViewer(
  ctx: AuthContext,
  id: string,
): Promise<CandidateRow> {
  const { data, error } = await ctx.supabase
    .from('venture_candidates')
    .select(CANDIDATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`candidate lookup failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  return data as unknown as CandidateRow;
}

/**
 * True when the caller may edit/submit/manage the candidate: its creator, a
 * lead/core of the owning Lab (or co-Lab), or a platform admin. Membership is
 * read authoritatively via the service role (RLS-independent).
 */
export async function isCandidateManager(
  admin: SupabaseClient<Database>,
  ctx: AuthContext,
  cand: CandidateRow,
): Promise<boolean> {
  if (ctx.appUser.role === 'admin') return true;
  if (cand.created_by_user_id === ctx.appUser.id) return true;

  const labIds = [cand.lab_id, cand.co_lab_id].filter((v): v is string => typeof v === 'string');

  // Authoritative Lab lead lives on labs.lead_user_id (a member row may also
  // carry role 'lead'); either path plus 'core' counts as a manager.
  const { data: leadLabs, error: leadError } = await admin
    .from('labs')
    .select('id')
    .in('id', labIds)
    .eq('lead_user_id', ctx.appUser.id);
  if (leadError) throw new Error(`lab lead lookup failed: ${leadError.message}`);
  if ((leadLabs ?? []).length > 0) return true;

  for (const labId of labIds) {
    const membership = await getLabMembership(admin, labId, ctx.appUser.id);
    if (
      membership &&
      membership.status === 'active' &&
      (membership.role === 'lead' || membership.role === 'core')
    ) {
      return true;
    }
  }
  return false;
}

/** 403 (forbidden) unless the caller manages this candidate. */
export async function requireCandidateManager(
  admin: SupabaseClient<Database>,
  ctx: AuthContext,
  cand: CandidateRow,
): Promise<void> {
  if (!(await isCandidateManager(admin, ctx, cand))) throw new ApiError('forbidden', 403);
}

/**
 * Reviewer eligibility for v1.0 (§17): mod/admin AND NOT a member of the
 * candidate's Lab/co-Lab (recusal). The DB SECURITY DEFINER can_review_candidate
 * is authoritative; the RLS-scoped client evaluates it against auth.uid().
 * Distinguishes the two failure modes so the route can return the right §27
 * copy: `not_a_reviewer` (403) when the caller is not mod/admin at all, and
 * `reviewer_conflict` (403) when they ARE a reviewer but are recused.
 */
export async function requireReviewer(ctx: AuthContext, candidateId: string): Promise<void> {
  const isModOrAdmin = ctx.appUser.role === 'mod' || ctx.appUser.role === 'admin';
  if (!isModOrAdmin) throw new ApiError('not_a_reviewer', 403);

  const { data, error } = await ctx.supabase.rpc('can_review_candidate', { cand: candidateId });
  if (error) throw new Error(`reviewer check failed: ${error.message}`);
  // A mod/admin who fails can_review_candidate is recused (Lab member) — §17.
  if (!data) throw new ApiError('reviewer_conflict', 403);
}

/** The caller's Somalia region signals (profile country) for the invest gate. */
export async function getProfileCountry(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('location_country')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`profile country lookup failed: ${error.message}`);
  return data?.location_country ?? null;
}

/** True when the caller holds a membership capability (RLS-scoped rpc). */
export async function hasCapability(
  ctx: AuthContext,
  cap: Database['public']['Enums']['membership_capability'],
): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('has_capability', { cap });
  if (error) throw new Error(`capability check failed: ${error.message}`);
  return data === true;
}
