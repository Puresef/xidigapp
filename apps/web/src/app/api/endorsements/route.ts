import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/endorsements — peer skill endorsement (§14, Xirfadaha module).
 *
 * Written through the CALLER's RLS client, not the service role: the endorser
 * is acting as themselves, and `skill_endorsements_insert_own` already pins
 * `endorser_user_id` to `auth.uid()`. Routing it through the admin client would
 * mean the route, not the database, decides who may endorse — and would silently
 * bypass the `is_active_account()` half of that policy.
 *
 * The skill must already be on the endorsee's profile. Without that check an
 * endorsement is a write primitive into someone else's identity: the chip is
 * rendered from the endorsement rows, so a stranger could put any word on
 * another member's profile and attest to it.
 *
 * Counts on this surface are DISTINCT endorsers by construction — the
 * unique(endorser, endorsee, skill) constraint is what makes acceptance A8 a
 * structural fact rather than a query convention, so a repeat is a 200, not a
 * second row.
 */

const postSchema = z
  .object({
    userId: z.string().uuid(),
    // Matches profiles.skills (max 40) and the DB's btrim(lower()) trigger, so
    // "React" endorses the same chip the profile renders as "react".
    skill: z.string().trim().toLowerCase().min(1).max(40),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = postSchema.parse(await request.json());

    if (input.userId === ctx.appUser.id) throw new ApiError('endorse_self', 400);

    await enforceRateLimit(`endorse:${ctx.appUser.id}`, { max: 60, windowSeconds: 3600 });

    // RLS-scoped: a profile the caller cannot read cannot be endorsed.
    const { data: endorsee, error: lookupError } = await ctx.supabase
      .from('profiles')
      .select('skills')
      .eq('user_id', input.userId)
      .maybeSingle();
    if (lookupError) throw new Error(`endorsee lookup failed: ${lookupError.message}`);
    if (!endorsee) throw new ApiError('not_found', 404);
    if (!endorsee.skills.includes(input.skill)) throw new ApiError('invalid_request', 400);

    const { error } = await ctx.supabase.from('skill_endorsements').insert({
      endorser_user_id: ctx.appUser.id,
      endorsee_user_id: input.userId,
      skill: input.skill,
    });

    let created = true;
    if (error) {
      // 23505 = skill_endorsements_unique. Endorsing twice is the same fact
      // stated twice, so it succeeds and the count stays where it was.
      if (error.code === '23505') created = false;
      // 23514 = skill_endorsements_no_self, reachable only if the id check
      // above is ever bypassed. Same §27 sentence, never a 500.
      else if (error.code === '23514') throw new ApiError('endorse_self', 400);
      else throw new Error(`endorsement insert failed: ${error.message}`);
    }

    const { count, error: countError } = await ctx.supabase
      .from('skill_endorsements')
      .select('endorser_user_id', { count: 'exact', head: true })
      .eq('endorsee_user_id', input.userId)
      .eq('skill', input.skill);
    if (countError) throw new Error(`endorsement count failed: ${countError.message}`);

    if (created) {
      emitServer(event('skill_endorsed', {}), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    }

    return apiOk({ endorsed: true, endorsers: count ?? 0 }, created ? 201 : 200);
  } catch (error) {
    return handleApiError(error);
  }
}
