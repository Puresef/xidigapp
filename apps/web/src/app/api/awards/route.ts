import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Community Awards (§20) — quarterly member voting.
 *
 * GET  returns the currently OPEN cycle (award_cycles where now() is inside the
 *      window, newest first) plus the caller's own ballots for that quarter
 *      (award_votes select-own under RLS). No open cycle → { cycle: null }.
 *
 * POST casts ONE vote for a category. The open cycle is resolved SERVER-SIDE
 *      (never trust a client quarter). Writes go through the service-role admin
 *      client AFTER requireUser() — award_votes writes are revoked from
 *      authenticated, and a DB trigger independently rejects a vote outside an
 *      open cycle. One vote per (quarter, category, voter): the unique
 *      constraint surfaces as 23505 → already_voted (409). No live tally ever
 *      reaches a member (results are published to Plaza after the cycle by an
 *      admin flow — see parent follow-on).
 */

const CATEGORIES = ['best_lab', 'best_win', 'most_helpful', 'rising_builder'] as const;
const TARGET_TYPES = ['lab', 'post', 'user'] as const;

/** Each category accepts exactly one kind of target (§20). */
const CATEGORY_TARGET_TYPE: Record<(typeof CATEGORIES)[number], (typeof TARGET_TYPES)[number]> = {
  best_lab: 'lab',
  best_win: 'post',
  most_helpful: 'user',
  rising_builder: 'user',
};

const voteSchema = z
  .object({
    category: z.enum(CATEGORIES),
    targetType: z.enum(TARGET_TYPES),
    targetId: z.string().uuid(),
  })
  .strict();

/**
 * The API is the real ballot guard (the client option lists are only
 * presentational). Confirm the target EXISTS and is the right kind for the
 * category, checked through the caller's RLS client so a member can only vote
 * for a target they can actually see (no private Lab, no invented uuid). Wins
 * must be `win`-type posts.
 */
async function targetIsValid(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  targetType: (typeof TARGET_TYPES)[number],
  targetId: string,
): Promise<boolean> {
  if (targetType === 'lab') {
    const { data } = await supabase.from('labs').select('id').eq('id', targetId).maybeSingle();
    return Boolean(data);
  }
  if (targetType === 'post') {
    const { data } = await supabase
      .from('posts')
      .select('id')
      .eq('id', targetId)
      .eq('type', 'win')
      .maybeSingle();
    return Boolean(data);
  }
  const { data } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', targetId)
    .maybeSingle();
  return Boolean(data);
}

/** The open cycle right now (newest window if several ever overlap), or null. */
async function resolveOpenCycle(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
): Promise<{ quarter: string; opensAt: string; closesAt: string } | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('award_cycles')
    .select('quarter, opens_at, closes_at')
    .lte('opens_at', nowIso)
    .gt('closes_at', nowIso)
    .order('opens_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`award cycle lookup failed: ${error.message}`);
  if (!data) return null;
  return { quarter: data.quarter, opensAt: data.opens_at, closesAt: data.closes_at };
}

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const cycle = await resolveOpenCycle(ctx.supabase);

    if (!cycle) {
      return apiOk({ cycle: null, votes: [] });
    }

    // Own ballots for the open quarter (RLS: award_votes_select_own).
    const { data: votes, error } = await ctx.supabase
      .from('award_votes')
      .select('category, target_type, target_id')
      .eq('quarter', cycle.quarter);
    if (error) throw new Error(`award votes lookup failed: ${error.message}`);

    return apiOk({
      cycle,
      votes: (votes ?? []).map((v) => ({
        category: v.category,
        targetType: v.target_type,
        targetId: v.target_id,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    // requireUser() already blocks suspended / deactivated / deleted accounts.
    const ctx = await requireUser();
    const input = voteSchema.parse(await request.json());

    // Resolve the open cycle server-side — the client never supplies the quarter.
    const cycle = await resolveOpenCycle(ctx.supabase);
    if (!cycle) throw new ApiError('no_open_cycle', 409);

    // Ballot integrity (§20): the category dictates the target kind, the target
    // must exist + be visible to the voter, and you can't vote for yourself.
    if (input.targetType !== CATEGORY_TARGET_TYPE[input.category]) {
      throw new ApiError('invalid_request', 400);
    }
    if (input.targetType === 'user' && input.targetId === ctx.appUser.id) {
      throw new ApiError('invalid_request', 400);
    }
    if (!(await targetIsValid(ctx.supabase, input.targetType, input.targetId))) {
      throw new ApiError('invalid_request', 400);
    }

    // Sensitive write: award_votes is service-role-only. The DB trigger
    // (award_votes_require_open_cycle) is the defense-in-depth net; the unique
    // (quarter, category, voter) constraint enforces one vote per category.
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('award_votes').insert({
      quarter: cycle.quarter,
      category: input.category,
      voter_user_id: ctx.appUser.id,
      target_type: input.targetType,
      target_id: input.targetId,
    });

    if (error) {
      if (error.code === '23505') throw new ApiError('already_voted', 409);
      throw new Error(`award vote insert failed: ${error.message}`);
    }

    return apiOk(
      {
        quarter: cycle.quarter,
        category: input.category,
        targetType: input.targetType,
        targetId: input.targetId,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
