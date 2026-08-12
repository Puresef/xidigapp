import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { hydrateOneLab, loadLabForViewer, parseLabId, requireLabManager } from '@/lib/labs-api';
import { promoteSchema } from '@/lib/labs/schemas';
import { promoteToCandidate, promoteToLab } from '@/lib/labs/service';
import { venturePromoteSchema } from '@/lib/maal/schemas';
import { promoteToVenture } from '@/lib/maal/service';
import { loadVentureForViewer } from '@/lib/maal/views';
import { isSupporter } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The promote-only ladder (§16): Koox → Warshad → { Venture Candidate, Maal }.
 * Promotion is additive — it never deletes history, members, updates, artifacts,
 * decisions, or the URL/slug. There is deliberately no member-facing demotion
 * endpoint: demotion is system-driven only (the Maal→Warshad timeout path,
 * logged to the Governance Log and history-preserving), never something a member
 * or lead can trigger here.
 *
 *   - target 'lab':       Club → Lab. Requires a complete charter (fills gaps
 *                         from the body) AND the create_lab capability.
 *   - target 'candidate': Lab → Venture Candidate. A hand-off MARKER only —
 *                         creates a draft venture_candidates row and stops.
 *                         No Capital / investment flow is built in Phase 4.
 *   - target 'venture':   Warshad → Maal (F2 §5). The venture workspace stays on
 *                         /labs/[slug] (plan D2), so this only moves the stage:
 *                         `space_mode`, `venture_since`, the declared goal and a
 *                         seeded weight scheme. Preconditions live in
 *                         promoteToVenture() — complete charter, a declared goal,
 *                         and at least one workstream with a NAMED owner.
 *
 * `target: 'venture'` is branched HERE rather than added to `promoteSchema`'s
 * discriminated union. The union lives in lib/labs (the Phase 4 ladder) and the
 * venture body in lib/maal (F2); folding one into the other would make the
 * Phase 4 schema module depend on Maal's constants and would put an F2-owned
 * shape inside a Phase-4-owned union. This route is already the only place that
 * knows both domains, so the discriminator is read once and each domain parses
 * its own body.
 *
 * Only the lead or a platform admin may promote.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Read the discriminator only — each branch then parses with its own schema. */
const targetSchema = z.object({ target: z.enum(['lab', 'candidate', 'venture']) });

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const body: unknown = await request.json();
    const { target } = targetSchema.parse(body);

    if (target === 'venture') {
      const input = venturePromoteSchema.parse(body);
      const lab = await loadVentureForViewer(ctx, id);
      requireLabManager(ctx, lab);
      // A Koox promotes to a Warshad first, and a Maal is already there — both
      // are a bad request, not a "not ready" the lead could fix.
      if (lab.space_mode !== 'lab') throw new ApiError('invalid_request', 400);

      const admin = getSupabaseAdmin();
      const updated = await promoteToVenture(admin, lab, ctx.appUser.id, input);
      return apiOk({ lab: await hydrateOneLab(admin, ctx.appUser.id, updated) });
    }

    const input = promoteSchema.parse(body);
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
