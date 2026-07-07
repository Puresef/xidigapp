import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getProfileCountry } from '@/lib/capital/candidates-api';
import { evaluateCapitalGate, getGeoCountry } from '@/lib/capital/region-gate';
import { gateEvaluateSchema } from '@/lib/capital/schemas';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Evaluate + persist the Somalia region gate for the current session (§17,
 * compliance-critical). This is what the Maalgeli UI calls to decide whether to
 * show the invest surface at all: it reads the three signals — profile country,
 * geo-IP-derived country header, and the self-attestation checkbox — and returns
 * the decision. evaluateCapitalGate ALWAYS writes an append-only
 * capital_gate_evaluations row (compliance log) regardless of the outcome; the
 * raw IP is never read or stored. This is a decision-only endpoint — it creates
 * no interest.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = gateEvaluateSchema.parse(await request.json());
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

    return apiOk({ granted: decision.granted, reason: decision.reason });
  } catch (error) {
    return handleApiError(error);
  }
}
