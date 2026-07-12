'use client';

import dynamic from 'next/dynamic';

import type { LitePrefs } from '@/lib/lite/prefs';

/**
 * Client boundary that keeps the signed-in Following feed — post/listing cards,
 * media providers, suggested-follows — out of the anonymous `/` bundle
 * (docs/front-door-standard.md §2-E28). The `next/dynamic` must live in a
 * Client Component: measured under Turbopack (Next 16), the same call from the
 * Server Component page hoists the whole feed tree onto anon `/` regardless of
 * the render branch, but from here it stays lazy and loads only for a
 * signed-in viewer. `ssr: true` keeps the feed's server-rendered loading state.
 * Do NOT move this dynamic() back up into the Server Component page.
 */
const FollowingFeed = dynamic(
  () => import('./following-feed').then((m) => m.FollowingFeed),
  { ssr: true },
);

export function FollowingFeedLazy({
  viewerId,
  prefs,
}: {
  viewerId: string;
  prefs?: LitePrefs | undefined;
}) {
  return <FollowingFeed viewerId={viewerId} prefs={prefs} />;
}
