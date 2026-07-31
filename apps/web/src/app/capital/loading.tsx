import { LoadingComet } from '@/components/loading-comet';
import { LoadingShell, SkeletonTabs } from '@/components/route-loading';

/**
 * /capital instant loading state (Task 9): title + the six status-filter tabs
 * + the ratified page-level comet (candidate lists stay short — no skeleton
 * cards needed here).
 */
export default function CapitalLoading() {
  return (
    <LoadingShell titleKey="capital.indexTitle">
      <SkeletonTabs count={6} />
      <LoadingComet />
    </LoadingShell>
  );
}
