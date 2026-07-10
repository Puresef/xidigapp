import { apiOk, handleApiError } from '@/lib/api';
import { requireApiKey } from '@/lib/api-keys/guard';
import { collectDigestCandidates } from '@/lib/digest/candidates';
import { digestWindow } from '@/lib/digest/period';

/**
 * Deterministic weekly-digest candidates (GET, `read` scope, §21).
 *
 * Returns the same visibility-safe, PII-free candidate set the digest job uses
 * — top Wins, open Asks, new public Labs, new listings, the mentor highlight —
 * for the current 7-day window. No ranking, no personalization: an external
 * agent gets exactly what a member would see, nothing private.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/external/digest/candidates';

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(request, 'read', ROUTE);
    const candidates = await collectDigestCandidates(ctx.admin, digestWindow());
    return apiOk(candidates);
  } catch (error) {
    return handleApiError(error);
  }
}
