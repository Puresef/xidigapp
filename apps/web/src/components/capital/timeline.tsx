import { formatRelativeTime } from '@xidig/i18n';
import type { MessageKey } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import type { TimelineMilestone } from '@/lib/capital/views';

/**
 * Venture timeline / build-log (§17). The lifecycle milestones the view builds
 * from the candidate's timestamp columns (created → submitted → decided →
 * funded). Non-financial — safe in every region and on the public projection.
 */

const MILESTONE_KEYS: Record<TimelineMilestone['key'], MessageKey> = {
  created: 'capital.timelineCreated',
  submitted: 'capital.timelineSubmitted',
  decided: 'capital.timelineDecided',
  funded: 'capital.timelineFunded',
};

export function Timeline({ milestones }: { milestones: TimelineMilestone[] }) {
  const t = useT();
  const { locale } = useLocale();

  if (milestones.length === 0) return null;

  return (
    <section className="xidig-section xidig-capital-timeline">
      <h2 className="xidig-section__title">{t('capital.timelineHeading')}</h2>
      <ol className="xidig-capital-timeline__list">
        {milestones.map((m) => (
          <li key={m.key} className="xidig-capital-timeline__item">
            <span className="xidig-card__body">{t(MILESTONE_KEYS[m.key])}</span>{' '}
            <span className="xidig-card__meta">{formatRelativeTime(new Date(m.at), locale)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
