'use client';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { XidigIcon } from '@/components/icons/XidigIcon';
import type { AuthorRef } from '@/lib/plaza/views';

/**
 * "Socodka codsiga" (frames 1b/2b/3b): three fixed steps. Neutral/accent all
 * the way — the fulfilled step earns the trust treatment ONLY once reached
 * ("the Guul step lights only when earned"). Dots: done = filled accent,
 * current = filled + soft ring, pending = hollow.
 */
export function CodsiTimeline({
  askStatus,
  createdAt,
  helper,
  helpedAt,
  fulfilledAt,
}: {
  askStatus: 'open' | 'in_progress' | 'fulfilled' | 'answered' | 'closed';
  createdAt: string;
  helper: AuthorRef | null;
  helpedAt: string | null;
  fulfilledAt: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const fulfilled = askStatus === 'fulfilled' || askStatus === 'answered';
  const helping = askStatus === 'in_progress';

  const helpedMeta = [
    helper?.display_name,
    helpedAt ? formatRelativeTime(new Date(helpedAt), locale) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const steps = [
    {
      key: 'open',
      label: t('plaza.askOpen'),
      meta: formatRelativeTime(new Date(createdAt), locale),
      state: helping || fulfilled ? 'done' : 'current',
      trust: false,
    },
    {
      key: 'helping',
      label: t('plaza.askInProgress'),
      meta: helpedMeta || null,
      state: helping ? 'current' : fulfilled && helpedAt ? 'done' : fulfilled ? 'skipped' : 'pending',
      trust: false,
    },
    {
      key: 'fulfilled',
      label: t('plaza.askFulfilled'),
      meta: fulfilledAt ? formatRelativeTime(new Date(fulfilledAt), locale) : null,
      state: fulfilled ? 'current' : 'pending',
      trust: fulfilled,
    },
  ] as const;

  return (
    <div className="xidig-card xidig-codsi-rail-card">
      <h2 className="xidig-codsi-rail-card__title">{t('plaza.timelineTitle')}</h2>
      <ol className="xidig-codsi-steps">
        {steps.map((step) => (
          <li
            key={step.key}
            className={`xidig-codsi-step xidig-codsi-step--${step.state}${step.trust ? ' xidig-codsi-step--trust' : ''}`}
          >
            <span className="xidig-codsi-step__dot" aria-hidden="true" />
            <span className="xidig-codsi-step__text">
              <span className="xidig-codsi-step__label">
                {step.label}
                {step.trust ? (
                  <XidigIcon name="guul" variant="filled" size={13} className="x-ic--lead" />
                ) : null}
              </span>
              {step.meta ? <span className="xidig-codsi-step__meta">{step.meta}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
