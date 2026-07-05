import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  decodeCursor,
  encodeCursor,
  keysetBefore,
  pageSizeSchema,
} from '@/lib/pagination';

/**
 * Following feed (§13 — Phase 1 acceptance: "Following feed tab appears on
 * Home"). With Plaza posts deferred to Phase 2, the Phase 1 feed content is
 * the activity followed members produce now: their new published business
 * listings, newest first.
 *
 * Source is the `following_listings` SECURITY INVOKER view (migration
 * 20260705020000) — the join happens in the database under the caller's RLS
 * (follows_select_own + listings_select_published), so no follow-id list ever
 * gets serialized into the request (which broke for members following a few
 * hundred people). Keyset-paginated like every list endpoint.
 */

const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

const LISTING_FIELDS =
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at';

interface FeedListingRow {
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

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    // The view isn't in the generated Database types (it's created by a
    // migration); it exposes the same columns as business_listings and is
    // RLS-safe (security_invoker), so a localized cast is sound.
    let query = ctx.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('following_listings' as any)
      .select(LISTING_FIELDS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit);

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'id'));

    const { data, error } = await query;
    if (error) throw new Error(`feed read failed: ${error.message}`);

    const rows = (data ?? []) as unknown as FeedListingRow[];

    // Bylines: resolve owner display cards under the caller's RLS.
    const ownerIds = [...new Set(rows.map((row) => row.owner_user_id).filter(Boolean))];
    const owners = new Map<string, { display_name: string; handle: string }>();
    if (ownerIds.length > 0) {
      const { data: profiles } = await ctx.supabase
        .from('profiles')
        .select('user_id, display_name, handle')
        .in('user_id', ownerIds as string[]);
      for (const profile of profiles ?? []) {
        owners.set(profile.user_id, {
          display_name: profile.display_name,
          handle: profile.handle,
        });
      }
    }

    const items = rows.map((listing) => ({
      type: 'listing' as const,
      listing,
      owner: listing.owner_user_id ? (owners.get(listing.owner_user_id) ?? null) : null,
    }));

    const last = rows.at(-1);
    const nextCursor =
      rows.length === params.limit && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null;

    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}
