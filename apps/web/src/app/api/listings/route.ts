import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { resolveError } from '@/lib/errors';
import { LISTINGS_PER_WEEK, listingCreateSchema, normalizeBusinessName } from '@/lib/listings';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { getT } from '@/lib/locale';
import {
  decodeListingCursor,
  encodeListingCursor,
  keysetBeforeListing,
  pageSizeSchema,
} from '@/lib/pagination';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { Json } from '@xidig/db';

/**
 * Business directory + map (§18). GET serves both surfaces from one query:
 * pass a `bbox` for the map (bounding-box), or category/city/country/q filters
 * for the directory list. RLS (listings_select_published) means a member sees
 * published listings plus their own; mods see everything.
 *
 * POST creates a listing from a map pin-drop (§18 primary input), enforces the
 * §26 2-per-week quota, and fires §18 duplicate detection before inserting.
 */

const SELECT =
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, verified_at, is_verified, status, source, created_at, updated_at, opening_hours, price_range, primary_photo_path, primary_photo_blurhash, primary_photo_alt, photo_count';

const bboxSchema = z
  .string()
  .transform((s) => s.split(',').map(Number))
  .refine((a) => a.length === 4 && a.every((n) => Number.isFinite(n)), {
    message: 'bbox must be minLng,minLat,maxLng,maxLat',
  });

