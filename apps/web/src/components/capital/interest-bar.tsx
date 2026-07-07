'use client';

import { useState } from 'react';

import type { Enums } from '@xidig/db';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiPost } from '@/lib/api-client';
import type { InterestCounts } from '@/lib/capital/views';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';
import { MaalgeliCta } from './maalgeli-cta';

/**
 * Interest bar (§17). Three signals:
 *  - Garab / Co-sign: social-proof count ("142 co-signs") + a toggle. NEVER
 *    gated, available in every region.
 *  - "I can help": a non-financial offer toggle. NEVER gated.
 *  - Maalgeli (Invest): region-gated — delegated entirely to MaalgeliCta, which
 *    hides itself (informational view) outside Somalia.
 *
 * help/cosign counts come from candidate_interest_counts (aggregate — no
 * enumeration of who). The viewer's own toggles come from their own-row reads.
 */

type InterestType = Enums<'interest_type'>;

interface InterestResponse {
  counts: InterestCounts;
}

export function InterestBar({
  candidateId,
  initialCounts,
  initialInterests,
}: {
  candidateId: string;
  initialCounts: InterestCounts;
  /** interest_type slugs the viewer already expressed. */
  initialInterests: InterestType[];
}) {
  const t = useT();
  const [counts, setCounts] = useState<InterestCounts>(initialCounts);
  const [mine, setMine] = useState<Set<InterestType>>(new Set(initialInterests));
  const [pending, setPending] = useState<InterestType | null>(null);
  const [error, setError] = useState<PlainError | null>(null);

  // help + cosign only — invest is never toggled here (goes through MaalgeliCta).
  function toggle(type: 'help' | 'cosign') {
    if (pending) return;
    const active = mine.has(type);
    void (async () => {
      setPending(type);
      setError(null);
      try {
        // Phase 7: analytics (interest_expressed)
        const res = active
          ? await apiDelete<InterestResponse>(
              `/api/candidates/${candidateId}/interests?type=${type}`,
            )
          : await apiPost<InterestResponse>(`/api/candidates/${candidateId}/interests`, { type });
        setCounts(res.counts);
        setMine((current) => {
          const next = new Set(current);
          if (active) next.delete(type);
          else next.add(type);
          return next;
        });
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(null);
      }
    })();
  }

  return (
    <section className="xidig-section xidig-capital-interest" aria-label={t('capital.interestHeading')}>
      <h2 className="xidig-section__title">{t('capital.interestHeading')}</h2>
      {error ? <PlainErrorBanner error={error} /> : null}

      {/* Social proof — Garab / Co-sign count */}
      <p className="xidig-card__body">{t('capital.cosignCount', { count: counts.cosign })}</p>

      <div className="xidig-capital-interest__actions">
        <button
          type="button"
          className={`xidig-button ${mine.has('cosign') ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={pending !== null}
          aria-pressed={mine.has('cosign')}
          onClick={() => toggle('cosign')}
        >
          {mine.has('cosign') ? t('capital.cosignDone') : t('action.garab')}
        </button>
        <button
          type="button"
          className={`xidig-button ${mine.has('help') ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={pending !== null}
          aria-pressed={mine.has('help')}
          onClick={() => toggle('help')}
        >
          {mine.has('help') ? t('capital.canHelpDone') : t('capital.canHelp')}
        </button>
      </div>

      {/* Region-gated invest — hides itself outside Somalia */}
      <MaalgeliCta candidateId={candidateId} />
    </section>
  );
}
