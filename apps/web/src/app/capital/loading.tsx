'use client';

import { useT } from '@xidig/i18n/react';

import { MaalIndexSkeleton } from '@/components/maal/index-skeleton';

/**
 * State m1 — /capital instant loading state.
 *
 * Mirrors the Maal index's real anchors: the same `<main>` frame, the same h1,
 * the same subtitle, then the chip row and four row silhouettes built from the
 * loaded row's own classes. Arrival replaces the shell without a jump.
 *
 * `/capital/candidates` keeps its own loading.tsx — a segment shell would
 * otherwise show Maal-index rows over a candidate board.
 */
export default function MaalIndexLoading() {
  const t = useT();
  return (
    <main className="xidig-maal-index">
      <header className="xidig-maal-head">
        <span className="xidig-maal-head__lines">
          <h1 className="xidig-auth__title">{t('capital.indexTitle')}</h1>
          <p className="xidig-maal-head__sub">{t('maal.indexSubtitle')}</p>
        </span>
      </header>
      <MaalIndexSkeleton />
    </main>
  );
}
