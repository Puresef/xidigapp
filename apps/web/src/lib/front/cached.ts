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
 *
 * Fail-FAST, not just fail-soft: a warm request must never wait on a stalled
 * DB. `unstable_cache` bounds round-trips on warm hits, but a cache MISS (cold
 * start, post-revalidate, or an unreachable DB where the driver retries with
 * backoff) would otherwise let a streamed read hang for seconds — the exact
 * "skeleton-flash because a count query hiccuped" the plan forbids (§4). Each
 * read is therefore raced against a short deadline OUTSIDE the cache: on
 * timeout the request degrades to the absent state (null) for that request
 * only, while the underlying `unstable_cache` promise keeps running and
 * populates the entry for the next warm hit. The degraded value is never
 * cached. Against a reachable DB the reads resolve in single-digit ms and the
 * deadline never bites.
 */
export const FRONT_DOOR_REVALIDATE_SECONDS = 600;

/**
 * Per-request read deadline (ms). A warm read is ~single-digit ms; this only
 * bites when the DB is unreachable/stalled, bounding front-door TTFB to the
 * static shell + this deadline rather than the driver's retry backoff.
 */
export const FRONT_DOOR_READ_DEADLINE_MS = 600;

/** Resolve to `fallback` if `p` hasn't settled within the deadline. The
 *  abandoned promise keeps running (it may still populate the cache); its
 *  eventual rejection is swallowed so it can't surface as an unhandled one.
 *  Exported for unit tests; `deadlineMs` defaults to the front-door deadline. */
export function withDeadline<T>(
  p: Promise<T>,
  fallback: T,
  deadlineMs: number = FRONT_DOOR_READ_DEADLINE_MS,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), deadlineMs);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

const countFoundingSpotsLeftCore = unstable_cache(
  async () => countFoundingSpotsLeft(getSupabaseAdmin()),
  ['front-door-founding-spots'],
  { revalidate: FRONT_DOOR_REVALIDATE_SECONDS },
);

const getFeaturedUpcomingPublicEventCore = unstable_cache(
  async (): Promise<EventListItem | null> => getFeaturedUpcomingPublicEvent(),
  ['front-door-next-event'],
  { revalidate: FRONT_DOOR_REVALIDATE_SECONDS },
);

/** Cached founding-spots counter — the is_ai exclusion lives in the helper;
 *  deadline-bounded so an unreachable DB degrades to "no counter" fast. */
export function countFoundingSpotsLeftCached(): Promise<number | null> {
  return withDeadline(countFoundingSpotsLeftCore(), null);
}

/** Cached "next up" public event card — organic-proof inside the helper;
 *  deadline-bounded so an unreachable DB degrades to "no card" fast. */
export function getFeaturedUpcomingPublicEventCached(): Promise<EventListItem | null> {
  return withDeadline(getFeaturedUpcomingPublicEventCore(), null);
}
