import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import { CONTRIBUTION_LOG_LIMIT, RATE_WINDOW_DAY_SECONDS } from '@/lib/maal/constants';
import { contributionReversalSchema } from '@/lib/maal/schemas';
import { reverseContribution } from '@/lib/maal/service';
import { getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The correction. There is no PATCH and no DELETE on a work event anywhere in
 * this API, because there is none in the database either — the immutability
 * trigger refuses UPDATE and DELETE for every role including service_role. A
 * correction is a NEW event carrying the original's type and weight with a
 * negative quantity, so the two cancel to exactly zero units, plus
 * `reverses_event_id`, which is what makes it render as "Celin: {name} · …"
 * instead of a mysterious negative row.
 *
 * `reason` is required and is not decoration: 7g renders it, and an unexplained
 * reversal is an unexplained hole in someone's share.
 *
 * Who may: the member whose event it is, or a lead (checked in the service). An
 * event is corrected once — a correction of a correction would be an edit —
 * which the DB enforces with a partial unique index and this surface reports as
 * `contribution_already_reversed` rather than a raw 23505.
 */

interface Ctx {
  params: Promise<{ id: string; eventId: string }>;
}

const uuidSchema = z.string().uuid();

/** Invalid uuid → 404, the same posture parseLabId takes. */
function parseEventId(raw: string): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = await context.params;
    const id = parseLabId(params.id);
    const eventId = parseEventId(params.eventId);
    const input = contributionReversalSchema.parse(await request.json());

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    // Contributor level here, not reader level: reverseContribution() narrows to
    // "the member whose event it is, or a lead". A venture whose ledger is
    // leads-only must not leave its members holding a mistake they cannot take
    // back — the correction path is the one thing that must never be gated on
    // the display toggle.
    if (!viewer.canContribute) throw new ApiError('forbidden', 403);

    await enforceRateLimit(`maal:reverse:${ctx.appUser.id}`, {
      max: CONTRIBUTION_LOG_LIMIT,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });

    const reversal = await reverseContribution(admin, lab, ctx.appUser.id, eventId, input);
    return apiOk({ reversal }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
