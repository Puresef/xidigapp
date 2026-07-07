import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rate-limit';
import { settingsViewFromRow } from '@/lib/settings/model';

/**
 * The profile columns the authenticated role is granted SELECT on (phase1_auth
 * column grant + the phase4.5 avatar/cover additions). `profiles` has NO
 * table-wide SELECT grant, so a `select *` under the caller's RLS client
 * raises "permission denied for column ..." on the revoked columns
 * (subscription_status / region_verified / region_attested_at) — the same
 * reason every other profile read uses an explicit whitelist
 * (see lib/profile-view.ts PROFILE_MEMBER_COLUMNS).
 */
const PROFILE_EXPORT_COLUMNS =
  'user_id, display_name, handle, bio, location_city, location_country, latitude, longitude, timezone, skills, lanes, links, contact_options, verification_status, membership_tier_id, avatar_path, avatar_blurhash, cover_path, cover_blurhash, created_at, updated_at';

/**
 * Data export (§19 data rights): a synchronous JSON download of the member's
 * own content — profile, settings, posts, comments, listings, bookmarks,
 * drafts. Every read runs under the CALLER'S RLS (ctx.supabase) so the
 * export can never contain a byte the member could not already read, and
 * own-authored queries filter explicitly on the caller's id so shared-read
 * tables (posts, comments, listings) export only THEIR rows.
 *
 * Synchronous by design at this scale (beta, §26 caps keep volumes small);
 * a queued export belongs to a later phase if volumes outgrow this.
 * Rate limit: 1/hour per member — an export is not a polling endpoint.
 */

export async function POST(): Promise<Response> {
  try {
    const ctx = await requireUser();
    await enforceRateLimit(`export:${ctx.appUser.id}`, { max: 1, windowSeconds: 3600 });

    const me = ctx.appUser.id;
    const db = ctx.supabase;

    const [profile, settings, posts, comments, listings, bookmarks, drafts] = await Promise.all([
      db.from('profiles').select(PROFILE_EXPORT_COLUMNS).eq('user_id', me).maybeSingle(),
      db.from('user_settings').select('*').eq('user_id', me).maybeSingle(),
      db
        .from('posts')
        .select('*')
        .eq('author_user_id', me)
        .order('created_at', { ascending: false }),
      db
        .from('comments')
        .select('*')
        .eq('author_user_id', me)
        .order('created_at', { ascending: false }),
      db
        .from('business_listings')
        .select('*')
        .eq('owner_user_id', me)
        .order('created_at', { ascending: false }),
      db.from('bookmarks').select('*').order('created_at', { ascending: false }),
      db.from('post_drafts').select('*').order('created_at', { ascending: false }),
    ]);

    for (const result of [profile, settings, posts, comments, listings, bookmarks, drafts]) {
      if (result.error) throw new Error(`export read failed: ${result.error.message}`);
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      userId: me,
      email: ctx.appUser.email,
      phone: ctx.appUser.phone,
      profile: profile.data ?? null,
      settings: settingsViewFromRow(settings.data ?? null),
      posts: posts.data ?? [],
      comments: comments.data ?? [],
      listings: listings.data ?? [],
      bookmarks: bookmarks.data ?? [],
      drafts: drafts.data ?? [],
    };

    emitServer(event('data_export_requested', {}), { distinctId: me, userId: me });

    const stamp = payload.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="xidig-export-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
