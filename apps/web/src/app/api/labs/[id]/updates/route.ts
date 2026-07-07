import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId, requireLabContributor } from '@/lib/labs-api';
import { updateCreateSchema } from '@/lib/labs/schemas';
import { addUpdate } from '@/lib/labs/service';
import { attachAuthors, UPDATE_COLUMNS, type UpdateRow } from '@/lib/labs/views';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { z } from 'zod';

/**
 * Space updates (§16 weekly updates). GET lists published updates the caller
 * can see (RLS-scoped); POST creates one and, when a collaboration is named,
 * cross-posts a mirror to the linked Space. Contributors only (an observer
 * reads but does not post); writes are service-role after the authz check.
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
      .from('lab_updates')
      .select(UPDATE_COLUMNS)
      .eq('lab_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1);
    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'id'));

    const { data, error } = await query;
    if (error) throw new Error(`updates query failed: ${error.message}`);

    const rows = (data ?? []) as UpdateRow[];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    const admin = getSupabaseAdmin();
    const items = await attachAuthors(admin, page, 'author_user_id');
    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = updateCreateSchema.parse(await request.json());

    const lab = await loadLabForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    await requireLabContributor(ctx, admin, lab);

    const { id: updateId } = await addUpdate(admin, lab, ctx.appUser.id, input);
    return apiOk({ id: updateId }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
