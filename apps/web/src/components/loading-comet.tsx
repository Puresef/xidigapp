'use client';

import { useT } from '@xidig/i18n/react';

/**
 * Comet loading primitive (brand-rethink adoption): a directional streak —
 * direction implies arrival — instead of a spinner. Color-neutral by
 * construction (var(--x-accent) is the monochrome app accent; gold stays
 * reserved pending the palette decision).
 *
 * Motion rules: the BASE state is a visible static bar with the streak at
 * rest (never an invisible loading state); the sweep animates only under
 * (prefers-reduced-motion: no-preference) AND html:not([data-motion='off'])
 * — the same double gate as every other animated surface.
 */
export function LoadingComet() {
  const t = useT();
  return (
    <p className="xidig-comet" role="status">
      <span className="xidig-comet__track" aria-hidden="true">
        <span className="xidig-comet__streak" />
      </span>
      <span className="xidig-visually-hidden">{t('state.loading')}</span>
    </p>
  );
}
