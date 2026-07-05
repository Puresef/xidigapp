import { apiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { isProfileComplete, profileInputSchema } from '@/lib/profiles';

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
