import { z } from 'zod';

import { ApiError, apiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { listingUpdateSchema } from '@/lib/listings';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { TablesUpdate } from '@xidig/db';

/**
 * A single business listing (§18). GET reads under RLS (published, or the
 * caller's own / mod). PATCH edits content columns — RLS + column grants scope
 * it to the owner; a mod edits through the same route via their broader
 * select/update policies. Gated columns (status, verification_status, source,
 * export_readiness_score) are not writable here.
 *
 * Phase 4.5: PATCH also accepts `openingHours` / `priceRange` (columns with
 * grants — user-scoped write) and `services` (≤20, replace-all). Services
 * rows live in listing_services, which is API-only at the DB layer (no client
 * write grants), so that branch authorizes explicitly (owner or mod) and then
 * writes with the service role.
 */

const SELECT =
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at, opening_hours, price_range, primary_photo_path, primary_photo_blurhash, primary_photo_alt, photo_count';

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

    const { openingHours, priceRange, services, ...contentPatch } = listingUpdateSchema.parse(
      await request.json(),
    );

    // Wire names → columns. Both have column grants, so they ride the same
    // user-scoped RLS update as the Phase 1 content fields.
    const columnPatch: Record<string, unknown> = { ...contentPatch };
    if (openingHours !== undefined) columnPatch.opening_hours = openingHours;
    if (priceRange !== undefined) columnPatch.price_range = priceRange;

    // Services bypass RLS (service role), so authorize here: the listing must
    // be visible to the caller AND they must be its owner or a mod. 404 for
    // both "no such listing" and "not yours" — same contract as the RLS
    // update below, which returns no row in either case.
    if (services !== undefined) {
      const { data: row, error } = await ctx.supabase
        .from('business_listings')
        .select('id, owner_user_id')
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`listing lookup failed: ${error.message}`);
      const isMod = ctx.appUser.role === 'mod' || ctx.appUser.role === 'admin';
      if (!row || (row.owner_user_id !== ctx.appUser.id && !isMod)) {
        throw new ApiError('not_found', 404);
      }
    }

    let updated: Record<string, unknown> | null = null;
    if (Object.keys(columnPatch).length > 0) {
      const { data, error } = await ctx.supabase
        .from('business_listings')
        .update(columnPatch as unknown as TablesUpdate<'business_listings'>)
        .eq('id', id.data)
        .select(SELECT)
        .maybeSingle();
      if (error) {
        if (error.code === '23503') return apiError('invalid_request', 400);
        throw new Error(`listing update failed: ${error.message}`);
      }
      // RLS returned no row: not the owner (or no such listing). Either way,
      // 404 (don't confirm existence of a listing they can't edit).
      if (!data) throw new ApiError('not_found', 404);
      updated = data as Record<string, unknown>;
    }

    let servicesOut: Array<{ name: string; priceLabel: string | null }> | undefined;
    if (services !== undefined) {
      // Replace-all: validated above, so delete + insert. Not transactional
      // (PostgREST), but the failure mode is an empty services list the owner
      // simply re-saves — never orphaned or mixed rows.
      const admin = getSupabaseAdmin();
      const { error: deleteError } = await admin
        .from('listing_services')
        .delete()
        .eq('listing_id', id.data);
      if (deleteError) throw new Error(`services clear failed: ${deleteError.message}`);

      if (services.length > 0) {
        const { error: insertError } = await admin.from('listing_services').insert(
          services.map((service, index) => ({
            listing_id: id.data,
            name: service.name,
            price_label: service.priceLabel ?? null,
            sort_order: index,
          })),
        );
        if (insertError) throw new Error(`services insert failed: ${insertError.message}`);
      }
      servicesOut = services.map((s) => ({ name: s.name, priceLabel: s.priceLabel ?? null }));
    }

    if (!updated) {
      const { data, error } = await ctx.supabase
        .from('business_listings')
        .select(SELECT)
        .eq('id', id.data)
        .maybeSingle();
      if (error) throw new Error(`listing reload failed: ${error.message}`);
      if (!data) throw new ApiError('not_found', 404);
      updated = data as Record<string, unknown>;
    }

    return apiOk(servicesOut === undefined ? { listing: updated } : { listing: updated, services: servicesOut });
  } catch (error) {
    return handleApiError(error);
  }
}
