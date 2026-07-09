import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { apiNotice, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getProfileCountry } from '@/lib/capital/candidates-api';
import { evaluateCapitalGate, getGeoCountry } from '@/lib/capital/region-gate';
import { fundInterestSchema } from '@/lib/capital/schemas';
import { BADGE_SLUGS } from '@/lib/reputation/constants';
import { awardBadge } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Fund-first funnel (§17, compliance-critical): a standing fund-level invest
 * intent in the Xidig Venture Fund (interests row with candidate_id = null,
 * type = 'invest'). The Maalgeli CTA opens the fund modal FIRST, so this is the
 * primary invest surface. It is ALWAYS region-gated — geo + profile country +
 * attestation, all three — and every evaluation is logged. Not granted → do NOT
 * create the intent, return the informational capital_region_gated notice. One
 * standing fund intent per user (partial unique index). Writes via service role.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = fundInterestSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const geoCountry = getGeoCountry(request);
    const profileCountry = await getProfileCountry(admin, ctx.appUser.id);

    const decision = await evaluateCapitalGate(admin, {
      userId: ctx.appUser.id,
      profileCountry,
      geoCountry,
      attested: input.attested,
      candidateId: null,
    });

    if (!decision.granted) {
      return apiNotice('capital_region_gated', { reason: decision.reason });
    }

    // One standing fund intent per user (partial unique index) — treat a
    // duplicate as idempotent success rather than a hard 409.
    const { error } = await admin.from('interests').insert({
      candidate_id: null,
      user_id: ctx.appUser.id,
      type: 'invest',
      message: input.message ?? null,
    });
    if (error && error.code !== '23505') throw new Error(`fund interest insert failed: ${error.message}`);

    emitServer(event('interest_expressed', { type: 'invest', scope: 'fund' }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });
    await awardBadge(admin, { userId: ctx.appUser.id, slug: BADGE_SLUGS.earlyBacker });

    return apiOk({ registered: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const admin = getSupabaseAdmin();

    const { error } = await admin
      .from('interests')
      .delete()
      .eq('user_id', ctx.appUser.id)
      .is('candidate_id', null)
      .eq('type', 'invest');
    if (error) throw new Error(`fund interest delete failed: ${error.message}`);

    return apiOk({ registered: false });
  } catch (error) {
    return handleApiError(error);
  }
}
