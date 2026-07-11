import { unstable_cache } from 'next/cache';

import { getFeaturedUpcomingPublicEvent, type EventListItem } from '@/lib/events/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { countFoundingSpotsLeft } from './organic';

/**
 * Cached front-door reads (front-door-plan §4; standard §2-E26): the two
 * FrontHome data points revalidate every 10 minutes — inside the plan's
 * 5–15 minute window — so a warm anonymous request pays zero Supabase
 * round-trips for them.
 *
 * The service client is constructed INSIDE each cached function: a client
 * instance passed as an argument would become part of the cache key, and
 * clients aren't serializable. Nothing else may cross this boundary as an
 * argument either.
 *
 * Failure semantics stay one rung down the resilience ladder: the counter
 * helper swallows errors into `null`, so a failed count renders no counter
 * for at most one revalidate window; the event helper throws, rejections are
 * never cached, and the caller degrades for that request only.
 */
export const FRONT_DOOR_REVALIDATE_SECONDS = 600;

/** Cached founding-spots counter — the is_ai exclusion lives in the helper. */
export const countFoundingSpotsLeftCached = unstable_cache(
  async () => countFoundingSpotsLeft(getSupabaseAdmin()),
  ['front-door-founding-spots'],
  { revalidate: FRONT_DOOR_REVALIDATE_SECONDS },
);

/** Cached "next up" public event card — organic-proof inside the helper. */
export const getFeaturedUpcomingPublicEventCached = unstable_cache(
  async (): Promise<EventListItem | null> => getFeaturedUpcomingPublicEvent(),
  ['front-door-next-event'],
  { revalidate: FRONT_DOOR_REVALIDATE_SECONDS },
);
