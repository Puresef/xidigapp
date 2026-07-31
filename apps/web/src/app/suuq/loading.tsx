import { CardListSkeleton, LoadingShell, SkeletonTabs } from '@/components/route-loading';

/**
 * /suuq instant loading state (Task 9): title + the People/Businesses/Map tab
 * row + a card-list silhouette (the directory is a known list shape).
 */
export default function SuuqLoading() {
  return (
    <LoadingShell titleKey="nav.suuq">
      <SkeletonTabs count={3} />
      <CardListSkeleton />
    </LoadingShell>
  );
}
