import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mod review of a "Claim this listing" request (§18/§19). Approving transfers
 * ownership of the listing to the claimant and records the §23 listing_claimed
 * event plus an immutable audit row (§19). Ownership transfer is a service-role
 * write: business_listings.owner_user_id is not in any client column grant.
 */

const idSchema = z.string().uuid();
const bodySchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const mod = await requireRole('mod');
    const claimId = idSchema.safeParse((await context.params).id);
    if (!claimId.success) throw new ApiError('not_found', 404);

    const body = bodySchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const { data: claim, error: loadError } = await admin
      .from('listing_claims')
      .select('id, listing_id, claimant_user_id, status')
      .eq('id', claimId.data)
      .maybeSingle();
    if (loadError) throw new Error(`claim lookup failed: ${loadError.message}`);
    if (!claim) throw new ApiError('not_found', 404);
    if (claim.status !== 'pending') throw new ApiError('invalid_request', 400);

    const decidedAt = new Date().toISOString();

    const { error: claimError } = await admin
      .from('listing_claims')
      .update({ status: body.status, reviewed_by_user_id: mod.appUser.id, decided_at: decidedAt })
      .eq('id', claim.id);
    if (claimError) throw new Error(`claim update failed: ${claimError.message}`);

    if (body.status === 'approved') {
      const { error: transferError } = await admin
        .from('business_listings')
        .update({ owner_user_id: claim.claimant_user_id })
        .eq('id', claim.listing_id);
      if (transferError) throw new Error(`ownership transfer failed: ${transferError.message}`);

      emitServer(event('listing_claimed', {}), { distinctId: claim.claimant_user_id });
    }

    await writeAudit(admin, {
      actorUserId: mod.appUser.id,
      action: body.status === 'approved' ? 'listing_claim.approved' : 'listing_claim.rejected',
      targetType: 'listing_claim',
      targetId: claim.id,
      metadata: {
        listing_id: claim.listing_id,
        claimant_user_id: claim.claimant_user_id,
        ...(body.note ? { note: body.note } : {}),
      },
    });

    return apiOk({ claim: { id: claim.id, status: body.status, decided_at: decidedAt } });
  } catch (error) {
    return handleApiError(error);
  }
}
