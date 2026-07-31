import { LoadingShell } from '@/components/route-loading';

/**
 * /events segment loading state (Task 9): title + the ratified page-level
 * comet. Kept title-only simple — this fallback also covers /events/[slug]
 * and /events/new, whose headers differ.
 */
export default function EventsLoading() {
  return <LoadingShell titleKey="events.indexTitle" />;
}
