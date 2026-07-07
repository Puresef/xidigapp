import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import { attachAuthors, EVENT_COLUMNS, type EventRow } from '@/lib/labs/views';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { z } from 'zod';

/**
 * Space History / activity log (§16): the auditable timeline — promotions,
 * joins/exits, charter completion, settings changes, dormancy events. RLS-scoped
 * (readable to anyone who can read the Space). Read-only surface.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const querySchema = z.object({ cursor: z.string().optional(), limit: pageSizeSchema });

export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    let query = ctx.supabase
      .from('lab_events')
      .select(EVENT_COLUMNS)
      .eq('lab_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1);
    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'id'));

    const { data, error } = await query;
    if (error) throw new Error(`events query failed: ${error.message}`);

    const rows = (data ?? []) as EventRow[];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    const admin = getSupabaseAdmin();
    const items = await attachAuthors(admin, page, 'actor_user_id');
    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}
