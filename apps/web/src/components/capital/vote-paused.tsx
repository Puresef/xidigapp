'use client';

import { useT } from '@xidig/i18n/react';

/**
 * Candidate vote — PAUSED (Xidig Plus doctrine, owner 12 Sep: "pause, don't
 * broaden"). Replaces the interactive vote panel.
 *
 * The vote used to be gated on the paid tier. Xidig Plus must not decide voting
 * eligibility, and no non-paid eligibility model is approved yet, so every
 * signed-in member sees the same neutral state:
 *   - "under review", never "requires Xidig Plus";
 *   - no ballot buttons and no upgrade prompt;
 *   - no tally. Live counts are hidden while the vote is paused, and the page
 *     receives none (lib/capital/views.ts projects no tally).
 */
export function CandidateVotePaused() {
  const t = useT();
  return (
    <section className="xidig-section xidig-capital-vote" aria-label={t('capital.voteHeading')}>
      <h2 className="xidig-section__title">{t('capital.voteHeading')}</h2>
      <p className="xidig-card__meta">{t('capital.voteSignalNote')}</p>
      <p className="xidig-card__meta">{t('capital.voteEligibilityNote')}</p>
    </section>
  );
}
