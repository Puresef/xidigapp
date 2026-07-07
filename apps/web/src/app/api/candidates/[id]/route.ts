import type { TablesUpdate } from '@xidig/db';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  loadCandidateForViewer,
  parseCandidateId,
  requireCandidateManager,
} from '@/lib/capital/candidates-api';
import { candidateUpdateSchema } from '@/lib/capital/schemas';
import { getCandidateView, type CandidateRow } from '@/lib/capital/views';
import { loadAttachableMedia } from '@/lib/media/attach';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * A single Capital candidate (§10/§17).
 *
 * GET returns the full hydrated view (lab, creator, rubric aggregate, reviews,
 * vote tally, interest counts, viewer's own signals, media, timeline) under the
 * caller's RLS — a candidate they can't read is a plain 404.
 *
 * PATCH edits content fields + logo/cover art + visibility. Only the creator or
 * a Lab lead/core (or admin) may edit, and only while the candidate is still
 * draft or submitted — once a reviewer moves it to in_review/terminal the pitch
 * freezes. Media ids are re-validated at attach time (owner + kind + scan) and
 * denormalized onto the row. Writes go through the service role.
 *
 * DELETE removes a candidate but ONLY while it is a draft (creator/lead/admin) —
 * a submitted or reviewed candidate is part of the governance record and is
 * parked/declined, never deleted.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Content fields become editable only in these pre-review states. */
const EDITABLE_STATUSES = new Set<CandidateRow['status']>(['draft', 'submitted']);

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const admin = getSupabaseAdmin();

    const view = await getCandidateView(ctx.supabase, admin, id, ctx.appUser.id);
    if (!view) throw new ApiError('not_found', 404);
    return apiOk({ candidate: view });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const input = candidateUpdateSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const cand = await loadCandidateForViewer(ctx, id);
    await requireCandidateManager(admin, ctx, cand);
    if (!EDITABLE_STATUSES.has(cand.status)) throw new ApiError('post_not_editable', 409);

    const patch: TablesUpdate<'venture_candidates'> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.oneLiner !== undefined) patch.one_liner = input.oneLiner;
    if (input.problem !== undefined) patch.problem = input.problem;
    if (input.solution !== undefined) patch.solution = input.solution;
    if (input.traction !== undefined) patch.traction = input.traction;
    if (input.team !== undefined) patch.team = input.team;
    if (input.ask !== undefined) patch.ask = input.ask;
    if (input.visibility !== undefined) patch.visibility = input.visibility;

    // Logo/cover: null clears, a media id attaches after the shared owner+kind+
    // scan re-check (media_not_ready on any failure — never reveal which check).
    if (input.logoMediaId !== undefined) {
      if (input.logoMediaId === null) {
        patch.logo_path = null;
        patch.logo_blurhash = null;
      } else {
        const media = await loadAttachableMedia(admin, ctx.appUser.id, input.logoMediaId, [
          'candidate_logo',
        ]);
        patch.logo_path = media.storage_path;
        patch.logo_blurhash = media.blurhash;
      }
    }
    if (input.coverMediaId !== undefined) {
      if (input.coverMediaId === null) {
        patch.cover_path = null;
        patch.cover_blurhash = null;
      } else {
        const media = await loadAttachableMedia(admin, ctx.appUser.id, input.coverMediaId, [
          'candidate_cover',
        ]);
        patch.cover_path = media.storage_path;
        patch.cover_blurhash = media.blurhash;
      }
    }

    if (Object.keys(patch).length === 0) throw new ApiError('invalid_request', 400);
    patch.updated_at = new Date().toISOString();

    const { error } = await admin.from('venture_candidates').update(patch).eq('id', id);
    if (error) throw new Error(`candidate update failed: ${error.message}`);

    const view = await getCandidateView(ctx.supabase, admin, id, ctx.appUser.id);
    if (!view) throw new ApiError('not_found', 404);
    return apiOk({ candidate: view });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const admin = getSupabaseAdmin();

    const cand = await loadCandidateForViewer(ctx, id);
    await requireCandidateManager(admin, ctx, cand);
    if (cand.status !== 'draft') throw new ApiError('post_not_editable', 409);

    const { error } = await admin.from('venture_candidates').delete().eq('id', id);
    if (error) throw new Error(`candidate delete failed: ${error.message}`);

    return apiOk({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
