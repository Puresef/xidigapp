import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { getAuthContext } from '@/lib/auth/guards';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import {
  searchLabs,
  searchListings,
  searchPeople,
  searchPosts,
  type SearchClients,
} from '@/lib/search-view';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Global search (Phase 4.5 DISCOVERY, §18/§24-baseline; extras item 3). One
 * box → grouped results: people, business listings, Spaces, Plaza posts —
 * top 5 per group. The UI renders the groups as URL-driven tabs (?type=).
 *
 * All projection/visibility rules — who may see which rows per entity, per
 * caller class — live in lib/search-view.ts, where search-view.test.ts pins
 * them per entity (search is the classic RLS leak path). Summary:
 * - Members search under their own RLS + the discovery-only exclusions
 *   (directory opt-outs, unlisted Spaces, non-active accounts, the
 *   location-granularity fold).
 * - Visitors get the §28 narrow public projections via the service role:
 *   published/public/listed only, active owners only, organic
 *   (source='member', no AI accounts) only. Posts are members-only in v1
 *   (§28), so the group is empty for visitors.
 * - Blocked account states (suspended/deactivated/deleted) degrade to the
 *   anonymous projections (parity with /labs/[slug]).
 *
 * Ordering is transparent and labeled in the UI: text match recall, newest
 * first (Spaces: latest activity) — never a hidden ranking.
 *
 * Privacy: `search_performed` carries only a result count — the query text is
 * NEVER logged or emitted (PII guard: names are searched here).
 */

const RATE_RULE = { max: 30, windowSeconds: 60 };

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export async function GET(request: Request): Promise<Response> {
  try {
    // Per-IP (not per-user): the route is public, and the limit exists to
    // stop scraping — 30/min matches interactive use.
    await enforceRateLimit(`search:${clientIp(request)}`, RATE_RULE);

    const { q } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    // Public route: signed-out proceeds with the public projections; blocked
    // account states degrade to the same (parity with /labs/[slug]).
    const auth = await getAuthContext();
    const blocked =
      auth !== null &&
      (auth.appUser.status === 'suspended' ||
        auth.appUser.status === 'deactivated' ||
        auth.appUser.status === 'deleted');
    const ctx = auth !== null && !blocked ? auth : null;

    const clients: SearchClients = {
      member: ctx ? ctx.supabase : null,
      memberUserId: ctx ? ctx.appUser.id : null,
      admin: getSupabaseAdmin(),
    };

    const [people, listings, labs, posts] = await Promise.all([
      searchPeople(clients, q),
      searchListings(clients, q),
      searchLabs(clients, q),
      searchPosts(clients, q),
    ]);

    // Count only — the query text is names/PII and never leaves this handler.
    if (ctx) {
      emitServer(
        event('search_performed', {
          result_count: people.length + listings.length + labs.length + posts.length,
        }),
        { distinctId: ctx.appUser.id, userId: ctx.appUser.id },
      );
    }

    return apiOk({ people, listings, labs, posts });
  } catch (error) {
    return handleApiError(error);
  }
}
