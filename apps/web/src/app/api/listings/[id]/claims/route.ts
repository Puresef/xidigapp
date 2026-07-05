import { z } from 'zod';

import { ApiError, apiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * "Claim this listing" (§18) — a member asserts ownership of an unclaimed
 * (seeded/imported) listing. RLS (listing_claims_insert_own) already enforces
 * that the claimant is the caller AND the listing is currently unowned; a mod
 * reviews the claim (PATCH /api/claims/[id]) and, on approval, ownership
 * transfers.
 */

const idSchema = z.string().uuid();
const bodySchema = z.object({
  evidence: z.string().trim().min(1).max(1000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const listingId = idSchema.safeParse((await context.params).id);
    if (!listingId.success) throw new ApiError('not_found', 404);

    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const { data: claim, error } = await ctx.supabase
      .from('listing_claims')
      .insert({
        listing_id: listingId.data,
        claimant_user_id: ctx.appUser.id,
        evidence: body.evidence ?? null,
      })
      .select('id, listing_id, status, created_at')
      .single();

    if (error) {
      // RLS check failed: the listing doesn't exist or is already owned.
      if (error.code === '42501') return apiError('forbidden', 403);
      // 23505 on listing_claims_one_pending_per_member: the member already
      // has an open claim on this listing (double-submit). Idempotent — the
      // existing pending claim stands.
      if (error.code === '23505') {
        const { data: existing } = await ctx.supabase
          .from('listing_claims')
          .select('id, listing_id, status, created_at')
          .eq('listing_id', listingId.data)
          .eq('claimant_user_id', ctx.appUser.id)
          .eq('status', 'pending')
          .limit(1)
          .single();
        return apiOk({ claim: existing }, 200);
      }
      throw new Error(`claim insert failed: ${error.message}`);
    }

    return apiOk({ claim }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
