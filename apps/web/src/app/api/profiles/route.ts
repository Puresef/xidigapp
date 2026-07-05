import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';

/**
 * Directory search (§18). Member-visible (RLS: profiles_select_authenticated).
 * Filters: skill / lane / country / city / free text (q). Keyset-paginated.
 *
 * This is the Postgres-backed baseline; §24 makes Meilisearch the real
 * fuzzy/transliteration search layer (Maxamed/Mohamed). `q` here is a simple
 * prefix/contains match — good enough for exact-ish lookups until the search
 * index is wired.
 */

const querySchema = z.object({
  skill: z.string().trim().min(1).max(40).optional(),
  lane: z.string().trim().min(1).max(40).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  q: z.string().trim().min(1).max(80).optional(),
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

const SELECT =
  'user_id, display_name, handle, bio, location_city, location_country, skills, lanes, verification_status, created_at';

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    let query = ctx.supabase
      .from('profiles')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .order('user_id', { ascending: false })
      .limit(params.limit + 1);

    if (params.country) query = query.eq('location_country', params.country);
    if (params.city) query = query.eq('location_city', params.city);
    if (params.skill) query = query.contains('skills', [params.skill]);
    if (params.lane) query = query.contains('lanes', [params.lane]);
    if (params.q) {
      const term = params.q.replace(/[%,()]/g, ' ');
      query = query.or(`display_name.ilike.%${term}%,handle.ilike.%${term}%`);
    }

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'user_id'));

    const { data, error } = await query;
    if (error) throw new Error(`directory query failed: ${error.message}`);

    const rows = data ?? [];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.user_id }) : null;

    return apiOk({ profiles: page, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}
