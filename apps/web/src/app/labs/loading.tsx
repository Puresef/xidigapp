import { CardListSkeleton, LoadingShell, SkeletonTabs } from '@/components/route-loading';

/**
 * /labs instant loading state (Task 9): title + the All/Clubs/Labs/Mine tab
 * row + a card-list silhouette (Spaces are a known card-list shape).
 */
export default function LabsLoading() {
  return (
    <LoadingShell titleKey="lab.listTitle">
      <SkeletonTabs count={4} />
      <CardListSkeleton />
    </LoadingShell>
  );
}
