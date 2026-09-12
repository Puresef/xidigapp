import { z } from 'zod';

import { ApiError, handleApiError } from '@/lib/api';
import { requireActiveUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId, requireLabManager } from '@/lib/labs-api';

/**
 * The promote-only ladder (§16): Koox → Warshad → { Venture Candidate, Maal }.
 *
 * PAUSED for every target (Xidig Plus doctrine, owner 12 Sep: "pause, don't
 * broaden"). The paid tier must not decide Lab creation, candidate submission
 * or Venture/capital escalation, and no non-paid eligibility model is approved
 * yet. So:
 *
 *   - target 'lab'       (Club → Lab)           → 403 lab_eligibility_under_review
 *   - target 'candidate' (Lab → Candidate)      → 403 put_forward_under_review
 *   - target 'venture'   (Lab → Maal/Venture)   → 403 venture_promotion_under_review
 *
 * Leads of EXISTING Labs keep ordinary management and collaboration, but no
 * special candidate/Venture escalation right carried over from the old paid
 * mechanics (owner ruling). The create_lab capability is no longer consulted.
 * The promotion services (promoteToLab / promoteToCandidate /
 * promoteToVenture) are kept intact for a future approved rule. They are not
 * reachable from here.
 *
 * The caller must still be an active account that can manage the Space, so
 * the refusal reveals nothing to a stranger. The body is read only for its
 * discriminator.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Read the discriminator only — every target is refused while the ladder is paused. */
const targetSchema = z.object({ target: z.enum(['lab', 'candidate', 'venture']) });

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const id = parseLabId((await context.params).id);
    const body: unknown = await request.json();
    const { target } = targetSchema.parse(body);

    const lab = await loadLabForViewer(ctx, id);
    requireLabManager(ctx, lab);

    if (target === 'lab') throw new ApiError('lab_eligibility_under_review', 403);
    if (target === 'candidate') throw new ApiError('put_forward_under_review', 403);
    throw new ApiError('venture_promotion_under_review', 403);
  } catch (error) {
    return handleApiError(error);
  }
}
