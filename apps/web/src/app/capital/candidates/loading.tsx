import { LoadingComet } from '@/components/loading-comet';
import { LoadingShell, SkeletonTabs } from '@/components/route-loading';

/**
 * /capital/candidates instant loading state (Task 9): title + the six
 * status-filter tabs + the ratified page-level comet (candidate lists stay
 * short — no skeleton cards needed here).
 *
 * Its own file because /capital's shell is now the Maal index skeleton
 * (state m1) — a segment-level shell would show venture rows over the
 * candidate board.
 */
export default function CapitalCandidatesLoading() {
  return (
    <LoadingShell titleKey="capital.candidatesTitle">
      <SkeletonTabs count={6} />
      <LoadingComet />
    </LoadingShell>
  );
}
