import { apiOk, handleApiError } from '@/lib/api';
import { requireVerifier } from '@/lib/auth/guards';
import { VERIFICATION_SLA_DAYS } from '@/lib/moderation/constants';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * §14 verifier queue: open (pending/scheduled) verification requests, oldest
 * first, each annotated with its age in days and whether it has breached the
 * 7-day SLA. Verifier-gated (requireVerifier — a capability beside mod/admin).
 * recording_url is NEVER selected into the list; a recording is fetched only
 * via the dedicated, access-logged endpoint. Requester and listing labels are
 * stitched from `profiles`/`business_listings` (no direct FK to embed).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(): Promise<Response> {
  try {
    await requireVerifier();
    const admin = getSupabaseAdmin();

    const { data: rows, error } = await admin
      .from('verifications')
      .select(
        'id, user_id, type, status, listing_id, scheduled_at, booking_url, info_requested_at, created_at',
      )
      .in('status', ['pending', 'scheduled'])
      .order('created_at', { ascending: true });
    if (error) throw new Error(`verification queue load failed: ${error.message}`);

    const queue = rows ?? [];

    // Stitch requester display + business name in two batched lookups.
    const userIds = [...new Set(queue.map((r) => r.user_id))];
    const listingIds = [...new Set(queue.map((r) => r.listing_id).filter((v): v is string => !!v))];

    const [profilesResult, listingsResult] = await Promise.all([
      userIds.length
        ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      listingIds.length
        ? admin.from('business_listings').select('id, business_name').in('id', listingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error) throw new Error(`requester lookup failed: ${profilesResult.error.message}`);
    if (listingsResult.error) throw new Error(`listing lookup failed: ${listingsResult.error.message}`);

    const profileById = new Map(
      (profilesResult.data ?? []).map((p) => [p.user_id, p]),
    );
    const listingById = new Map((listingsResult.data ?? []).map((l) => [l.id, l]));

    const now = Date.now();
    const verifications = queue.map((r) => {
      const ageDays = Math.floor((now - new Date(r.created_at).getTime()) / DAY_MS);
      const profile = profileById.get(r.user_id);
      const listing = r.listing_id ? listingById.get(r.listing_id) : null;
      return {
        id: r.id,
        userId: r.user_id,
        type: r.type,
        status: r.status,
        scheduledAt: r.scheduled_at,
        bookingUrl: r.booking_url,
        infoRequestedAt: r.info_requested_at,
        createdAt: r.created_at,
        requester: profile
          ? { displayName: profile.display_name, handle: profile.handle }
          : null,
        listing: listing ? { id: listing.id, name: listing.business_name } : null,
        ageDays,
        slaBreached: ageDays >= VERIFICATION_SLA_DAYS,
      };
    });

    return apiOk({ verifications });
  } catch (error) {
    return handleApiError(error);
  }
}
