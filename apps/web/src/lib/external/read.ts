import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { decodeCursor, encodeCursor, keysetBefore } from '@/lib/pagination';

/**
 * Public-safe reads for the external REST + MCP layer (PRD §21).
 *
 * Deliberately conservative projection: discovery fields only. It EXCLUDES
 * precise `address` and `contact_links` so an external agent can discover and
 * link to businesses but cannot bulk-harvest contact details — the app's own
 * listing detail page is where a signed-in member sees contacts. Only
 * `status = 'published'` rows are ever returned (hidden/removed stay invisible),
 * which mirrors the member RLS read.
 */

export const EXTERNAL_LISTING_COLUMNS =
  'id, business_name, short_description, city, country, landmark, latitude, longitude, verification_status, source, created_at, category:listing_categories(slug, name_en, name_so)';

export interface ExternalListingFilters {
  city?: string | undefined;
  country?: string | undefined;
  /** listing_categories.slug */
  category?: string | undefined;
  /** tags.name */
  tag?: string | undefined;
  limit: number;
  /** Opaque keyset cursor (created_at,id). */
  cursor?: string | undefined;
}

export interface ExternalListingsPage {
  items: unknown[];
  nextCursor: string | null;
}

/**
 * Deterministic, RLS-equivalent listing query (published only, newest first).
 * No ranking, no personalization — a stable created_at desc keyset.
 */
export async function queryExternalListings(
  admin: SupabaseClient<Database>,
  filters: ExternalListingFilters,
): Promise<ExternalListingsPage> {
  let query = admin
    .from('business_listings')
    .select(EXTERNAL_LISTING_COLUMNS)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(filters.limit + 1);

  if (filters.city) query = query.ilike('city', filters.city);
  if (filters.country) query = query.ilike('country', filters.country);

  if (filters.category) {
    const { data: cat } = await admin
      .from('listing_categories')
      .select('id')
      .eq('slug', filters.category)
      .maybeSingle();
    // Unknown category → empty result, not an error (deterministic).
    if (!cat) return { items: [], nextCursor: null };
    query = query.eq('category_id', cat.id);
  }

  if (filters.tag) {
    const { data: tag } = await admin
      .from('tags')
      .select('id')
      .eq('name', filters.tag)
      .maybeSingle();
    if (!tag) return { items: [], nextCursor: null };
    const { data: tagged } = await admin
      .from('listing_tags')
      .select('listing_id')
      .eq('tag_id', tag.id);
    const ids = (tagged ?? []).map((r) => r.listing_id);
    if (ids.length === 0) return { items: [], nextCursor: null };
    query = query.in('id', ids);
  }

  const cursor = decodeCursor(filters.cursor);
  if (cursor) query = query.or(keysetBefore(cursor, 'id'));

  const { data, error } = await query;
  if (error) throw new Error(`external listings query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ created_at: string; id: string }>;
  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

  return { items: page, nextCursor };
}
