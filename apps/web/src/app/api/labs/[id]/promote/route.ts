import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { hydrateOneLab, loadLabForViewer, parseLabId, requireLabManager } from '@/lib/labs-api';
import { promoteSchema } from '@/lib/labs/schemas';
import { promoteToCandidate, promoteToLab } from '@/lib/labs/service';
import { isSupporter } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The promote-only ladder (§16): Club → Lab → Venture Candidate. Promotion is
 * additive — it never deletes history, members, updates, artifacts, decisions,
 * or the URL/slug. There is NO demotion endpoint.
 *
 *   - target 'lab':       Club → Lab. Requires a complete charter (fills gaps
 *                         from the body) AND the create_lab capability.
 *   - target 'candidate': Lab → Venture Candidate. A hand-off MARKER only —
 *                         creates a draft venture_candidates row and stops.
 *                         No Capital / investment flow is built in Phase 4.
 *
 * Only the lead or a platform admin may promote.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = promoteSchema.parse(await request.json());

    const lab = await loadLabForViewer(ctx, id);
    requireLabManager(ctx, lab);
    const admin = getSupabaseAdmin();

    if (input.target === 'lab') {
      if (lab.space_mode !== 'club') throw new ApiError('invalid_request', 400);
      // Becoming a Lab is gated behind Supporter, same as creating one.
      if (!(await isSupporter(ctx))) throw new ApiError('not_supporter', 403);
      const updated = await promoteToLab(admin, lab, ctx.appUser.id, input);
      return apiOk({ lab: await hydrateOneLab(admin, ctx.appUser.id, updated) });
    }

    // target === 'candidate' — a Lab (not a Club) hands off to a Candidate.
    if (lab.space_mode !== 'lab') throw new ApiError('invalid_request', 400);
    const { candidateId } = await promoteToCandidate(admin, lab, ctx.appUser.id, input);
    return apiOk({ candidateId }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
