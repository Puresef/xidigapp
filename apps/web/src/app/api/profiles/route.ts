import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import { applyLocationGranularity, loadLocationGranularities } from '@/lib/profile-view';
import { normalizeSearchName } from '@/lib/search-norm';
import { getSupabaseAdmin } from '@/lib/supabase/server';

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
  openTo: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{0,29}$/)
    .optional(),
  q: z.string().trim().min(1).max(80).optional(),
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

const SELECT =
  'user_id, display_name, handle, bio, location_city, location_country, skills, lanes, verification_status, created_at, avatar_path, avatar_blurhash';

/**
 * user_ids that opted out of the directory (§ privacy settings; absent row =
 * discoverable). Service role — user_settings is own-rows-only under RLS but
 * the exclusion list itself carries no payload. Bounded at 500 — the id list
 * rides the PostgREST query string; if the opt-out set ever outgrows this,
 * the filter moves into a SECURITY DEFINER view / join (noted debt).
 */
async function directoryOptOutIds(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('user_settings')
    .select('user_id')
    .eq('discoverable_directory', false)
    .limit(500);
  if (error) throw new Error(`directory opt-out lookup failed: ${error.message}`);
  return (data ?? []).map((row) => row.user_id);
}

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

    // Directory opt-outs are excluded server-side — hiding in the client
    // would still ship the rows (§ privacy: exclusion is data, not CSS).
    const optOutIds = await directoryOptOutIds();
    if (optOutIds.length > 0) {
      query = query.not('user_id', 'in', `(${optOutIds.join(',')})`);
    }

    // "Open to" chip filter: resolve the member set first (profile_open_to is
    // member-readable under RLS), then constrain the keyset query. Bounded at
    // 500 (query-string budget) — beyond that the filter degrades to the most
    // recently added chips (noted debt).
    if (params.openTo) {
      const { data: openToRows, error: openToError } = await ctx.supabase
        .from('profile_open_to')
        .select('user_id')
        .eq('open_to_id', params.openTo)
        .order('created_at', { ascending: false })
        .limit(500);
      if (openToError) throw new Error(`open-to filter failed: ${openToError.message}`);
      const ids = (openToRows ?? []).map((row) => row.user_id);
      if (ids.length === 0) return apiOk({ profiles: [], nextCursor: null });
      query = query.in('user_id', ids);
    }

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

    // Honor each member's location_granularity before their city/country
    // leaves the server — 'region'/'hidden' rounds it for the whole member
    // base, not only search crawlers (§ privacy settings).
    const granularities = await loadLocationGranularities(page.map((row) => row.user_id));

    // Resolve avatar storage paths to ready-to-render thumb URLs (§22: cards
    // render the 96px pipeline thumb, <8KB) — clients never see raw paths.
    const profiles = page.map(({ avatar_path, ...row }) => {
      const folded = applyLocationGranularity(row, granularities.get(row.user_id) ?? 'city');
      return {
        ...folded,
        avatar_thumb_url: avatar_path ? publicMediaUrl(derivedThumbPath(avatar_path)) : null,
      };
    });

    return apiOk({ profiles, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}
