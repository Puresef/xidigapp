import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import { BOOKMARK_ENTITY_TYPES } from '@/lib/social/entities';
import { hydrateBookmarks } from '@/lib/social/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The Saved page feed (Phase 4.5). Bookmark rows read under the caller's RLS
 * (own-rows), keyset-paginated newest-first (entity_id is the tiebreaker —
 * the PK has no surrogate id), then hydrated per entity type through the same
 * view helpers the home surfaces use. Entities the caller can no longer read
 * are dropped from the page; their bookmark rows stay (harmless, and the
 * entity may come back).
 */

const querySchema = z.object({
  type: z.enum(BOOKMARK_ENTITY_TYPES).optional(),
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    let query = ctx.supabase
      .from('bookmarks')
      .select('entity_type, entity_id, created_at')
      .eq('user_id', ctx.appUser.id)
      .order('created_at', { ascending: false })
      .order('entity_id', { ascending: false })
      .limit(params.limit + 1);

    if (params.type) query = query.eq('entity_type', params.type);

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'entity_id'));

    const { data, error } = await query;
    if (error) throw new Error(`bookmarks query failed: ${error.message}`);

    const rows = data ?? [];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.entity_id }) : null;

    const items = await hydrateBookmarks(ctx, getSupabaseAdmin(), page);
    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}
