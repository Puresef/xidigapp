import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  hasCapability,
  loadCandidateForViewer,
  parseCandidateId,
} from '@/lib/capital/candidates-api';
import { candidateVoteSchema } from '@/lib/capital/schemas';
import { voteWindow } from '@/lib/capital/tally';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { CandidateRow, VoteTally } from '@/lib/capital/views';

/** Statuses that accept a governance vote — mirrors the c/[id] vote panel gate. */
const VOTABLE_STATUSES = new Set<CandidateRow['status']>(['submitted', 'in_review']);

/**
 * Supporter governance vote on a candidate (§12/§17). Casting/retracting needs
 * the vote_candidate capability (Supporter) AND an OPEN vote window — the 7-day
 * window opened at submit. Ballots are own-row-only (private, like Plaza polls),
 * so the response returns the aggregate tally via the SECURITY DEFINER
 * candidate_vote_tally rpc, never individual ballots. This is a non-binding
 * SIGNAL — v1.0 attaches no execution flow. Writes go through the service role.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

/** 403/409 guardrails shared by POST + DELETE, then return the fresh tally. */
async function requireOpenSupporterVote(
  ctx: Awaited<ReturnType<typeof requireUser>>,
  cand: CandidateRow,
): Promise<void> {
  if (!(await hasCapability(ctx, 'vote_candidate'))) throw new ApiError('not_supporter', 403);
  // A decided candidate no longer accepts governance votes even if the 7-day
  // window is still open (a reviewer can decide before the window elapses). This
  // mirrors the c/[id] vote-panel gate (status in submitted | in_review).
  if (!VOTABLE_STATUSES.has(cand.status)) throw new ApiError('vote_closed', 409);
  // Window must be open: opened at submit, closes 7 days later.
  if (!cand.vote_opens_at) throw new ApiError('vote_closed', 409);
  const now = new Date();
  const closes = cand.vote_closes_at
    ? new Date(cand.vote_closes_at)
    : voteWindow(cand.vote_opens_at).closesAt;
  const open = now >= new Date(cand.vote_opens_at) && now < closes;
  if (!open) throw new ApiError('vote_closed', 409);
}

async function readTally(
  admin: ReturnType<typeof getSupabaseAdmin>,
  candidateId: string,
): Promise<VoteTally> {
  const { data, error } = await admin.rpc('candidate_vote_tally', { cand: candidateId });
  if (error) throw new Error(`vote tally failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { approve: number; reject: number; total: number }
    | undefined;
  return { approve: row?.approve ?? 0, reject: row?.reject ?? 0, total: row?.total ?? 0 };
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const input = candidateVoteSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const cand = await loadCandidateForViewer(ctx, id);
    await requireOpenSupporterVote(ctx, cand);

    const { error } = await admin.from('candidate_votes').upsert(
      { candidate_id: id, voter_user_id: ctx.appUser.id, vote: input.vote },
      { onConflict: 'candidate_id,voter_user_id' },
    );
    if (error) throw new Error(`vote upsert failed: ${error.message}`);

    return apiOk({ tally: await readTally(admin, id), myVote: input.vote });
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
    await requireOpenSupporterVote(ctx, cand);

    const { error } = await admin
      .from('candidate_votes')
      .delete()
      .eq('candidate_id', id)
      .eq('voter_user_id', ctx.appUser.id);
    if (error) throw new Error(`vote retract failed: ${error.message}`);

    return apiOk({ tally: await readTally(admin, id), myVote: null });
  } catch (error) {
    return handleApiError(error);
  }
}
