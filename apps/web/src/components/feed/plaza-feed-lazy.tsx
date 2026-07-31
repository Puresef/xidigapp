'use client';

import dynamic from 'next/dynamic';

import type { LitePrefs } from '@/lib/lite/prefs';

/**
 * Client boundary for Home's Latest tab, twin of following-feed-lazy.tsx:
 * keeps the Plaza feed tree (post cards, media providers, embeds) out of the
 * anonymous `/` bundle (docs/front-door-standard.md §2-E28 + weight ratchet).
 * See following-feed-lazy.tsx for the Turbopack hoisting gotcha — the
 * `next/dynamic` must live in a Client Component, not the Server Component
 * page. `ssr: true` keeps the server-rendered loading state.
 *
 * Home mounts the feed WITHOUT a composer (/plaza stays the deep surface with
 * composer + type filters), so the empty-state CTA links to /plaza?compose=1
 * (the boots-expanded convention) instead of dispatching COMPOSE_EVENT.
 */
const PlazaFeed = dynamic(() => import('../plaza/plaza-feed').then((m) => m.PlazaFeed), {
  ssr: true,
});

export function PlazaFeedLazy({
  viewerId,
  prefs,
}: {
  viewerId: string;
  prefs?: LitePrefs | undefined;
}) {
  return (
    <PlazaFeed
      viewerId={viewerId}
      lowBandwidth={false}
      prefs={prefs}
      composeHref="/plaza?compose=1"
    />
  );
}
