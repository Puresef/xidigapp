import { createTranslator } from '@xidig/i18n';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { publishAwardResults } from '@/lib/awards/publish';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Admin: publish a closed Community-Awards cycle (§20, Munaasabado Task 8).
 * Tally → winners → one system-provenance Plaza post per category →
 * award_results rows → cycle stamped {published_at, results_post_id}. The
 * flow itself lives in lib/awards/publish.ts; this route owns authz, the
 * audit line, and the §23 analytics signal. Idempotent: a published cycle
 * returns 200 {already: true} and touches nothing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QUARTER_REGEX = /^\d{4}-Q[1-4]$/;

interface Ctx {
  params: Promise<{ quarter: string }>;
}

export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const { quarter } = await params;
    if (!QUARTER_REGEX.test(quarter)) throw new ApiError('not_found', 404);

    const admin = getSupabaseAdmin();
    // The stored post body is a permanent platform artifact (search
    // snippets, digests, push previews), not this request's response — it
    // always renders Somali, regardless of the publishing admin's own locale
    // (the app is SO-default). API error messages below are unaffected: they
    // never route through this translator.
    const t = createTranslator('so');
    const result = await publishAwardResults(admin, quarter, t);
    if ('already' in result) return apiOk({ already: true });

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'award_cycle.published',
      metadata: { quarter, posts: result.postIds.length },
    });
    // §23: quarter is a closed-format taxonomy string (YYYY-Qn) — no PII.
    emitServer(event('award_results_published', { quarter }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ postIds: result.postIds });
  } catch (error) {
    return handleApiError(error);
  }
}
