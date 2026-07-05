import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import { normalizeSearchName } from '@/lib/search-norm';

/**
 * Directory search (§18). Member-visible (RLS: profiles_select_authenticated).
 * Filters: skill / lane / country / city / free text (q). Keyset-paginated.
 *
 * `q` is transliteration-tolerant (Phase 1 acceptance: Maxamed ↔ Mohamed):
 * both the stored `search_norm` generated column (migration 20260705010000)
 * and the query term fold through the same normalization, then match by
 * substring. §24's Meilisearch adds ranking/typo-tolerance later; this stays
 * the exact-recall baseline.
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

    // ilike (no wildcards) = case-insensitive whole-string match on these
    // free-text columns — parity with GET /api/listings, so "somalia" and
    // "Somalia" behave the same on both Suuq tabs.
    if (params.country) query = query.ilike('location_country', params.country);
    if (params.city) query = query.ilike('location_city', params.city);
    if (params.skill) query = query.contains('skills', [params.skill]);
    if (params.lane) query = query.contains('lanes', [params.lane]);
    if (params.q) {
      // Folded skeleton is [a-z0-9 ] only — safe inside a PostgREST pattern.
      const folded = normalizeSearchName(params.q);
      if (folded) {
        query = query.ilike('search_norm', `%${folded}%`);
      } else {
        // Nothing alphanumeric survived folding (emoji/other-script input):
        // fall back to the raw contains match rather than returning everyone.
        const term = params.q.replace(/[%,()]/g, ' ');
        query = query.or(`display_name.ilike.%${term}%,handle.ilike.%${term}%`);
      }
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
