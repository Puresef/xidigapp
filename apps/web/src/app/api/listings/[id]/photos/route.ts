import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { LISTING_MAX_PHOTOS } from '@/lib/listings';
import { publicMediaUrl } from '@/lib/media/storage';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * PUT /api/listings/[id]/photos — replace the listing's photo gallery
 * (Phase 4.5, spec §3). Owner or admin only. Body: `{ photos: [{ mediaId,
 * alt? }] }`, ≤5, array order = gallery order, first photo = cover.
 *
 * Every media row is re-validated at attach time (upload and attach are
 * separate steps): uploaded as kind 'listing_photo', owned by the caller or
 * the listing owner (so an admin can reorder the owner's existing photos),
 * and scan-clean — passed/uncertain per spec, plus 'skipped' to match the
 * platform-wide fail-open when no moderation provider is configured (see
 * lib/media/attach.ts). Any failure → media_not_ready 409, never revealing
 * WHICH check failed for someone else's media id.
 *
 * listing_photos is API-only at the DB layer, and the primary_photo_* /
 * photo_count denorms on business_listings have no column grants — all
 * writes here go through the service role after the explicit authz above.
 */

const idSchema = z.string().uuid();

const bodySchema = z.object({
  photos: z
    .array(
      z.object({
        mediaId: z.string().uuid(),
        /** Optional per-attach override of the upload-time alt text. */
        alt: z.string().trim().min(1).max(300).optional(),
      }),
    )
    .max(LISTING_MAX_PHOTOS)
    .refine((photos) => new Set(photos.map((p) => p.mediaId)).size === photos.length, {
      message: 'duplicate mediaId',
    }),
});

const USABLE_SCAN_STATUSES = new Set(['passed', 'uncertain', 'skipped']);

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = idSchema.safeParse((await context.params).id);
    if (!id.success) throw new ApiError('not_found', 404);

    const { photos } = bodySchema.parse(await request.json());

    // Visibility under the caller's RLS first (404 for listings they can't
    // see), then the write gate: owner or admin (spec §3).
    const { data: listing, error: listingError } = await ctx.supabase
      .from('business_listings')
      .select('id, owner_user_id')
      .eq('id', id.data)
      .maybeSingle();
    if (listingError) throw new Error(`listing lookup failed: ${listingError.message}`);
    if (!listing) throw new ApiError('not_found', 404);
    const isOwner = listing.owner_user_id !== null && listing.owner_user_id === ctx.appUser.id;
    if (!isOwner && ctx.appUser.role !== 'admin') throw new ApiError('forbidden', 403);

    const admin = getSupabaseAdmin();

    // Validate EVERY media row before touching listing_photos, so a bad id
    // can never leave the gallery half-replaced.
    const mediaIds = photos.map((p) => p.mediaId);
    const { data: mediaRows, error: mediaError } =
      mediaIds.length > 0
        ? await admin
            .from('media_uploads')
            .select(
              'id, owner_user_id, kind, scan_status, storage_path, thumb_path, blurhash, alt_text, width, height',
            )
            .in('id', mediaIds)
        : { data: [], error: null };
    if (mediaError) throw new Error(`media lookup failed: ${mediaError.message}`);
    const mediaById = new Map((mediaRows ?? []).map((row) => [row.id, row]));

    const inserts = photos.map((photo, index) => {
      const media = mediaById.get(photo.mediaId);
      const usable =
        media &&
        media.kind === 'listing_photo' &&
        USABLE_SCAN_STATUSES.has(media.scan_status) &&
        (media.owner_user_id === ctx.appUser.id || media.owner_user_id === listing.owner_user_id);
      if (!usable) throw new ApiError('media_not_ready', 409);

      // listing_photos.alt_text is NOT NULL; uploads of kind listing_photo
      // always carry alt (POST /api/media 400s without it), but guard anyway.
      const alt = photo.alt ?? media.alt_text;
      if (!alt) throw new ApiError('image_alt_required', 400);

      return {
        listing_id: id.data,
        media_upload_id: media.id,
        storage_path: media.storage_path,
        thumb_path: media.thumb_path,
        alt_text: alt,
        blurhash: media.blurhash,
        width: media.width,
        height: media.height,
        sort_order: index,
      };
    });

    // Replace-all: delete + insert (not transactional over PostgREST, but
    // everything was validated above — the residual failure mode is an empty
    // gallery the owner re-saves, never a mixed one).
    const { error: deleteError } = await admin
      .from('listing_photos')
      .delete()
      .eq('listing_id', id.data);
    if (deleteError) throw new Error(`photos clear failed: ${deleteError.message}`);

    if (inserts.length > 0) {
      const { error: insertError } = await admin.from('listing_photos').insert(inserts);
      if (insertError) throw new Error(`photos insert failed: ${insertError.message}`);
    }

    // Denormalize the cover onto the listing (card/OG rendering without a
    // join). These columns have no client grants — service role only.
    const cover = inserts[0] ?? null;
    const { error: denormError } = await admin
      .from('business_listings')
      .update({
        primary_photo_path: cover?.storage_path ?? null,
        primary_photo_blurhash: cover?.blurhash ?? null,
        primary_photo_alt: cover?.alt_text ?? null,
        photo_count: inserts.length,
      })
      .eq('id', id.data);
    if (denormError) throw new Error(`photo denorm failed: ${denormError.message}`);

    emitServer(event('listing_photos_updated', { count: inserts.length }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({
      photos: inserts.map((row) => ({
        mediaId: row.media_upload_id,
        url: publicMediaUrl(row.storage_path),
        thumbUrl: publicMediaUrl(row.thumb_path ?? row.storage_path),
        alt: row.alt_text,
        blurhash: row.blurhash,
        width: row.width,
        height: row.height,
      })),
      photoCount: inserts.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
