import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { handleSchema } from '@/lib/profiles';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Public-facing profile card (§18 directory, §13 mentions target). Returns the
 * profile, its active badges (§14), and follower/vouch counts.
 *
 * Counts go through the service-role client on purpose: `follows` and
 * `vouches` are RLS-scoped to the parties involved (a member cannot enumerate
 * someone else's followers), but an aggregate count carries no PII and is
 * safe to expose. Everything else reads under the caller's RLS.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ handle: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = handleSchema.safeParse((await context.params).handle);
    if (!parsed.success) throw new ApiError('not_found', 404);
    const handle = parsed.data;

    const { data: profile, error } = await ctx.supabase
      .from('profiles')
      .select(
        'user_id, display_name, handle, bio, location_city, location_country, latitude, longitude, timezone, skills, lanes, links, contact_options, verification_status, created_at',
      )
      .eq('handle', handle)
      .maybeSingle();
    if (error) throw new Error(`profile lookup failed: ${error.message}`);
    if (!profile) throw new ApiError('not_found', 404);

    const { data: badges } = await ctx.supabase
      .from('user_badges')
      .select('badge_id, awarded_at, context, badge_definitions(slug, name, description)')
      .eq('user_id', profile.user_id)
      .is('revoked_at', null)
      .order('awarded_at', { ascending: false });

    const admin = getSupabaseAdmin();
    const [{ count: followers }, { count: vouches }] = await Promise.all([
      admin
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('target_type', 'user')
        .eq('target_id', profile.user_id),
      admin
        .from('vouches')
        .select('*', { count: 'exact', head: true })
        .eq('vouchee_user_id', profile.user_id),
    ]);

    return apiOk({
      profile,
      badges: badges ?? [],
      counts: { followers: followers ?? 0, vouches: vouches ?? 0 },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
