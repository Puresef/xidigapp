import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { publicMediaUrl } from '@/lib/media/storage';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Shared listing-display fetch (§13 permalinks, §18 detail, §28 public share
 * pages). Same pattern as lib/profile-view.ts: signed-in reads under the
 * caller's RLS (published + own + mod), anonymous reads via service role with
 * an explicit `status = 'published'` filter — the service role bypasses RLS,
 * so the published gate is this module's responsibility. That responsibility
 * extends to the child tables: listing_photos / listing_services RLS mirrors
 * the parent listing's visibility, and the admin path only ever decorates a
 * listing that already passed the published filter.
 */

export const LISTING_COLUMNS =
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at, opening_hours, price_range, primary_photo_path, primary_photo_blurhash, primary_photo_alt, photo_count';

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
  opening_hours: unknown;
  price_range: number | null;
  primary_photo_path: string | null;
  primary_photo_blurhash: string | null;
  primary_photo_alt: string | null;
  photo_count: number;
}

export interface ListingPhotoView {
  /** media_uploads id — needed by the edit surface to re-send the set on PUT. */
  mediaId: string | null;
  url: string;
  thumbUrl: string;
  alt: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
}

export interface ListingServiceView {
  name: string;
  priceLabel: string | null;
}

export interface ListingView {
  listing: ListingViewRow;
  categoryName: { en: string; so: string | null } | null;
  owner: { display_name: string; handle: string } | null;
  /** Gallery order (sort_order asc); first photo is the hero/cover. */
  photos: ListingPhotoView[];
  services: ListingServiceView[];
}

async function decorate(
  client: SupabaseClient<Database>,
  listing: ListingViewRow,
): Promise<ListingView> {
  const [categoryResult, ownerResult, photosResult, servicesResult] = await Promise.all([
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
    client
      .from('listing_photos')
      .select('media_upload_id, storage_path, thumb_path, alt_text, blurhash, width, height')
      .eq('listing_id', listing.id)
      .order('sort_order', { ascending: true }),
    client
      .from('listing_services')
      .select('name, price_label')
      .eq('listing_id', listing.id)
      .order('sort_order', { ascending: true }),
  ]);

  return {
    listing,
    categoryName: categoryResult.data
      ? { en: categoryResult.data.name_en, so: categoryResult.data.name_so }
      : null,
    owner: ownerResult.data ?? null,
    photos: (photosResult.data ?? []).map((row) => ({
      mediaId: row.media_upload_id,
      url: publicMediaUrl(row.storage_path),
      // Rows without a thumb (shouldn't happen for Phase 4.5 uploads) fall
      // back to the full asset rather than a broken image.
      thumbUrl: publicMediaUrl(row.thumb_path ?? row.storage_path),
      alt: row.alt_text,
      blurhash: row.blurhash,
      width: row.width,
      height: row.height,
    })),
    services: (servicesResult.data ?? []).map((row) => ({
      name: row.name,
      priceLabel: row.price_label,
    })),
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
