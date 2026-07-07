import { z } from 'zod';

import { ApiError, apiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { loadAttachableMedia } from '@/lib/media/attach';
import { isProfileComplete, profileInputSchema } from '@/lib/profiles';
import { loadOpenTo, PROFILE_MEMBER_COLUMNS } from '@/lib/profile-view';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { Json } from '@xidig/db';

/**
 * Create or update the caller's own profile (§9 profile fields; API-first —
 * the UI never writes profiles directly). RLS + column grants already forbid
 * touching gated columns (verification_status, membership_tier_id, …); this
 * route adds the friendly §27 handling and the §23 activation events:
 *   * profile_completed — once, when the profile first reaches "complete"
 *   * lane_selected — per newly added lane
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = profileInputSchema.parse(await request.json());

    const { data: existing } = await ctx.supabase
      .from('profiles')
      .select('user_id, lanes')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle();

    const row = {
      user_id: ctx.appUser.id,
      display_name: input.display_name,
      handle: input.handle,
      bio: input.bio ?? null,
      location_city: input.location_city ?? null,
      location_country: input.location_country ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      timezone: input.timezone ?? null,
      skills: input.skills,
      lanes: input.lanes,
      links: input.links as unknown as Json,
      contact_options: input.contact_options as unknown as Json,
    };

    // user_id is in the INSERT column grant but NOT the UPDATE grant
    // (20260704200000_phase1_auth.sql) — including it in an UPDATE SET list
    // raises 42501. The .eq() already targets the caller's own row, so the
    // update never needs it.
    const { user_id: _pk, ...updateRow } = row;
    const query = existing
      ? ctx.supabase.from('profiles').update(updateRow).eq('user_id', ctx.appUser.id)
      : ctx.supabase.from('profiles').insert(row);

    const { data: saved, error } = await query
      .select(
        'user_id, display_name, handle, bio, location_city, location_country, latitude, longitude, timezone, skills, lanes, links, contact_options, verification_status, created_at',
      )
      .single();

    if (error) {
      // 23505 on the handle unique index → that handle is taken (§27).
      if (error.code === '23505') return apiError('handle_taken', 409);
      // 23514 = check_violation: handle format (belt-and-braces; zod caught it first).
      if (error.code === '23514') return apiError('handle_invalid', 400);
      throw new Error(`profile save failed: ${error.message}`);
    }

    // --- §23 activation events (fire-and-forget, post-response) ------------
    const previousLanes = new Set((existing?.lanes ?? []) as string[]);
    for (const lane of input.lanes) {
      if (!previousLanes.has(lane)) {
        emitServer(event('lane_selected', { lane }), {
          distinctId: ctx.appUser.id,
          userId: ctx.appUser.id,
        });
      }
    }

    const onboarding = (ctx.appUser.onboarding_state ?? {}) as Record<string, unknown>;
    const alreadyCounted = onboarding['profileCompleted'] === true;
    const complete = isProfileComplete(input);
    if (complete && !alreadyCounted) {
      await ctx.supabase
        .from('users')
        .update({ onboarding_state: { ...onboarding, profileCompleted: true } })
        .eq('id', ctx.appUser.id);
      emitServer(
        event('profile_completed', {
          has_location: Boolean(input.location_country ?? input.location_city),
          skills_count: input.skills.length,
          lanes_count: input.lanes.length,
        }),
        { distinctId: ctx.appUser.id, userId: ctx.appUser.id },
      );
    }

    return apiOk({ profile: saved }, existing ? 200 : 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/me/profile — Phase 4.5 identity/customization extension.
 *
 * Partial by design (PUT stays the full §9 field save):
 *   - `avatarMediaId` / `coverMediaId`: attach an uploaded media_uploads row
 *     (string) or clear (null). The media row must belong to the caller, be
 *     uploaded with the matching kind, and be scan-clean (passed / uncertain /
 *     skipped) — lib/media/attach.ts, `media_not_ready` 409 otherwise. The
 *     storage path + blurhash are denormalized onto profiles via the SERVICE
 *     ROLE: avatar/cover columns deliberately have no client write grants.
 *   - `openTo`: full replacement of the profile_open_to chip set (slugs are
 *     validated against the open_to_kinds lookup; writes are API-only).
 *   - `links`: label/order edit without resending the whole profile (order in
 *     the array IS the display order; client-writable column, so RLS client).
 */
const profilePatchSchema = z
  .object({
    avatarMediaId: z.string().uuid().nullable().optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
    openTo: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z][a-z0-9_]{0,29}$/),
      )
      .max(12)
      .optional(),
    links: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(40),
          url: z.string().url().max(2048),
        }),
      )
      .max(10)
      .optional(),
  })
  .strict();

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = profilePatchSchema.parse(await request.json());

    // Attach targets need an existing profile row (§20: complete it first).
    const { data: existing, error: lookupError } = await ctx.supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle();
    if (lookupError) throw new Error(`profile lookup failed: ${lookupError.message}`);
    if (!existing) throw new ApiError('profile_incomplete', 409);

    const admin = getSupabaseAdmin();

    // --- avatar / cover (service-role denormalization) ---------------------
    const mediaPatch: {
      avatar_path?: string | null;
      avatar_blurhash?: string | null;
      cover_path?: string | null;
      cover_blurhash?: string | null;
    } = {};
    if (input.avatarMediaId !== undefined) {
      if (input.avatarMediaId === null) {
        mediaPatch['avatar_path'] = null;
        mediaPatch['avatar_blurhash'] = null;
      } else {
        const media = await loadAttachableMedia(admin, ctx.appUser.id, input.avatarMediaId, [
          'avatar',
        ]);
        mediaPatch['avatar_path'] = media.storage_path;
        mediaPatch['avatar_blurhash'] = media.blurhash;
      }
    }
    if (input.coverMediaId !== undefined) {
      if (input.coverMediaId === null) {
        mediaPatch['cover_path'] = null;
        mediaPatch['cover_blurhash'] = null;
      } else {
        const media = await loadAttachableMedia(admin, ctx.appUser.id, input.coverMediaId, [
          'cover',
        ]);
        mediaPatch['cover_path'] = media.storage_path;
        mediaPatch['cover_blurhash'] = media.blurhash;
      }
    }
    if (Object.keys(mediaPatch).length > 0) {
      const { error } = await admin
        .from('profiles')
        .update(mediaPatch)
        .eq('user_id', ctx.appUser.id);
      if (error) throw new Error(`profile media attach failed: ${error.message}`);
    }

    // --- open-to chips (replace-all; lookup-validated) ----------------------
    if (input.openTo !== undefined) {
      const slugs = [...new Set(input.openTo)];
      if (slugs.length > 0) {
        const { data: kinds, error } = await admin.from('open_to_kinds').select('id');
        if (error) throw new Error(`open-to kinds lookup failed: ${error.message}`);
        const known = new Set((kinds ?? []).map((row) => row.id as string));
        if (!slugs.every((slug) => known.has(slug))) throw new ApiError('invalid_request', 400);
      }
      const { error: clearError } = await admin
        .from('profile_open_to')
        .delete()
        .eq('user_id', ctx.appUser.id);
      if (clearError) throw new Error(`open-to clear failed: ${clearError.message}`);
      if (slugs.length > 0) {
        const { error: insertError } = await admin
          .from('profile_open_to')
          .insert(slugs.map((slug) => ({ user_id: ctx.appUser.id, open_to_id: slug })));
        if (insertError) throw new Error(`open-to insert failed: ${insertError.message}`);
      }
    }

    // --- links order/labels (client-writable column → RLS client) ----------
    if (input.links !== undefined) {
      const { error } = await ctx.supabase
        .from('profiles')
        .update({ links: input.links as unknown as Json })
        .eq('user_id', ctx.appUser.id);
      if (error) throw new Error(`links update failed: ${error.message}`);
    }

    if (input.avatarMediaId !== undefined) {
      emitServer(event('avatar_updated', { has_avatar: input.avatarMediaId !== null }), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    }

    const [{ data: profile, error: refetchError }, openTo] = await Promise.all([
      ctx.supabase
        .from('profiles')
        .select(PROFILE_MEMBER_COLUMNS)
        .eq('user_id', ctx.appUser.id)
        .single(),
      loadOpenTo(admin, ctx.appUser.id),
    ]);
    if (refetchError) throw new Error(`profile refetch failed: ${refetchError.message}`);

    return apiOk({ profile, openTo });
  } catch (error) {
    return handleApiError(error);
  }
}
