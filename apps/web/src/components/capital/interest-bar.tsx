'use client';

import { useId, useState } from 'react';

import type { Enums } from '@xidig/db';
import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { XidigIcon } from '@/components/icons/XidigIcon';
import { ApiRequestError, apiDelete, apiPost } from '@/lib/api-client';
import type { InterestCounts } from '@/lib/capital/views';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Interest bar. Two signals, both non-financial and NEVER gated:
 *  - Support (legacy internal name Garab): a visible count ("142 people support this") + a
 *    toggle. Support is encouragement only — it is not an investment,
 *    a vote, a review, a readiness check or a verification of the venture,
 *    and it unlocks nothing: the count is the same for every viewer whether
 *    or not they support, and the note under the actions says so.
 *    States: "Support" → "Supporting" (described by "Remove support").
 *  - "I can help": a concrete non-financial offer toggle.
 *
 * The invest slot (Maalgeli CTA → fund modal) was removed under A2
 * containment: Xidig does not currently offer investment, so no invest
 * affordance or fund copy renders here at all. help/cosign counts come from
 * candidate_interest_counts (aggregate — no enumeration of who). The viewer's
 * own toggles come from their own-row reads.
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
  const removeHintId = useId();
  const [counts, setCounts] = useState<InterestCounts>(initialCounts);
  const [mine, setMine] = useState<Set<InterestType>>(new Set(initialInterests));
  const [pending, setPending] = useState<InterestType | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  // Ceremony on ACTIVATING support (spec §4) — never on un-toggling.
  const [celebrated, setCelebrated] = useState(0);

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
        if (!active && type === 'cosign') setCelebrated((n) => n + 1);
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

      {/* Support count — visible to every viewer, supported or not.
          The interest_type slug stays 'cosign' (schema + analytics identity). */}
      <p className="xidig-card__body">
        {t('action.garabCount', { count: counts.cosign })}
        {/* Finance surface: the G3 motion doctrine locks Maal/capital marks
            to the static rest frame — provenance is shown by a static trust
            ring on the card, never by an animated mark. `surface="capital"`
            makes the policy, not this call site, enforce that. */}
        {celebrated > 0 ? (
          <AnimatedMark
            key={celebrated}
            mode="celebrate"
            surface="capital"
            size={20}
            className="xidig-celebrate-inline"
          />
        ) : null}
      </p>

      <div className="xidig-capital-interest__actions">
        <button
          type="button"
          className={`xidig-button ${mine.has('cosign') ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={pending !== null}
          aria-pressed={mine.has('cosign')}
          aria-describedby={mine.has('cosign') ? removeHintId : undefined}
          onClick={() => toggle('cosign')}
        >
          {/* D3 dabqaad — Garab is never a like/heart/thumb. Outline = unlit;
              supporting = lit (filled) with the smoke wisps (CSS double-gated).
              Decorative: the visible button text carries the meaning. */}
          <XidigIcon
            name="garab"
            variant={mine.has('cosign') ? 'filled' : 'outline'}
            size={18}
            tone="inherit"
            animateSmoke={mine.has('cosign')}
            className="x-ic--lead"
          />
          {mine.has('cosign') ? t('action.garabActive') : t('action.garab')}
        </button>
        {mine.has('cosign') ? (
          <span id={removeHintId} className="xidig-visually-hidden">
            {t('action.garabRemove')}
          </span>
        ) : null}
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
      <p className="xidig-capital-interest__note">{t('action.garabNote')}</p>
    </section>
  );
}
