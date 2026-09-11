import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import { CONTRIBUTION_LOG_LIMIT, RATE_WINDOW_DAY_SECONDS } from '@/lib/maal/constants';
import { attestContribution } from '@/lib/maal/service';
import { getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * "Marag" — the co-sign that turns a logged unit into a witnessed one (7d:
 * "Halbeeg la xaqiijiyay wuxuu u baahan yahay marag: co-sign xubno ah ama
 * hoggaamiye — hoggaamiyuhu hawshiisa ma ansixin karo").
 *
 * Never your own: attestContribution() answers `attestation_recusal` 403 before
 * the write, so a member reads a sentence instead of a constraint. It is the
 * same rule the board states as `task_recusal`; two codes because the surfaces
 * differ and the copy has to name the right thing.
 *
 * Re-attesting is a no-op, not an error — the (event, attester) primary key
 * already says a witness witnesses once, so the response is the same 200 either
 * way and a double-tap costs the caller nothing.
 *
 * No body: a co-sign is a signature, not a comment.
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

export async function POST(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const params = await context.params;
    const id = parseLabId(params.id);
    const eventId = parseEventId(params.eventId);

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    // A witness has to have seen it: no ledger read, no signature. This is the
    // one ledger write that IS gated on reading, and it follows the design
    // rather than contradicting it — under a leads-only ledger, "co-sign xubno
    // ah ama hoggaamiye" simply resolves to the leads.
    if (!viewer.canContribute || !viewer.canReadLedger) throw new ApiError('forbidden', 403);

    await enforceRateLimit(`maal:attest:${ctx.appUser.id}`, {
      max: CONTRIBUTION_LOG_LIMIT,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });

    await attestContribution(admin, lab, ctx.appUser.id, eventId);
    return apiOk({ attested: true });
  } catch (error) {
    return handleApiError(error);
  }
}
