import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { loadAttachableMedia } from '@/lib/media/attach';
import { MEDIA_KINDS } from '@/lib/media/transcode';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { Json } from '@xidig/db';

/**
 * PUT /api/me/profile/showcase — Bandhig, the member-curated media grid.
 *
 * Full replacement, order = array order, cap 5 (the DB CHECK repeats it). The
 * whole point of the module is acceptance A5: it renders PINNED REFS ONLY,
 * nothing engagement-sourced. That is a property of this route as much as of
 * the renderer — the only way a tile gets in is a member naming an entity they
 * can already read, so the readability check is the feature, not a formality.
 *
 * Same shape and the same `pin_target_invalid` vagueness as
 * `me/profile/pins/route.ts`: the error never says WHICH item failed, so the
 * endpoint can't be used to probe whether a private id exists.
 */

const SHOWCASE_ENTITY_TYPES = ['post', 'lab', 'listing'] as const;

/** Mirrors profile_showcase_position_range. */
const SHOWCASE_MAX = 5;

const putSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            entityType: z.enum(SHOWCASE_ENTITY_TYPES),
            entityId: z.string().uuid(),
            mediaId: z.string().uuid().nullish(),
          })
          .strict(),
      )
      .max(SHOWCASE_MAX),
  })
  .strict();

/** RLS-scoped existence check — the caller must be able to READ the target. */
async function assertReadable(
  ctx: AuthContext,
  entityType: (typeof SHOWCASE_ENTITY_TYPES)[number],
  entityId: string,
): Promise<void> {
  const table =
    entityType === 'post' ? 'posts' : entityType === 'lab' ? 'labs' : 'business_listings';
  const { data, error } = await ctx.supabase
    .from(table)
    .select('id')
    .eq('id', entityId)
    .maybeSingle();
  if (error) throw new Error(`showcase target lookup failed: ${error.message}`);
  if (!data) throw new ApiError('pin_target_invalid', 400);
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = putSchema.parse(await request.json());

    const keys = input.items.map((item) => `${item.entityType}:${item.entityId}`);
    if (new Set(keys).size !== keys.length) throw new ApiError('pin_target_invalid', 400);

    const admin = getSupabaseAdmin();
    for (const item of input.items) {
      await assertReadable(ctx, item.entityType, item.entityId);
      // The tile image is a square crop of something the member already owns,
      // so any upload KIND is legitimate here (a Guul photo is 'post', a
      // Warshad cover is 'space_cover'). Ownership and the AI pre-scan are the
      // checks that matter, and loadAttachableMedia is where they live.
      if (item.mediaId) await loadAttachableMedia(admin, ctx.appUser.id, item.mediaId, MEDIA_KINDS);
    }

    const items = input.items.map((item, index) => ({
      position: index + 1,
      entity_type: item.entityType,
      entity_id: item.entityId,
      media_id: item.mediaId ?? null,
    }));

    const { error } = await admin.rpc('set_profile_showcase', {
      p_user_id: ctx.appUser.id,
      p_items: items as unknown as Json,
    });
    if (error) throw new Error(`showcase save failed: ${error.message}`);

    emitServer(event('profile_showcase_updated', { count: items.length }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    // Echoes the stored set, not a hydrated view: the tiles' media, titles and
    // source chips are the profile projection's job (lib/aniga/view.ts), and
    // duplicating that here would give the grid two sources of truth.
    return apiOk({
      items: items.map((item) => ({
        position: item.position,
        entityType: item.entity_type,
        entityId: item.entity_id,
        mediaId: item.media_id,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
