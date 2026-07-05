import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Pending "claim this listing" queue for the mod surface (§18/§19). This is
 * the mod-side discovery path for the claim flow: listing_claims RLS is
 * claimant-scoped, so mods cannot enumerate claims through PostgREST — the
 * read is mod-gated + service-role. Listing name + claimant handle are joined
 * in application code (listing_claims has no FK to profiles — claimant_user_id
 * references users, and profiles keys off users separately). Decisions go
 * through PATCH /api/claims/[id].
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole('mod');

    const status = new URL(request.url).searchParams.get('status') ?? 'pending';
    const admin = getSupabaseAdmin();

    let query = admin
      .from('listing_claims')
      .select('id, listing_id, claimant_user_id, evidence, status, created_at')
      .order('created_at', { ascending: true })
      .limit(200);
    if (status === 'pending' || status === 'approved' || status === 'rejected') {
      query = query.eq('status', status);
    }

    const { data: claimRows, error } = await query;
    if (error) throw new Error(`claims queue read failed: ${error.message}`);
    const rows = claimRows ?? [];

    const listingIds = [...new Set(rows.map((r) => r.listing_id))];
    const claimantIds = [...new Set(rows.map((r) => r.claimant_user_id))];

    const [{ data: listings }, { data: profiles }] = await Promise.all([
      listingIds.length
        ? admin.from('business_listings').select('id, business_name, city').in('id', listingIds)
        : Promise.resolve({ data: [] as { id: string; business_name: string; city: string | null }[] }),
      claimantIds.length
        ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', claimantIds)
        : Promise.resolve({ data: [] as { user_id: string; display_name: string; handle: string }[] }),
    ]);

    const listingById = new Map((listings ?? []).map((l) => [l.id, l]));
    const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const claims = rows.map((row) => ({
      ...row,
      listing: listingById.get(row.listing_id) ?? null,
      claimant: profileById.get(row.claimant_user_id) ?? null,
    }));

    return apiOk({ claims });
  } catch (error) {
    return handleApiError(error);
  }
}
