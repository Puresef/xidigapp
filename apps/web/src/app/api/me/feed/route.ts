import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { hydrateFeed } from '@/lib/feed/hydrate';
import type { FeedSourceRow } from '@/lib/feed/types';
import { decodeCursor, encodeCursor, pageSizeSchema } from '@/lib/pagination';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Following feed (§13). The PRD feed is broader than Phase 1's listings-only
 * slice: posts + lab updates + listings from the people and Spaces the caller
 * follows (or is a member of). Source is the `following_feed` SECURITY INVOKER
 * view (migration 20260708000000) — the UNION + privacy filtering happen in the
 * database under the caller's RLS, so:
 *   - hidden/removed content and PRIVATE-lab updates never leak (RLS), and
 *   - the caller's muted (user/tag/lab) + blocked sources are excluded on top.
 * No follow-id list is ever serialized into the request.
 *
 * Rows come back ORDERED (sort_ts DESC, item_id DESC) and are keyset-paginated
 * on that same key. The route then hydrates each row BY TYPE into a rich card
 * view (posts via lib/plaza/views, lab updates via lib/labs/views, listings via
 * the listing-card shape), reading base rows under the caller's RLS and using
 * the service role only for cross-user aggregates — same split as /api/posts.
 */

const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

/**
 * PostgREST `.or()` filter for "strictly before" the cursor under the feed's
 * `sort_ts desc, item_id desc` ordering (the view's columns aren't
 * created_at/id, so lib/pagination's keysetBefore doesn't apply verbatim).
 */
function feedKeysetBefore(createdAt: string, id: string): string {
  return `sort_ts.lt.${createdAt},and(sort_ts.eq.${createdAt},item_id.lt.${id})`;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    // The view isn't in the generated Database types (created by a migration);
    // it's RLS-safe (security_invoker) and exposes a fixed column shape, so a
    // localized cast is sound.
    let query = ctx.supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('following_feed' as any)
      .select('item_type, item_id, sort_ts, lab_id')
      .order('sort_ts', { ascending: false })
      .order('item_id', { ascending: false })
      .limit(params.limit + 1);

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(feedKeysetBefore(cursor.createdAt, cursor.id));

    const { data, error } = await query;
    if (error) throw new Error(`feed read failed: ${error.message}`);

    const sourceRows = (data ?? []) as unknown as FeedSourceRow[];
    const hasMore = sourceRows.length > params.limit;
    const pageRows = hasMore ? sourceRows.slice(0, params.limit) : sourceRows;
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.sort_ts, id: last.item_id }) : null;

    const admin = getSupabaseAdmin();
    const items = await hydrateFeed(ctx.supabase, admin, ctx.appUser.id, pageRows);

    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}
