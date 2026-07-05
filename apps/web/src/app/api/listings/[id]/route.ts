import { z } from 'zod';

import { ApiError, apiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { listingUpdateSchema } from '@/lib/listings';

import type { TablesUpdate } from '@xidig/db';

/**
 * A single business listing (§18). GET reads under RLS (published, or the
 * caller's own / mod). PATCH edits content columns — RLS + column grants scope
 * it to the owner; a mod edits through the same route via their broader
 * select/update policies. Gated columns (status, verification_status, source,
 * export_readiness_score) are not writable here.
 */

const SELECT =
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at';

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = idSchema.safeParse((await context.params).id);
    if (!id.success) throw new ApiError('not_found', 404);

    const { data: listing, error } = await ctx.supabase
      .from('business_listings')
      .select(SELECT)
      .eq('id', id.data)
      .maybeSingle();
    if (error) throw new Error(`listing lookup failed: ${error.message}`);
    if (!listing) throw new ApiError('not_found', 404);

    return apiOk({ listing });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = idSchema.safeParse((await context.params).id);
    if (!id.success) throw new ApiError('not_found', 404);

    const patch = listingUpdateSchema.parse(await request.json());

    const { data: updated, error } = await ctx.supabase
      .from('business_listings')
      .update(patch as unknown as TablesUpdate<'business_listings'>)
      .eq('id', id.data)
      .select(SELECT)
      .maybeSingle();
    if (error) {
      if (error.code === '23503') return apiError('invalid_request', 400);
      throw new Error(`listing update failed: ${error.message}`);
    }
    // RLS returned no row: not the owner (or no such listing). Either way, 404
    // (don't confirm existence of a listing they can't edit).
    if (!updated) throw new ApiError('not_found', 404);

    return apiOk({ listing: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
