import { LoadingShell } from '@/components/route-loading';

/** /leaderboard instant loading state (Task 9): title + page-level comet. */
export default function LeaderboardLoading() {
  return <LoadingShell titleKey="reputation.leaderboardTitle" />;
}
