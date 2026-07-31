import { LoadingComet } from '@/components/loading-comet';
import { LoadingShell, SkeletonTabs } from '@/components/route-loading';

/**
 * /saved instant loading state (Task 9): title + the Posts/Businesses/Spaces
 * tab row + the ratified page-level comet (the tab's client list brings its
 * own inline flap once mounted).
 */
export default function SavedLoading() {
  return (
    <LoadingShell titleKey="saved.title">
      <SkeletonTabs count={3} />
      <LoadingComet />
    </LoadingShell>
  );
}
