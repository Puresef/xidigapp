import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { apiNotice, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  getProfileCountry,
  loadCandidateForViewer,
  parseCandidateId,
} from '@/lib/capital/candidates-api';
import { getGeoCountry, evaluateCapitalGate } from '@/lib/capital/region-gate';
import { candidateInterestSchema, interestTypeSchema } from '@/lib/capital/schemas';
import type { InterestCounts } from '@/lib/capital/views';
import { BADGE_SLUGS } from '@/lib/reputation/constants';
import { awardBadge } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Candidate interest signals (§17, compliance-critical).
 *
 *   help  ("I can help")  — non-financial, any member, ALL regions, NEVER gated.
 *   cosign (Garab)        — non-financial, any member, ALL regions, NEVER gated.
 *   invest (Maalgeli)     — SOMALIA-REGION GATED: geo-IP country AND profile
 *                           country AND self-attestation, all three required.
 *
 * For invest we ALWAYS evaluate + LOG the gate (evaluateCapitalGate writes an
 * append-only capital_gate_evaluations row). If the gate is not granted we do
 * NOT create the invest interest and return the informational
 * capital_region_gated notice — no invest action, no invest data. Reading a
 * candidate is required for any interest (a hidden candidate is a 404). Writes
 * go through the service role; counts return via candidate_interest_counts.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

async function readCounts(
  admin: ReturnType<typeof getSupabaseAdmin>,
  candidateId: string,
): Promise<InterestCounts> {
  const { data, error } = await admin.rpc('candidate_interest_counts', { cand: candidateId });
  if (error) throw new Error(`interest counts failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { help: number; cosign: number; invest: number }
    | undefined;
  return { help: row?.help ?? 0, cosign: row?.cosign ?? 0, invest: row?.invest ?? 0 };
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const input = candidateInterestSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    // Must be able to read the candidate to express interest on it.
    await loadCandidateForViewer(ctx, id);

    if (input.type === 'invest') {
      // Region gate: geo header + profile country + attestation, all three.
      const geoCountry = getGeoCountry(request);
      const profileCountry = await getProfileCountry(admin, ctx.appUser.id);
      const decision = await evaluateCapitalGate(admin, {
        userId: ctx.appUser.id,
        profileCountry,
        geoCountry,
        attested: input.attested === true,
        candidateId: id,
      });

      if (!decision.granted) {
        // Do NOT create the invest interest — informational view only.
        return apiNotice('capital_region_gated', {
          reason: decision.reason,
          counts: await readCounts(admin, id),
        });
      }
    }

    const { error } = await admin.from('interests').upsert(
      {
        candidate_id: id,
        user_id: ctx.appUser.id,
        type: input.type,
        message: input.message ?? null,
      },
      { onConflict: 'candidate_id,user_id,type' },
    );
    if (error) throw new Error(`interest upsert failed: ${error.message}`);

    emitServer(event('interest_expressed', { type: input.type, scope: 'candidate' }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });
    // A real "backing" (cosign/invest, not help) earns the Early Backer badge once.
    if (input.type === 'cosign' || input.type === 'invest') {
      await awardBadge(admin, { userId: ctx.appUser.id, slug: BADGE_SLUGS.earlyBacker });
    }

    return apiOk({ counts: await readCounts(admin, id), type: input.type });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    // Retract a specific interest type (?type=help|cosign|invest).
    const type = interestTypeSchema.parse(new URL(request.url).searchParams.get('type'));
    const admin = getSupabaseAdmin();

    await loadCandidateForViewer(ctx, id);

    const { error } = await admin
      .from('interests')
      .delete()
      .eq('candidate_id', id)
      .eq('user_id', ctx.appUser.id)
      .eq('type', type);
    if (error) throw new Error(`interest retract failed: ${error.message}`);

    return apiOk({ counts: await readCounts(admin, id), type });
  } catch (error) {
    return handleApiError(error);
  }
}
