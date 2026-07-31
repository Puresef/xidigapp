import { FeedSkeleton } from '@/components/feed/feed-skeleton';
import { LoadingShell, SkeletonBar, SkeletonTabs } from '@/components/route-loading';

/**
 * /plaza instant loading state (Task 9): mirrors the page shell — title,
 * composer prompt, the six type-filter tabs, then the feed silhouette the
 * client PlazaFeed also uses, so server wait and client fetch look identical.
 */
export default function PlazaLoading() {
  return (
    <LoadingShell titleKey="nav.plaza">
      <SkeletonBar />
      <SkeletonTabs count={6} />
      <FeedSkeleton />
    </LoadingShell>
  );
}
