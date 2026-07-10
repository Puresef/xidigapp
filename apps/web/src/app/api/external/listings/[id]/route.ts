import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireApiKey } from '@/lib/api-keys/guard';
import { writeAudit } from '@/lib/audit';
import { externalListingPatchSchema } from '@/lib/external/schemas';
import { updateSeededListing } from '@/lib/seed/content';

/**
 * Update a SEEDED business listing (PATCH, `listings:write` scope). Guarded so
 * an external caller can only ever mutate a seeded row — never a real member's
 * listing (updateSeededListing filters `source <> 'member'`).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/external/listings/:id';
const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireApiKey(request, 'listings:write', ROUTE);
    const { id } = paramsSchema.parse(await params);
    const patch = externalListingPatchSchema.parse(await request.json());

    const updated = await updateSeededListing(ctx.admin, id, patch);
    if (!updated) throw new ApiError('not_found', 404);

    await writeAudit(ctx.admin, {
      actorUserId: ctx.ownerUserId,
      apiKeyId: ctx.keyId,
      action: 'external.listing.updated',
      targetType: 'listing',
      targetId: id,
    });

    return apiOk({ id, updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
