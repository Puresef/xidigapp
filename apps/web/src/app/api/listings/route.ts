import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { resolveError } from '@/lib/errors';
import { LISTINGS_PER_WEEK, listingCreateSchema, normalizeBusinessName } from '@/lib/listings';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { getT } from '@/lib/locale';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import { enforceRateLimit } from '@/lib/rate-limit';

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
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at, opening_hours, price_range, primary_photo_path, primary_photo_blurhash, primary_photo_alt, photo_count';

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
  bbox: bboxSchema.optional(),
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    let query = ctx.supabase
      .from('business_listings')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1);

    if (params.category) query = query.eq('category_id', params.category);
    if (params.city) query = query.ilike('city', params.city);
    if (params.country) query = query.ilike('country', params.country);
    if (params.verification === 'verified') query = query.eq('verification_status', 'verified');
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

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'id'));

    const { data, error } = await query;
    if (error) throw new Error(`listings query failed: ${error.message}`);

    const rows = data ?? [];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    // Storage paths → public CDN URLs server-side: clients never build
    // storage URLs (that would need server env). Thumb by the Phase 4.5
    // `{path}_thumb.webp` pipeline convention.
    const listings = page.map((row) => ({
      ...row,
      primary_photo_url: row.primary_photo_path ? publicMediaUrl(row.primary_photo_path) : null,
      primary_photo_thumb_url: row.primary_photo_path
        ? publicMediaUrl(derivedThumbPath(row.primary_photo_path))
        : null,
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
