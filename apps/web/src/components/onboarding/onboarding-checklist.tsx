import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import type { ChecklistItemKey, OnboardingProgress } from '@/lib/onboarding/progress';

import { DismissChecklistButton } from './dismiss-checklist-button';

/**
 * First-session onboarding checklist (§20): a progress meter + the next useful
 * action per step. Renders nothing once dismissed or fully complete, so it
 * fades out of Home the moment the member is set up. Server component — strings
 * resolve via getT(); the dismiss control is a small client child.
 */

const LABEL_KEYS: Record<ChecklistItemKey, MessageKey> = {
  profile: 'onboarding.completeProfile',
  lanes: 'onboarding.pickLanes',
  follow: 'onboarding.followThree',
  post: 'onboarding.firstPost',
  password: 'onboarding.setPassword',
};

export async function OnboardingChecklist({ progress }: { progress: OnboardingProgress }) {
  if (progress.dismissed || progress.allDone) return null;

  const t = await getT();
  const percent = Math.round((progress.completed / progress.total) * 100);

  return (
    <section className="xidig-section xidig-card" aria-label={t('onboarding.checklistTitle')}>
      <div className="xidig-card__body">
        <p className="xidig-completion__row">
          <span className="xidig-completion__title">{t('onboarding.checklistTitle')}</span>
          <span className="xidig-completion__percent">
            {t('onboarding.progress', { completed: progress.completed, total: progress.total })}
          </span>
        </p>
        <div
          className="xidig-completion__bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('onboarding.checklistTitle')}
        >
          <div className="xidig-completion__fill" style={{ width: `${percent}%` }} />
        </div>
        <ul className="xidig-invite-list">
          {progress.items.map((item) => (
            <li key={item.key} className="xidig-invite-list__item">
              {item.done ? (
                <span className="xidig-checklist__done" aria-hidden={false}>
                  ✓ {t(LABEL_KEYS[item.key])}
                </span>
              ) : (
                <Link href={item.href}>{t(LABEL_KEYS[item.key])} →</Link>
              )}
            </li>
          ))}
        </ul>
        <DismissChecklistButton label={t('onboarding.dismiss')} />
      </div>
    </section>
  );
}
