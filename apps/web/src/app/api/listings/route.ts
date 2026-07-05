import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { resolveError } from '@/lib/errors';
import { LISTINGS_PER_WEEK, listingCreateSchema, normalizeBusinessName } from '@/lib/listings';
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
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at';

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

    return apiOk({ listings: page, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Published listings whose normalised name matches — the §18 "already exists" check. */
async function findDuplicates(
  ctx: AuthContext,
  businessName: string,
  city: string | null | undefined,
): Promise<Array<{ id: string; business_name: string; city: string | null }>> {
  const normalized = normalizeBusinessName(businessName);
  const anchor = normalized.split(' ')[0] ?? normalized;
  if (anchor.length < 2) return [];

  let query = ctx.supabase
    .from('business_listings')
    .select('id, business_name, city')
    .eq('status', 'published')
    .ilike('business_name', `%${anchor}%`)
    .limit(25);
  if (city) query = query.ilike('city', city);

  const { data } = await query;
  return (data ?? []).filter((row) => normalizeBusinessName(row.business_name) === normalized);
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
      { distinctId: ctx.appUser.id },
    );

    return apiOk({ listing }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