const querySchema = z.object({
  category: z.string().uuid().optional(),
  city: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  // §7 journey-3 filter: businesses.verification_status is a single 'verified'
  // tier (no community/identity split, unlike profiles).
  verification: z.enum(['verified']).optional(),
  // Extras item 5: price-range filter, exact level match ($..$$$$). Listings
  // with no price set are excluded when the filter is active (eq on a null
  // column never matches) — "any" is the absent param.
  price: z.coerce.number().int().min(1).max(4).optional(),
  bbox: bboxSchema.optional(),
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    // Task 11 published sort rule (caption `suuq.sortTransparency` ships with
    // this): verified first, then most recently updated. `is_verified` is a
    // stored generated column (verification_status = 'verified') because the
    // enum's declaration order (unverified < pending < verified) would rank
    // 'pending' as a middle tier — a boolean collapses "everything else" into
    // one tier, exactly as published. NO tie-rotation beyond this: updated_at
    // is timestamptz (µs precision), so real ties are ~impossible, and
    // verified-first + recency already rotates placement by activity
    // (documented adjudication — do not add literal rotation). Note the photo
    // denorm writes touch updated_at via set_updated_at; that churn is
    // accepted — a photo change IS an update in the "recently updated" sense.
    let query = ctx.supabase
      .from('business_listings')
      .select(SELECT)
      .order('is_verified', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1);

    if (params.category) query = query.eq('category_id', params.category);
    if (params.city) query = query.ilike('city', params.city);
    if (params.country) query = query.ilike('country', params.country);
    if (params.verification === 'verified') query = query.eq('verification_status', 'verified');
    if (params.price !== undefined) query = query.eq('price_range', params.price);
    if (params.q) {
      const term = params.q.replace(/[%,()]/g, ' ');
      query = query.or(`business_name.ilike.%${term}%,short_description.ilike.%${term}%`);
    }
    if (params.bbox) {
      const [minLng, minLat, maxLng, maxLat] = params.bbox;
      query = query
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLng)
        .lte('longitude', maxLng);
    }

    // Versioned (v2) cursor: old/invalid cursors decode to null and simply
    // restart from page 1 — a stale client never 400s and never mixes orders.
    const cursor = decodeListingCursor(params.cursor);
    if (cursor) query = query.or(keysetBeforeListing(cursor));

    // Never a listing owned by a quarantined test account (users.is_test):
    // not directory or map proof. Excluded in the query so a page still
    // fills. Owner-less (imported, unclaimed) listings stay — a bare
    // `not in` would drop their NULL owner too. Separate `or` params are
    // ANDed by PostgREST, so this composes with the q/cursor filters.
    const testIds = await loadTestAccountIds(getSupabaseAdmin());
    if (testIds.length > 0) {
      query = query.or(
        `owner_user_id.is.null,owner_user_id.not.in.${postgrestIdList(testIds)}`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(`listings query failed: ${error.message}`);

    const rows = data ?? [];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeListingCursor({
            verified: last.is_verified,
            updatedAt: last.updated_at,
            id: last.id,
          })
        : null;

    // Task 10: hydrate each row's `bookmarked` for THIS caller in one batch
    // query over the page ids (skipped for an empty page — one extra query
    // max). Best-effort like the detail page: a lookup error degrades to
    // all-false rather than failing the whole directory. Anonymous callers
    // never reach here (requireUser 401s), so there is no anon branch.
    const bookmarkedIds = new Set<string>();
    if (page.length > 0) {
      const { data: marks } = await ctx.supabase
        .from('bookmarks')
        .select('entity_id')
        .eq('user_id', ctx.appUser.id)
        .eq('entity_type', 'listing')
        .in(
          'entity_id',
          page.map((row) => row.id),
        );
      for (const mark of marks ?? []) bookmarkedIds.add(mark.entity_id);
    }

    // Storage paths → public CDN URLs server-side: clients never build
    // storage URLs (that would need server env). Thumb by the Phase 4.5
    // `{path}_thumb.webp` pipeline convention.
    const listings = page.map((row) => ({
      ...row,
      primary_photo_url: row.primary_photo_path ? publicMediaUrl(row.primary_photo_path) : null,
      primary_photo_thumb_url: row.primary_photo_path
        ? publicMediaUrl(derivedThumbPath(row.primary_photo_path))
        : null,
      bookmarked: bookmarkedIds.has(row.id),
    }));

    return apiOk({ listings, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Published listings whose normalised name matches — the §18 "already exists" check. */
async function findDuplicates(
  ctx: AuthContext,
  businessName: string,
  city: string | null | undefined,
): Promise<Array<{ id: string; business_name: string; city: string | null; claimable: boolean }>> {
  const normalized = normalizeBusinessName(businessName);
  const anchor = normalized.split(' ')[0] ?? normalized;
  if (anchor.length < 2) return [];

  let query = ctx.supabase
    .from('business_listings')
    .select('id, business_name, city, owner_user_id')
    .eq('status', 'published')
    .ilike('business_name', `%${anchor}%`)
    .limit(25);
  if (city) query = query.ilike('city', city);

  const { data } = await query;
  return (data ?? [])
    .filter((row) => normalizeBusinessName(row.business_name) === normalized)
    // §18: expose a derived `claimable` flag but never the raw owner id — an
    // already-owned listing hits listing_claims_insert_own RLS (42501) if a
    // member tries to claim it, so the client hides Claim for owned matches.
    .map((row) => ({
      id: row.id,
      business_name: row.business_name,
      city: row.city,
      claimable: row.owner_user_id === null,
    }));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = listingCreateSchema.parse(await request.json());

    await enforceRateLimit(`listings:${ctx.appUser.id}`, {
      max: LISTINGS_PER_WEEK,
      windowSeconds: 7 * 86400,
    });

    if (!input.force) {
      const duplicates = await findDuplicates(ctx, input.business_name, input.city);
      if (duplicates.length > 0) {
        // §27 duplicate-listing: 409 carrying the matches so the client can
        // offer "Claim it instead". Additive `duplicates` field alongside the
        // standard error envelope.
        return NextResponse.json(
          { error: resolveError('duplicate_listing', await getT()), duplicates },
          { status: 409 },
        );
      }
    }

    const { data: listing, error } = await ctx.supabase
      .from('business_listings')
      .insert({
        owner_user_id: ctx.appUser.id,
        business_name: input.business_name,
        category_id: input.category_id,
        short_description: input.short_description ?? null,
        address: input.address ?? null,
        landmark: input.landmark ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        contact_links: input.contact_links as unknown as Json,
      })
      .select(SELECT)
      .single();

    if (error) {
      // 23503 = FK violation on category_id → unknown category.
      if (error.code === '23503') return apiError('invalid_request', 400);
      throw new Error(`listing insert failed: ${error.message}`);
    }

    emitServer(
      event('listing_created', {
        category: listing.category_id,
        has_coordinates: listing.latitude !== null && listing.longitude !== null,
      }),
      { distinctId: ctx.appUser.id, userId: ctx.appUser.id },
    );

    return apiOk({ listing }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
