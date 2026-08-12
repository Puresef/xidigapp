import type { ReactNode } from 'react';

import { formatNumber, type MessageKey } from '@xidig/i18n';

import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { AnigaMetrics } from '@/lib/aniga/view';
import { getLocale, getT } from '@/lib/locale';

import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Tirakoobka — built, and held shut by a platform flag (spec §3.5, A3/A4).
 *
 * The honest version of "not shipped" is a real module wearing a dashed
 * border, a plain state chip, and an eye that is present, `aria-pressed=false`
 * and `disabled` — all of which the shell renders from `lockedByFlag`. What
 * this component owes on top of that is the copy law (ruling 7, endorsed
 * 9 Aug): the note states a system fact — off, platform decision — and never
 * markets it. No "coming soon", no countdown, no waitlist. A member reading
 * this should learn who decided, not be sold a future.
 *
 * Two absences are enforced here rather than left to the caller:
 *  - a visitor never meets a flag-locked module. `publishedModules` already
 *    drops it, but if a caller ever bypassed that projection the shell's own
 *    `locked` guard would strip the dashed frame and the chip and quietly hand
 *    a visitor the counts — the leak A1 exists to prevent.
 *  - no metrics, no module. `getAnigaView` returns null here for visitors
 *    while the flag is off, and a card with three blank slots would be the
 *    zeroed scoreboard every empty state in this spec refuses to draw.
 */

/** Frame order (10a), left to right. */
const STATS: ReadonlyArray<{ labelKey: MessageKey; of: (metrics: AnigaMetrics) => number }> = [
  { labelKey: 'profile.statPosts', of: (metrics) => metrics.posts },
  { labelKey: 'profile.statAsksHelped', of: (metrics) => metrics.asksHelped },
  { labelKey: 'profile.statConnections', of: (metrics) => metrics.connections },
];

export interface MetricsModuleProps {
  /** Null when this viewer may see no counts — the module then renders nothing. */
  metrics: AnigaMetrics | null;
  viewer: ModuleCardProps['viewer'];
  /** `AnigaModuleState.lockedByFlag` — the platform flag is off. */
  lockedByFlag: boolean;
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

export async function MetricsModule({
  metrics,
  viewer,
  lockedByFlag,
  visibilityToggle,
}: MetricsModuleProps) {
  if (!metrics) return null;
  if (lockedByFlag && viewer !== 'owner') return null;

  const t = await getT();
  const locale = await getLocale();

  return (
    <ModuleCard
      moduleId="metrics"
      titleKey={ANIGA_MODULE_TITLE_KEYS.metrics}
      viewer={viewer}
      lockedByFlag={lockedByFlag}
      visibilityToggle={visibilityToggle}
      // The note describes the flag, so it goes when the flag does — left in
      // place with the module live it would state something plainly false.
      footnote={lockedByFlag ? t('profile.metricsNote') : null}
    >
      <ul className="xidig-ametrics__grid">
        {STATS.map((stat) => (
          <li key={stat.labelKey} className="xidig-ametrics__stat">
            <span className="xidig-ametrics__value">{formatNumber(stat.of(metrics), locale)}</span>
            <span className="xidig-ametrics__label">{t(stat.labelKey)}</span>
          </li>
        ))}
      </ul>
    </ModuleCard>
  );
}

export default MetricsModule;
