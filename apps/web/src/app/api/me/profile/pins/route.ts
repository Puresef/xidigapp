import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { hydrateProfilePins } from '@/lib/profile-view';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Profile pins (Phase 4.5 §1b/§3): up to 3 posts / Spaces / listings pinned
 * to /u/[handle].
 *
 * GET  — current pins (hydrated) + pinnable candidates (the member's recent
 *        posts, led Spaces, owned listings), all under the caller's RLS.
 * PUT  — full replacement `{ pins: [{entityType, entityId}] }` (order in the
 *        array = position 1..3). Every target must exist AND be readable by
 *        the caller (RLS-scoped select — a member can't pin what they can't
 *        see), then the set is rewritten via the service role (profile_pins
 *        has no client write grants; the 3-cap is declarative in the PK).
 */

const PIN_ENTITY_TYPES = ['post', 'lab', 'listing'] as const;

const putSchema = z.object({
  pins: z
    .array(
      z.object({
        entityType: z.enum(PIN_ENTITY_TYPES),
        entityId: z.string().uuid(),
      }),
    )
    .max(3),
});

const CANDIDATE_LIMIT = 10;

async function loadCandidates(ctx: AuthContext) {
  const [posts, labs, listings] = await Promise.all([
    ctx.supabase
      .from('posts')
      .select('id, title, body, type, created_at')
      .eq('author_user_id', ctx.appUser.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT),
    ctx.supabase
      .from('labs')
      .select('id, name, slug, short_description')
      .eq('lead_user_id', ctx.appUser.id)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT),
    ctx.supabase
      .from('business_listings')
      .select('id, business_name, city')
      .eq('owner_user_id', ctx.appUser.id)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT),
  ]);
  return {
    posts: posts.data ?? [],
    labs: labs.data ?? [],
    listings: listings.data ?? [],
  };
}

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const [pins, candidates] = await Promise.all([
      hydrateProfilePins(ctx.supabase, ctx.appUser.id),
      loadCandidates(ctx),
    ]);
    return apiOk({ pins, candidates });
  } catch (error) {
    return handleApiError(error);
  }
}

/** RLS-scoped existence check — the caller must be able to READ the target. */
async function assertReadable(
  ctx: AuthContext,
  entityType: (typeof PIN_ENTITY_TYPES)[number],
  entityId: string,
): Promise<void> {
  const table =
    entityType === 'post' ? 'posts' : entityType === 'lab' ? 'labs' : 'business_listings';
  const { data, error } = await ctx.supabase.from(table).select('id').eq('id', entityId).maybeSingle();
  if (error) throw new Error(`pin target lookup failed: ${error.message}`);
  if (!data) throw new ApiError('pin_target_invalid', 400);
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = putSchema.parse(await request.json());

    // Duplicate targets would violate the (user, type, id) uniqueness anyway;
    // reject up front with the friendly code.
    const keys = input.pins.map((pin) => `${pin.entityType}:${pin.entityId}`);
    if (new Set(keys).size !== keys.length) throw new ApiError('pin_target_invalid', 400);

    for (const pin of input.pins) {
      await assertReadable(ctx, pin.entityType, pin.entityId);
    }

    // Rewrite the whole set (delete + insert, service role). Positions are
    // 1..n in array order; the PK/CHECK caps at 3 as defense in depth.
    const admin = getSupabaseAdmin();
    const { error: clearError } = await admin
      .from('profile_pins')
      .delete()
      .eq('user_id', ctx.appUser.id);
    if (clearError) throw new Error(`pins clear failed: ${clearError.message}`);

    if (input.pins.length > 0) {
      const { error: insertError } = await admin.from('profile_pins').insert(
        input.pins.map((pin, index) => ({
          user_id: ctx.appUser.id,
          entity_type: pin.entityType,
          entity_id: pin.entityId,
          position: index + 1,
        })),
      );
      if (insertError) throw new Error(`pins insert failed: ${insertError.message}`);
    }

    const pins = await hydrateProfilePins(ctx.supabase, ctx.appUser.id);
    return apiOk({ pins });
  } catch (error) {
    return handleApiError(error);
  }
}
