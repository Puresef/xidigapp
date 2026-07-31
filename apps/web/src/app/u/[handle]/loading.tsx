import { LoadingComet } from '@/components/loading-comet';

/**
 * /u/[handle] instant loading state (Task 9): the profile title is the
 * member's name (unknown until loaded), so no shell h1 — just the bare
 * `<main>` frame the page uses and the page-level comet.
 */
export default function ProfileLoading() {
  return (
    <main>
      <LoadingComet />
    </main>
  );
}
