import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Shared listing-display fetch (§13 permalinks, §18 detail, §28 public share
 * pages). Same pattern as lib/profile-view.ts: signed-in reads under the
 * caller's RLS (published + own + mod), anonymous reads via service role with
 * an explicit `status = 'published'` filter — the service role bypasses RLS,
 * so the published gate is this module's responsibility.
 */

export const LISTING_COLUMNS =
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at';

export interface ListingViewRow {
  id: string;
  owner_user_id: string | null;
  business_name: string;
  category_id: string;
  short_description: string | null;
  address: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  contact_links: unknown;
  verification_status: string;
  status: string;
  created_at: string;
}

export interface ListingView {
  listing: ListingViewRow;
  categoryName: { en: string; so: string | null } | null;
  owner: { display_name: string; handle: string } | null;
}

async function decorate(
  client: SupabaseClient<Database>,
  listing: ListingViewRow,
): Promise<ListingView> {
  const [categoryResult, ownerResult] = await Promise.all([
    client
      .from('listing_categories')
      .select('name_en, name_so')
      .eq('id', listing.category_id)
      .maybeSingle(),
    listing.owner_user_id
      ? client
          .from('profiles')
          .select('display_name, handle')
          .eq('user_id', listing.owner_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    listing,
    categoryName: categoryResult.data
      ? { en: categoryResult.data.name_en, so: categoryResult.data.name_so }
      : null,
    owner: ownerResult.data ?? null,
  };
}

/** Signed-in view under the caller's RLS (published + own + mod). */
export async function getMemberListingView(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ListingView | null> {
  const { data: listing, error } = await supabase
    .from('business_listings')
    .select(LISTING_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`listing lookup failed: ${error.message}`);
  if (!listing) return null;
  return decorate(supabase, listing as unknown as ListingViewRow);
}

/** Login-free view (§28): published listings only, service role. */
export async function getPublicListingView(id: string): Promise<ListingView | null> {
  const admin = getSupabaseAdmin();
  const { data: listing, error } = await admin
    .from('business_listings')
    .select(LISTING_COLUMNS)
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(`public listing lookup failed: ${error.message}`);
  if (!listing) return null;
  return decorate(admin, listing as unknown as ListingViewRow);
}
